# 08c 사냥 재설계 3단계 (장비·깊은 층 재료·3·4층·새 몬스터) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, 사용자 선택). 출시 전이라 큰 검토자 에이전트는 돌리지 않는다(사용자, 2026-10-15). 테스트·타입 검사·실제 화면 확인으로 끝내고 푸시.

**Goal:** 장비가 곧 갈 수 있는 깊이(데이브의 잠수복). 장화가 있어야 3층 안개 늪, 등불이 있어야 4층 이끼 동굴. 늪·동굴에서만 나는 먹지 못하는 재료(가죽·비늘·껍데기·빛버섯·철광석)가 장비 업그레이드 값에 들어간다. 3·4층에 새 몬스터 4종(개굴장군·물뱀·박쥐 무리·반딧버섯게).

**Architecture:** 층 정의(`FLOORS`)에 3·4층과 `needs`(장비)를 더하고, 서버 정산이 계단마다 그 장비를 확인한다. 아이템에 `material` 종류(가방 2칸)를 더하고 `addToBag`이 칸 무게를 센다. 업그레이드 값에 재료(`mats`)를 더해 `buyUpgrade`가 골드와 재료를 함께 뺀다. 새 몬스터 행동 4개는 `shared/hunt/`의 순수 상태 기계(혀·잠복·급강하·껍데기), 4층 어둠은 등불 반경만큼 구멍 난 어둠 막(효과). 장비 `tank`(기력 최대치)가 지금 `armor`의 역할을 넘겨받고 `armor`는 받는 피해 감소가 된다(세이브 v7: 산 `armor` 단계를 `tank`로 옮겨 기력을 잃지 않게).

**Spec:** [hunt v3](../specs/2026-10-15-hunt-v3-depths-design.md) 3장(층), 4.5~4.7(장비·비용·몬스터), 5.3, 5.4 3단계.

## Global Constraints

- **숫자 초안 — 사용자 승인 필요**(전부 `BALANCE`·`FLOORS`, 플레이로 조정):
  - 3층: 기력 감소 초당 0.55, 출구 2곳, 필요 장비 장화. 4층: 초당 0.7, 출구 1곳, 필요 장비 등불. 4층 아래(보스 굴)는 5단계.
  - 장화: 1단계만, 400골드. 등불 1/2/3단계: 600골드+개구리 가죽 3 / 1,500+뱀 비늘 4+빛버섯 2 / 3,000+철광석 4, 밝기 반경 90/130/170.
  - 기력 통(지금 체력 표 100/130/170/220을 넘겨받음) 2/3/4단계: 600+개구리 가죽 2 / 1,500+뱀 비늘 3 / 3,000+게 껍데기 3.
  - 앞치마 갑옷(받는 피해 감소 0/10/20/30%) 2/3/4단계: 500+개구리 가죽 2 / 1,200+게 껍데기 2 / 2,500+철광석 3.
  - 재료는 가방 2칸. 몬스터 재료: 개굴장군 = 개구리 다리·개구리 가죽, 물뱀 = 뱀 살·뱀 비늘, 박쥐 = 박쥐 날개, 반딧버섯게 = 게살·게 껍데기·빛버섯. 4층 동굴 벽 채집 = 철광석·빛버섯.
- 새 그림(전부 사용자 승인 후): 새 몬스터 4종 시트(작업 1, 생성 중), 새 재료 아이콘 9개, 늪·동굴 바닥 타일과 물체(작업 2). 코드로 그리지 않는다. 4층 어둠 막은 효과(사용자에게 보여 준다).
- 서버 행동은 public endpoint. 세이브 하나·`$lock`. 화면은 실제 1280×720으로 확인. 하네스는 알리고 실행.
- 작업마다 커밋, 작업 7부터 푸시(그 전엔 보고 형식·세이브가 바뀌는 중).

## Review Focus

- 장화 없이 3층 몬스터를 잡았다는 보고, 등불 없이 4층 보고는 거부.
- 재료 값이 모자라면 업그레이드 거부, 사면 골드와 재료가 정확히 빠진다.
- v6 세이브의 `armor` 단계가 `tank`로 옮겨져 기력 최대치가 그대로다.
- 재료는 2칸: 12칸 가방에 재료 6개면 꽉 찬다(서버·화면 같게).
- 물뱀이 숨어 있을 때는 맞지 않고, 반딧버섯게는 뒤집혔을 때만 제대로 맞는다.

---

### Task 1: 새 몬스터 4종 그림 (Codex, 승인)

- [ ] `art-src/codex/raw/{frog,snake,bat,crab}_sheet.png`(4×4: 옆·앞·뒤 걷기, 특수 동작) 생성 → `art-src/codex/slice.py`와 같은 방식으로 `art/test/<who>/<row>_<n>.png`(행 이름 `side, down, up, special`) — 지금 멧돼지와 같은 크기 기준으로 줄인다. 미리보기 `art-src/preview/new_monsters.png`(지금 멧돼지·토끼와 나란히). **사용자 승인 전에는 `art/`에 넣지 않는다.**

### Task 2: 재료 아이콘 9개·늪/동굴 바닥과 물체 (Codex, 승인)

- [ ] 아이콘: `frog_leg, frog_skin, snake_meat, snake_scale, bat_wing, crab_meat, crab_shell, glow_mushroom, iron_ore`(지금 재료 아이콘과 같은 크기·화풍). 채집 표시 `node_glow_mushroom, node_iron_ore`.
- [ ] 바닥: 늪 타일(`bg/swamp.png`, 지금 풀 타일과 같은 크기), 동굴 타일(`bg/cave.png`). 물체: 늪 = 갈대 덤불·연잎 웅덩이·썩은 통나무, 동굴 = 종유석·빛나는 수정·바위. 지금 숲 물체와 같은 화풍.
- [ ] 미리보기 보여 주고 승인 → `art/`.

### Task 3: 아이템·가방 무게·층 3·4 정의

**Files:** `shared/content/items.ts`, `shared/hunt/bag.ts`, `shared/content/floors.ts`, `shared/content/objects.ts`, `shared/content/monsters.ts`, `shared/balance.ts` + 각 테스트

- [ ] 테스트 먼저(`bag.test.ts`): `addToBag`이 재료를 2칸으로 센다 — 12칸에 재료 6개면 7번째는 안 들어감, 재료 5개(10칸) 뒤 고기 2개는 들어가고 3번째는 안 들어감. `bagCount`는 칸 수.
- [ ] `ITEMS`에 `kind: "material"`(값 `slots: 2`)과 9개 아이템. 고기 = `part`(보통·특급), 재료·빛버섯·철광석 = `material`(등급 없음). `itemPrice`에 값.
- [ ] `MONSTERS`: `frog { kind: "tongue", maxHp: 50, radius: 12, drops: [["frog_leg", 3], ["frog_skin", 2]] }`, `snake { kind: "lurker", maxHp: 35, radius: 9, drops: [["snake_meat", 3], ["snake_scale", 2]] }`, `bat { kind: "swarm", maxHp: 12, radius: 6, drops: [["bat_wing", 1]] }`, `crab { kind: "shell", maxHp: 70, radius: 13, drops: [["crab_meat", 3], ["crab_shell", 2], ["glow_mushroom", 1]] }`. 재료가 나오면 별 개수와 상관없이 1개(재료는 등급이 없다) — `takeYield`에 `material` 분기, 테스트.
- [ ] `FLOORS[3]`(늪), `FLOORS[4]`(동굴): 위 숫자, `needs: "boots" | "lantern"`, 명단(3층: 개굴장군 3·물뱀 3, 채집 없음 / 4층: 박쥐 무리 2(무리당 4)·반딧버섯게 3, 채집 철광석 4·빛버섯 3), `ground: "swamp" | "cave"`(바닥 타일), 물체 종류 목록. `FLOORS[2].down`을 계단 자리로. `isFloorId`에 3·4. 테스트(`floors.test.ts`)를 맞춘다.

### Task 4: 장비 업그레이드와 재료 값, 세이브 v7

**Files:** `shared/content/upgrades.ts`, `shared/balance.ts`, `shared/growth.ts`, `shared/actions.ts`(`buyUpgrade`, `settleHunt`), `shared/save.ts` + 테스트

- [ ] 테스트 먼저: `buyUpgrade("lantern")`가 600골드+개구리 가죽 3을 빼고 레벨 1; 가죽이 2개면 `no_materials`; 장화 없이 `{ down: 3 }` 보고는 `bad_hunt`, 장화가 있으면 통과; v6 세이브 `upgrades.armor: 3` → v7 `tank: 3, armor: 1`, `huntStats().maxHp`가 170 그대로; `huntStats().damageTaken`이 갑옷 단계별 1/0.9/0.8/0.7.
- [ ] `UPGRADE_IDS`에 `boots, lantern, tank`. `BALANCE.upgrades[id].mats?: { item: ItemId; n: number }[][]`(단계별). `growth`: `maxHp`를 `tank` 레벨로, `armor` = `damageTaken: [1, 0.9, 0.8, 0.7]`, `light: [90, 130, 170]`. `nextMats(save, id)`.
- [ ] `buyUpgrade`: 골드 확인 다음 재료 확인(`no_materials`), 둘 다 뺀다. `settleHunt`: `{ down: n }`마다 `FLOORS[n].needs`가 있으면 그 장비 레벨 ≥ 1인지 확인.
- [ ] 세이브 v7: `readSave`가 v6을 읽을 때 `upgrades.tank = upgrades.armor ?? 1`, `upgrades.armor = 1`(받는 피해 감소는 새로 산다 — 그동안 낸 갑옷 값은 기력 통으로 이어진다).

### Task 5: 새 몬스터 행동 (공용 규칙)

**Files:** `shared/hunt/tongue.ts`, `lurker.ts`, `swarm.ts`, `shell.ts` + 테스트, `shared/balance.ts`(각 튜닝)

- [ ] 개굴장군(`tongue`): 떠돌기 → 110 안에 들어오면 볼 부풀리기(예고 600ms) → 혀(400ms, 직선 110): 맞으면 피해 10과 사냥꾼을 40만큼 당김 → 혀를 거두는 동안(500ms) 빈틈(카운터, 포획 게이지 시작값 +0.2). 테스트: 예고 → 혀 → 빈틈 순서, 혀 길이 밖은 안 맞음.
- [ ] 물뱀(`lurker`): 숨어서 천천히 이동(맞지 않음, 작살·보조무기도 통과) → 70 안이면 물결 예고(500ms) → 튀어나와 물기(피해 14) → 900ms 드러남(빈틈) → 2초 뒤 다시 숨음. 테스트: 숨었을 때 `isTargetable` false.
- [ ] 박쥐(`swarm`): 둥지 둘레를 맴돌기 → 140 안이면 접기(예고 400ms) → 급강하(직선, 맞으면 피해 8) → 어지러움 900ms(빈틈). 등불 빛 반경 안에서는 급강하하지 않고 물러난다. 한 마리를 치면 무리 전체가 급강하.
- [ ] 반딧버섯게(`shell`): 느리게 옆걸음 → 가까우면 집게 예고(500ms) → 집기(피해 12). 앞에서 맞으면 피해 30%("딱딱!"), 등 뒤 100%. 식칼 3타 막타나 폭죽이면 뒤집힘 3초(피해 ×2, 포획 쉬움). 테스트: 앞/뒤 피해 배수, 뒤집힘.

### Task 6: 사냥 화면 — 3·4층, 새 몬스터, 어둠, 갑옷

**Files:** `src/game/scenes/HuntScene.ts`, `src/game/hunt/mobs.ts`, `src/game/hunt/anims.ts`, `src/i18n/*`

- [ ] 층마다 바닥 타일과 물체 그림(`FLOORS[n].ground`), 막힌 계단에 "장화가 필요하다"/"등불이 필요하다"(E를 누르면), 층 카드.
- [ ] `mobs.ts`: 네 종류의 상태 기계 연결, 행 이름 `side/down/up/special` 애니메이션, 예고 번쩍임(지금 `warn`), 물뱀 숨음 = 웅덩이 정지 프레임만, 게 뒤집힘 = special 4번 프레임.
- [ ] 4층 어둠: 화면 전체 어둠 막(검정 0.85)에 등불 반경만큼 사냥꾼 둘레 구멍(마스크). 박쥐는 빛 반경을 피함.
- [ ] 받는 피해 × `damageTaken`.
- [ ] 실제 화면: 3층 늪(개굴장군 혀), 4층 동굴(어둠·박쥐)을 시드로 내려가 찍어 보여 준다.

### Task 7: 업그레이드 화면·점심 고르기·문구, 배포

- [ ] `Upgrades.tsx`: 장비 묶음(장화·등불·기력 통·앞치마 갑옷), 값에 재료 아이콘과 개수(모자라면 빨간 글자), 갑옷 효과 "받는 피해 {a}% → {b}%", 등불 "밝기 {a} → {b}".
- [ ] 냉장고(주방)에 재료가 보이게: 도감·메뉴판 재료 계산은 `part`·`forage`만 쓰므로 그대로, 재료는 업그레이드 화면에 "가진 재료" 줄.
- [ ] `npm run typecheck && npm test && npm run build`, 하네스(알리고), 점검표, 푸시. 스펙 상태 줄 "3단계 구현됨".
