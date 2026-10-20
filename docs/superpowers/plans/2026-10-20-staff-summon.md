# 할머니의 옛 친구들 — 가게 직원과 소환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 할미의 옛 친구 12명을 엽서(소환)로 모으고, 밤 장사 자리에 앉혀 데이브식 능력치대로 일하게 하며, 정산이 그 도움을 검증한다.

**Architecture:** 명단·능력치·확률은 `shared/content/staff.ts`와 `BALANCE.staff`, 서버 규칙(엽서·배치·각성)은 `shared/staff/actions.ts`, 직원이 밤에 주는 배율은 순수 함수 `shared/staff/effects.ts`(정산과 밤 상태가 같은 식을 씀). 밤 상태 `Shift`는 직원(`helpers`)을 걸려 일하게 한다. 화면은 수첩 앱 "옛 친구들"과 3D·2D 가게.

**Tech Stack:** TypeScript, React, three.js/Phaser, Verse8 game server(공유 `applyAction`), vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-staff-summon-design.md` (승인 2026-10-20)

## Global Constraints

- 명단 12명(id·이름·등급·고유 스킬)은 설계 3장 그대로. 등급 수: 일반 4, 희귀 4, 영웅 2, 전설 2.
- 확률: 전설 1% · 영웅 5% · 희귀 25% · 일반 69%, 등급 안은 균등. 천장: 전설 없이 99번 → 100번째 전설 확정. 10장 묶음은 영웅 이상 1명 보장. 값: 1장 30, 10장 270 황금 숯. 첫 엽서 1장 무료(계정당 1회). 중복은 조각 1(전설 3).
- 뽑기·천장·조각·차감은 서버(`applyAction`, `ctx.random`). 확률표는 게임 안에 그대로 보인다.
- 능력치 4개(서빙·요리·손재주·매력, 1~100), 자리 5개(serve·kitchen·drinks·coal·clean). 직원 칸 업그레이드 `staffSlots`: base 1, costs [1500, 4000](최대 3).
- 각성: 별 1~20, 별마다 능력치 ×1.1, 비용 = 조각 `max(1, ceil(별/2))` + 골드 `200 × 별²`(기존 각성 골드와 같은 식, 제 판단). 황금 숯 아님.
- 장사 중·사냥 중에는 배치·각성 거부(`wrong_stage`). 장사를 열 때 배치를 `service.staff`에 고정.
- 황금 숯을 모르는 세이브(`knowsCharcoal`)에서는 무료 엽서만 보이고 유료 엽서·상점 버튼 숨김.
- 그림은 승인 전 대역(기존 승인 그림 + 이름표), 새 그림은 Codex → 도트 변환 → 승인. 서버 행동이 바뀌므로 `npm run test:server`(isolated-vm 오류 창 미리 알림). 커밋 끝 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, 태스크마다 점검표 후 두 원격 푸시.

## Review Focus

- **엽서를 연타하거나 응답이 늦어 다시 보냄**: 숯이 두 번 빠지면 안 됨 → Task 2 `summon`에 `pullId` 중복 무시 + 테스트 `applies one pullId once`, Task 5 보내는 동안 버튼 잠금.
- **배치해 둔 직원으로 장사를 연 뒤 새로고침**: 정산 검증이 그날 밤 배치를 써야 함(그 사이 배치를 바꿀 수 없음) → Task 3 테스트 `settles with the roster the shop opened with`.
- **직원이 앉은 밤에 아주 빨리 나른 접시**: 주방 보조 배율로 줄어든 최소 대기는 통과, 그보다 빠르면 거절 → Task 3 테스트 두 개.
- **손주와 직원이 같은 접시·자리를 잡음**: 한 접시를 둘이 나르거나 같은 잔반을 둘이 닦으면 안 됨 → Task 4 테스트 `never takes what the waiter is carrying or scrubbing`.
- **예전 세이브**(직원 필드 없음, 장사 중이던 것 포함): 빈 명단·무료 엽서 남음, 장사 중이면 `service.staff = {}` → Task 1 테스트 `reads an older save with no friends`.

---

### Task 1: 명단·능력치·저장

**Files:**
- Create: `shared/content/staff.ts`, `shared/content/staff.test.ts`
- Modify: `shared/balance.ts`(`staff`, `upgrades.staffSlots`), `shared/content/upgrades.ts`(`"staffSlots"`), `shared/growth.ts`(`staffSlots`), `shared/save.ts`(+test), `src/screens/Upgrades.tsx`(가게 탭에 `staffSlots`), `src/i18n/ko.ts`, `src/i18n/en.ts`

**Interfaces:**
- Produces:
  - `export const STAFF_IDS = ["park","sundeok","kkaebi","dallae","hongmae","soedol","ppareun","ggultteok","jang","baekhwa","baekdu","mumyeong"] as const; export type StaffId`; `isStaffId(v): v is StaffId`
  - `export type Rarity = "common" | "rare" | "hero" | "legend"`; `export type Stat = "serving" | "cooking" | "dexterity" | "charm"`; `export const POSITIONS = ["serve","kitchen","drinks","coal","clean"] as const; export type Position`
  - `export const STAFF: Record<StaffId, { rarity: Rarity; stats: Record<Stat, number> }>` — 숫자(제 판단, 합 140/190/240/300):

| id | 서빙 | 요리 | 손재주 | 매력 |
|---|---|---|---|---|
| park | 20 | 30 | 70 | 20 |
| sundeok | 30 | 30 | 55 | 25 |
| kkaebi | 45 | 20 | 35 | 40 |
| dallae | 25 | 25 | 60 | 30 |
| hongmae | 40 | 30 | 75 | 45 |
| soedol | 35 | 45 | 85 | 25 |
| ppareun | 90 | 25 | 40 | 35 |
| ggultteok | 35 | 50 | 40 | 65 |
| jang | 30 | 120 | 60 | 30 |
| baekhwa | 60 | 30 | 50 | 100 |
| baekdu | 60 | 70 | 70 | 100 |
| mumyeong | 100 | 100 | 60 | 40 |

  (100을 넘는 값은 각성 전 기본값으로 허용, 효과 공식이 상한을 둔다.)
  - `export function statOf(id: StaffId, stat: Stat, stars: number): number` = `round(STAFF[id].stats[stat] × 1.1^stars)`
  - `BALANCE.staff = { rates: { legend: 0.01, hero: 0.05, rare: 0.25, common: 0.69 }, pity: 100, cost: { one: 30, ten: 270 }, shards: { dupe: 1, dupeLegend: 3 } }`
  - `SaveData.staff: { owned: Partial<Record<StaffId, { shards: number; stars: number }>>; roster: Partial<Record<Position, StaffId>>; pulls: number; sinceLegend: number; freeUsed: boolean; pullIds: string[] }`; `PendingService.staff: Partial<Record<Position, { id: StaffId; stars: number }>>`
  - `staffSlots(save) → 1 | 2 | 3`
  - 문자열: `staff.name.<id>`, `staff.skill.<id>`, `staff.story.<id>`(설계 3장 문구), `staff.pos.<position>`(서빙·주방 보조·음료·숯·정리), `staff.stat.<stat>`, `staff.rarity.<rarity>`(일반·희귀·영웅·전설), `upgrade.staffSlots`("직원 칸"), `upgrade.fx.staffSlots`("직원 {a}명 → {b}명").
- [ ] **Step 1: 실패하는 테스트** — `staff.test.ts`: 등급 수 4/4/2/2, 합이 등급마다 140/190/240/300, `statOf("jang","cooking",2)`=145. `save.test.ts` `reads an older save with no friends`: 직원 필드 없는 세이브 → `staff = { owned:{}, roster:{}, pulls:0, sinceLegend:0, freeUsed:false, pullIds:[] }`, 장사 중이면 `service.staff = {}`; 잘못된 id·자리는 버림.
- [ ] **Step 2: 실패 확인**, **Step 3: 구현**, **Step 4: `npm test`·`npm run typecheck` 통과**
- [ ] **Step 5: 커밋** `feat(staff): Grandma's old friends — the roster, their stats, the staff-slot upgrade and the save`

### Task 2: 서버 — 엽서·배치·각성

**Files:**
- Create: `shared/staff/actions.ts`, `shared/staff/actions.test.ts`
- Modify: `shared/actions.ts`(행동 3개), i18n(`error.no_shards`, `error.slot_full`)

**Interfaces:**
- Consumes: Task 1 전부.
- Produces:
  - `export function rollRarity(rand: () => number, sinceLegend: number, guaranteeHero: boolean): Rarity` — `sinceLegend >= pity - 1`이면 legend, `guaranteeHero`이고 굴린 값이 common/rare면 hero.
  - 행동 `{ type: "summon"; count: 1 | 10; free?: boolean; pullId: string }` → `{ save; error? }`, 결과 세이브에 `lastPull: StaffId[]`는 두지 않고 클라이언트는 `owned` 차이로 보여 준다(새로 온 사람 = 이전 세이브와 비교). 무료: `count === 1 && !freeUsed`. 유료: 30/270 숯, 부족 `no_charcoal`. 10장은 마지막 장에서 그 묶음에 영웅 이상이 없으면 보장. 처음이면 `owned[id] = { shards: 0, stars: 0 }`, 중복이면 `shards += dupe`(전설 3). `pulls += count`, `sinceLegend`는 전설이면 0 아니면 +1. 같은 `pullId`(최근 20개 기억)면 그대로 반환.
  - 행동 `{ type: "assignStaff"; position: Position; staffId: StaffId | null }` — 장사·사냥 중 `wrong_stage`, 가진 사람만(`not_owned`), 한 사람은 한 자리(다른 자리에 있으면 옮김), 칸 수 넘으면 `slot_full`.
  - 행동 `{ type: "awakenStaff"; staffId: StaffId; from: number }` — 기존 `awaken`처럼 `from` 확인, 비용 조각·골드, `no_shards`/`no_gold`/`max_stars`, 장사·사냥 중 `wrong_stage`.
- [ ] **Step 1: 실패하는 테스트**
  - `follows the published rates`: 시드 고정 `rand`로 10만 번 `rollRarity(rand, 0, false)` → 전설 0.8~1.2%, 영웅 4.5~5.5%, 희귀 24~26%, 일반 68~70%.
  - `gives a legend on the hundredth postcard without one`, `guarantees a hero or better in ten`.
  - `gives the first postcard free once`, `charges 30 and 270 golden charcoal, refuses without enough`.
  - `turns a repeat into shards (three for a legend)`, `applies one pullId once`.
  - `assigns within the slots, moves a friend between positions, refuses during the night or the hunt or someone not owned`.
  - `awakens with shards and gold`.
- [ ] **Step 2: 실패 확인**, **Step 3: 구현**, **Step 4: `npm test`, `npm --prefix server run typecheck`, `npm run test:server`**
- [ ] **Step 5: 커밋·푸시** `feat(staff): postcards (published rates, a legend by the hundredth, a hero in every ten, the first one free), assigning and awakening, all on the server`

### Task 3: 직원이 밤에 주는 배율과 정산 검증

**Files:**
- Create: `shared/staff/effects.ts`, `shared/staff/effects.test.ts`
- Modify: `shared/actions.ts`(`openShop`이 `service.staff` 고정), `shared/service/plan.ts`(`planService` opts `extra?: number`), `shared/service/settle.ts`, `src/screens/DayFlow.tsx`(`Night`이 같은 배율), `shared/service/actions.test.ts`

**Interfaces:**
- Produces: `export interface StaffEffects { cookMul: number; patienceMul: number; extraGuests: number; tipMul: number; coalMul: number; calm: boolean }`, `export function staffEffects(staff: PendingService["staff"]): StaffEffects` — 공식(제 판단):
  - `cookMul = max(0.5, (1 − 요리(주방 보조)/250) × (장 씨가 있으면 0.85))` — 하한 0.5는 마지막에. 무명은 서빙 자리여도 주방 보조로도 친다(둘이면 요리가 높은 쪽).
  - `patienceMul = 1 + 모든 직원 매력 합/1000` + 꿀떡 할매 0.15 + 백두옹 0.25.
  - `extraGuests = 백화 ? 2 : 0`, `tipMul = 백화 ? 1.3 : 1`, `coalMul = 쇠돌이 ? 0.8 : 1`, `calm = 백두옹`.
- 정산: 최소 대기 `RECIPES[dish].cookMs × cookMul`, 최대 대기 `patienceMs × patienceMul × (calm ? 1.5 : 1)`, 팁 `× tipMul`, 손님 계획 `planService(seed, { …, menu: planMenu, extra: extraGuests })`(손님 수 상한 `maxCustomers`까지).
- [ ] **Step 1: 실패하는 테스트** — `effects.test.ts`: 배율 공식 값(장 씨 주방 보조 → `(1−120/250)×0.85 = 0.442` → 하한 `0.5`, 꿀떡 할매+백두옹 `patienceMul = 1 + (65+100)/1000 + 0.15 + 0.25 = 1.565`). `actions.test.ts`: `settles with the roster the shop opened with`(연 뒤 배치를 바꿔도 정산이 `service.staff`를 씀), `accepts a plate cooked faster with a kitchen helper`, `refuses one faster than even the helper allows`, `counts Baekhwa's extra guests`.
- [ ] **Step 2: 실패 확인**, **Step 3: 구현**, **Step 4: `npm test`, `npm run test:server`**
- [ ] **Step 5: 커밋·푸시** `feat(staff): what tonight's friends change (cooking, patience, guests, tips, charcoal), fixed when the shop opens and checked by the settlement`

### Task 4: 밤 상태 — 직원이 걸으며 일하기

**Files:**
- Modify: `src/game/service/shift.ts`(+test), `src/game/service/types.ts`(`ServiceData.staff`)

**Interfaces:**
- Consumes: Task 1 `statOf`, `Position`; Task 3 `staffEffects`.
- Produces:
  - `ShiftConfig.staff: Partial<Record<Position, { id: StaffId; stars: number }>>`; `ShiftState.helpers: Helper[]`, `Helper = { id: StaffId; job: Position; x: number; facing: 1 | -1; carry: TrayItem[]; busyMs: number; target: string | null }`(주방 보조는 걷지 않음).
  - 이동 속도 `SV.walk.speed × (0.5 + 서빙/100)`(빠른발 ×1.2). 서빙: 창구에서 기다리는 손님이 있는 요리 한 접시를 집어(꼬마 깨비는 둘까지) 그 손님에게 → 기존 `give`와 같은 이벤트. 음료: 음료가 필요하면 수레에서 `fillMs` 동안 따르고 판정(PERFECT 확률 `손재주/150`, BAD 확률 `max(0, 0.3 − 손재주/300)`, 달래는 BAD 없음, 홍매는 PERFECT +0.2), 그 손님에게. 숯: 숯이 40 밑이면 숯통에서 80까지(누를 때마다 `press`, 간격 `pressMs`). 정리: 더러운 자리로 가서 닦음(간격 `scrub.pressMs × (1.5 − 손재주/100)`, 순덕 이모는 한 번에 끝). 박 영감은 어느 자리든 숯이 20 밑이면 숯 일을 먼저.
  - 조리 시간 `cookMs × cookMul`, 숯 소모 `× coalMul`, 손님 인내심 `× patienceMul`, 백두옹: 화나서 나가려는 첫 손님의 `waitedMs`를 절반으로 되돌림(밤에 한 번, 이벤트 `{ type: "calmed"; guest }`).
  - 손주가 들고 있거나 손주 앞(`target()`)에 있는 접시·자리는 직원이 잡지 않는다.
- [ ] **Step 1: 실패하는 테스트**(`shift.test.ts` 새 describe): `a serving friend carries a ready plate to its guest`, `a kitchen helper cooks faster`, `a drinks friend pours and carries tea`, `a charcoal friend keeps the box up`, `a cleaning friend scrubs leftovers`, `never takes what the waiter is carrying or scrubbing`, `Baekdu calms the first guest about to storm out`.
- [ ] **Step 2: 실패 확인**, **Step 3: 구현**, **Step 4: `npm test`**
- [ ] **Step 5: 커밋** `feat(staff): friends at work in the night — serving, kitchen help, drinks, charcoal, clearing`

### Task 5: 수첩 앱 "옛 친구들" — 명단·배치·엽서·각성

**Files:**
- Create: `src/screens/hud/Friends.tsx`, `src/screens/hud/friends.css`
- Modify: `src/screens/hud/hud.ts`(`App`에 `"friends"`, 수첩 7칸), `src/screens/hud/Notebook.tsx`(왼쪽 4·오른쪽 3, 줄 높이 22 art), `src/screens/DayFlow.tsx`, `src/screens/tips.ts`(`TipId` `"friends"`), i18n

**Interfaces:**
- Consumes: Task 1·2.
- Produces: `export function Friends({ save, busy, act, onShop, onClose })` — 탭 3개: **친구들**(가진 사람 카드: 대역 초상·이름·등급·별·조각, 능력치 막대 4개, 고유 스킬, 할미와 한 줄, 각성 버튼; 없는 사람은 실루엣과 등급만), **자리**(5자리, 칸 수만큼 열림, 사람 고르기), **엽서**(무료 1장 / 1장 30 / 10장 270, 확률표, "전설까지 n장", 황금 숯을 모르면 무료만). 엽서 결과: 카드가 한 장씩 뒤집히며(새 사람은 "새 친구!", 중복은 "조각 +n").
- 수첩 앱 그림은 대역(`app_upgrade` 등 기존 승인 그림), 첫 열람 때 뚜껑이 한 줄 `tip.friends` "할미 수첩에 엽서 한 장 남았껑. 옛 친구한테 띄워 보껑."(승인 대상).
- [ ] **Step 1: `hud.test.ts`** `lists seven apps with the friends`, **Step 2: 실패 확인**, **Step 3: 구현**, **Step 4: 통과**
- [ ] **Step 5: 확인** — 1280×720: 수첩 7칸(겹침 없음), 무료 엽서 → 카드 → 배치 → 각성 버튼, 황금 숯을 아는 세이브의 유료 엽서·확률표.
- [ ] **Step 6: 커밋·푸시** `feat(staff): Grandma's notebook gets "old friends" — the cards, the positions, the postcards with their rates, awakening`

### Task 6: 가게에서 보이기

**Files:**
- Modify: `src/game/shop3d/look.ts`(+test), `src/game/shop3d/ShopView.ts`, `src/game/shop3d/ShopHud.tsx`, `src/game/service/ServiceScene.ts`, `src/screens/DayFlow.tsx`(`ServiceData.staff = save.service.staff`)

**Interfaces:**
- Produces: `ShopLook.helpers: { id: StaffId; x: number; flip: boolean; pose: Pose; carried: string | null }[]`. 3D: 손주와 같은 판(`Board`)으로 통로에, 주방 보조는 반달이 옆. 그림 = `test/staff/<id>/walk_0..3.png`가 있으면 그것, 없으면 가게 손주 그림 + 머리 위 이름표(HUD). 2D: 같은 대역을 스프라이트로.
- [ ] **Step 1: `look.test.ts`** `shows each friend on shift where they work`, **Step 2~4**
- [ ] **Step 5: 확인** — 1280×720 밤 장사: 직원 2명이 나르고 닦는 장면, 겹치는 말풍선 없음.
- [ ] **Step 6: 커밋·푸시** `feat(staff): friends on shift seen in the shop (stand-ins with name tags until their pictures are approved)`

### Task 7: 그림 — 첫 묶음(승인)

**Files:**
- Create: `art-src/codex/prompt-staff-<id>.txt`(일반 4명 먼저), `art-src/codex/slice_staff.py`

- [ ] **Step 1:** 일반 4명(박 영감·순덕 이모·꼬마 깨비·달래)의 옆모습 시트(걷기 4 + 일하기 1, 가게 손주 프롬프트와 같은 규칙·크기) + 초상화(손주 대화 초상화 방식) 프롬프트, Codex는 한 번에 하나씩.
- [ ] **Step 2:** 도트 변환 → 사용자에게 보이고 승인. 승인된 것만 `art/test/staff/<id>/`.
- [ ] **Step 3:** 나머지 8명은 같은 방식으로 다음 묶음(이 계획 밖, 사용자에게 다음 할 일로 알림).
- [ ] **Step 4: 커밋·푸시** `art(staff): the first four old friends (approved)`

### Task 8: 마무리

- [ ] 점검표 전부 + `npm run test:server`, 1280×720 장면 묶음 보내기, 설계 문서 "구현됨", 기억 파일 갱신, 푸시.
