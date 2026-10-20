# 가게 개편 4단계: 장사 중 메뉴 추가 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 밤 장사 도중 창구(반달이)에서 남은 재료로 요리를 더 내고, 다 팔려 닫힌 주문을 다시 연다.

**Architecture:** 서버 규칙은 `shared/service/addMenu.ts`(순수, 테스트) — `addToMenu` 행동이 재료를 빼고 `service.dishes`를 늘리며, 손님 계획은 새 `service.planMenu`(연 순간의 메뉴)로 고정한다. 밤 상태 `Shift`는 `addPlates`와 `closedBy`로 다시 열기를 안다. 화면은 `ShopStage` 위 React 창 `AddMenu`, 요청은 `DayFlow`가 보낸다.

**Tech Stack:** TypeScript, React, three.js(3D 가게)/Phaser(2D 대체), Verse8 game server(공유 `applyAction`), vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-shop-add-menu-design.md` (승인 2026-10-20)

## Global Constraints

- 손님 계획(`planService`)은 클라이언트·서버 모두 `service.planMenu`로 만든다. 추가한 요리로 손님 명단이 바뀌면 안 된다.
- 이미 있는 요리에 세트를 더하면 그 요리의 오늘 값(`TonightDish.price`) 그대로. 새 요리는 `planShop`과 같은 값 계산.
- 새 요리는 메뉴 칸(`menuSlots(save)`) 안에서만. 한 줄 세트 합계 ≤ `MAX_SETS`(99).
- 같은 `addId`가 다시 오면 아무것도 바꾸지 않고 지금 세이브를 돌려준다.
- 다 팔림으로 닫힌 주문만, 22시(`BALANCE.service.openMs`) 전일 때 추가로 다시 열린다. 손주가 닫았거나 시간이 지났으면 안 열린다.
- 창이 열린 동안 밤이 멈춘다(일시정지와 같음).
- 서버 행동을 바꾸므로 `npm run test:server`(Windows에서 isolated-vm 오류 창이 뜰 수 있음을 사용자에게 미리 알림).
- 문자열은 ko·en 둘 다. 커밋 끝 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, 태스크마다 VERSE8 점검표 후 `git push gitlab develop` + `git push github develop:main`.

## Review Focus

- **"추가"를 연타하거나 응답이 늦어 다시 누름**: 재료가 한 번만 빠져야 한다 → Task 2 테스트 `applies one addId once`, Task 4 보내는 동안 버튼 잠금.
- **창을 연 채 연결이 끊기거나 서버가 거절**: 아무것도 안 바뀌고 창 안에 이유, 닫으면 밤이 그대로 이어짐 → Task 4 단계에서 실패 시 `shift`를 건드리지 않음.
- **추가 직후 새로고침**: 밤이 멈춘 동안은 1초 저장이 안 돌아서 추가분이 사라질 수 있다 → Task 4에서 `addPlates` 직후 바로 `saveShift`.
- **손주가 직접 주문 마감한 뒤 추가**: 다시 열리면 안 됨 → Task 3 테스트 `does not reopen orders the player closed`.
- **예전 세이브(장사 중이던 것, `planMenu` 없음)**: 손님 명단이 연 순간 그대로 → Task 1 테스트 `reads planMenu from an older save's dishes`.

---

### Task 1: 손님 계획을 연 순간의 메뉴로 고정

**Files:**
- Modify: `shared/save.ts`(`PendingService`, `readService`), `shared/actions.ts`(`openShop`), `shared/service/settle.ts`, `src/screens/DayFlow.tsx`(`Night`)
- Test: `shared/save.test.ts`, `shared/service/service.test.ts`

**Interfaces:**
- Produces: `PendingService`에 `planMenu: DishId[]`, `adds: string[]`. `openShop`이 `planMenu = lines.map(l => l.dish)`, `adds = []`로 연다. `readService`는 없으면 `planMenu = dishes.map(d => d.dish)`, `adds = []`(문자열만, 최대 50개).

- [ ] **Step 1: 실패하는 테스트**
  - `save.test.ts` `reads planMenu from an older save's dishes`: `readSave({...newSave(), service: { id:"s", seed:1, startedAt:0, dishes:[{dish:"grilled_belly",plates:3,price:40}] }})`의 `service`가 `{ planMenu: ["grilled_belly"], adds: [] }`를 포함.
  - `service.test.ts` `keeps tonight's guests when dishes are added`: 장사를 연 세이브의 `service.dishes`에 `{ dish:"garlic_neck", plates:3, price:50 }`를 붙이고 `planMenu`는 그대로 둔 뒤, 그 밤 손님 `c0`에게 `garlic_neck`을 판 보고로 `settleService`가 거절하지 않음(손님 명단이 그대로라 `c0`이 존재).
- [ ] **Step 2: 실행 → 실패**: `npx vitest run shared/save.test.ts shared/service/service.test.ts`
- [ ] **Step 3: 구현** — 위 Produces대로. `settleService`의 손님 표와 `DayFlow`의 `Night`가 `planService(svc.seed, { …, menu: svc.planMenu })`를 쓴다(정산의 그릇·값 표는 `svc.dishes` 그대로).
- [ ] **Step 4: 실행 → 통과**, `npm test`, `npm run typecheck`
- [ ] **Step 5: 커밋** `feat(service): tonight's guests are planned from the menu the shop opened with (planMenu), so dishes added later cannot change them`

### Task 2: 서버 행동 `addToMenu`

**Files:**
- Create: `shared/service/addMenu.ts`, `shared/service/addMenu.test.ts`
- Modify: `shared/actions.ts`(행동 타입·`applyAction` 분기), `src/i18n/ko.ts`, `src/i18n/en.ts`

**Interfaces:**
- Consumes: Task 1의 `planMenu`, `adds`.
- Produces:
  - `export interface AddOption { dish: DishId; maxSets: number; isNew: boolean; price: number }`
  - `export function addOptions(save: SaveData): AddOption[]` — 장사 중이 아니면 `[]`. 연구한 요리 중 `setsAvailable(save.items, dish) >= 1`인 것. 오늘 있는 요리는 `isNew:false`, `price`는 그 줄 값, `maxSets = min(재료 세트, MAX_SETS − 그 줄 세트 합)`. 없는 요리는 메뉴 칸이 남을 때만 `isNew:true`, `price = round(dishPrice(dish, level) × starMul(별))`(특급 비율 전), `maxSets = min(재료 세트, MAX_SETS)`. 순서: 오늘 메뉴 순서, 그다음 `DISH_IDS` 순서.
  - `export function addToMenu(save: SaveData, a: Record<string, unknown>): { save: SaveData; error?: string }`
  - 행동 `{ type: "addToMenu"; serviceId: string; dish: string; sets: number; addId: string }`.
  - 오류 코드: `wrong_stage`(장사 중 아님), `bad_service`(id 다름), `bad_menu`(요리·세트·addId 형식, 연구 안 한 요리, 99 넘음), `no_slot`(새 요리인데 칸 없음), `no_ingredients`.
  - 문자열 `error.no_slot` "메뉴 칸이 꽉 찼어요" / "No menu slot left".

- [ ] **Step 1: 실패하는 테스트**(`addMenu.test.ts`, 장사를 연 세이브를 `applyAction`의 `openShop`으로 만든다)
  - `adds sets to a dish already on tonight's menu at its price`: 재료를 넣고 `addToMenu`가 그 줄 `plates`를 `sets × platesPerSet(level)`만큼 늘리고 `price`는 그대로, 재료가 줄고, `save.menu`의 그 줄 `sets`도 늘어남.
  - `adds a new dish within the menu slots`: 새 줄이 뒤에 붙고 `planMenu`는 그대로.
  - `refuses a new dish with no slot left, a dish not researched, too many sets, too few ingredients, another night or no night`: 각각 `no_slot`, `bad_menu`, `bad_menu`, `no_ingredients`, `bad_service`, `wrong_stage`.
  - `applies one addId once`: 같은 행동 두 번 → 두 번째 결과의 `save`가 첫 결과와 같고 오류 없음.
  - `lists what can be added`: `addOptions`가 오늘 요리(값·`isNew:false`)와 칸이 남을 때만 새 요리를 낸다.
- [ ] **Step 2: 실행 → 실패**: `npx vitest run shared/service/addMenu.test.ts`
- [ ] **Step 3: 구현** — 재료 빼기는 `takeSets`(특급 비율은 새 요리 값에만 반영: `planShop([...])`로 한 줄 계산해도 됨). `adds`에 `addId`를 더함(50개 넘으면 가장 오래된 것부터 버림).
- [ ] **Step 4: 실행 → 통과**, `npm test`, `npm run typecheck`, `npm --prefix server run typecheck`, `npm run test:server`
- [ ] **Step 5: 커밋·푸시** `feat(service): addToMenu — more sets or a new dish during the night from the fridge, checked and deducted by the server, once per addId`

### Task 3: 밤 상태 — 그릇 더하기와 다시 열기

**Files:**
- Modify: `src/game/service/shift.ts`, `src/game/service/night.ts`(불러오기 기본값)
- Test: `src/game/service/shift.test.ts`

**Interfaces:**
- Produces:
  - `ShiftState`에 `closedBy: "soldOut" | "player" | "clock" | null`(지금 `ordersClosed`를 켜는 세 곳에서 채움; 예전 저장은 `null`로 읽음).
  - `Shift.addPlates(dish: DishId, plates: number, price: number): void` — `s.plates[dish] += plates`, 오늘 요리 목록·값 표에 없으면 더함. 그 뒤 `ordersClosed && closedBy === "soldOut" && clock < openMs`면 다시 열고(`ordersClosed=false`, `closedBy=null`) 이벤트 `{ type: "reopened" }`.
  - `ShiftEvent`에 `{ type: "reopened" }`.

- [ ] **Step 1: 실패하는 테스트**
  - `reopens orders after a sell-out when plates are added, and the next guest comes in`: 그릇 1개·손님 3명 → 다 팔림(`soldOut`) → `addPlates("grilled_belly", 2, 40)` → `drain()`에 `reopened`, 시간이 흐르면 다음 손님이 들어옴(`s.arrived` 증가).
  - `does not reopen orders the player closed`: `closeOrders()` 뒤 `addPlates` → 여전히 닫힘, `reopened` 없음.
  - `does not reopen after closing time`: `clock >= openMs`에서 다 팔림 뒤 `addPlates` → 닫힘.
  - `lets guests order a dish added tonight`: 새 요리를 더하면 그 요리가 다 떨어진 손님의 대체 주문으로 고를 수 있음.
- [ ] **Step 2: 실행 → 실패**, **Step 3: 구현**, **Step 4: 통과**(`npx vitest run src/game/service/shift.test.ts`, `npm test`)
- [ ] **Step 5: 커밋** `feat(service): the night takes added plates and reopens after a sell-out (not after the player closed or closing time)`

### Task 4: 창구의 "메뉴 추가" 창

**Files:**
- Create: `src/screens/kitchen/AddMenu.tsx`
- Modify: `src/game/shop3d/look.ts`(+test), `src/game/shop3d/ShopStage.tsx`, `src/game/shop3d/ShopHud.tsx`, `src/game/service/ServiceGame.tsx`, `src/screens/DayFlow.tsx`, `src/screens/tips.ts`(+test), `src/screens/kitchen/kitchen.css`, `src/i18n/ko.ts`, `src/i18n/en.ts`

**Interfaces:**
- Consumes: Task 2 `addOptions`, `AddOption`, 행동 `addToMenu`; Task 3 `addPlates`, `reopened`.
- Produces:
  - `PromptVerb`에 `"menu"`: 창구에서 받을 요리가 없고(`pass` 비고) 반달이가 굽는 것도 없으면 `{ at: pass, verb: "menu", ok: true }`(지금 그때는 `null`).
  - `ServiceGame`·`ShopStage` 속성 `addMenu?: { options: AddOption[]; slots: { used: number; max: number }; send: (dish: DishId, sets: number) => Promise<{ dishes: TonightDish[] } | { error: string }> }`.
  - `export function AddMenu({ options, slots, busy, error, onAdd, onClose }: { options: AddOption[]; slots: { used: number; max: number }; busy: boolean; error: string | null; onAdd: (dish: DishId, sets: number) => void; onClose: () => void })`
  - `TipId`에 `"soldOut"`(다 팔림 이벤트 때), `TIP_FACE.soldOut = "surprised"`.
  - 문자열: `prompt.menu` "메뉴 추가", `prompt.short.menu` "메뉴", `addMenu.title` "메뉴 추가", `addMenu.slots` "메뉴 칸 {used}/{max}", `addMenu.sets` "재료로 {n}세트", `addMenu.samePrice` "가격 그대로", `addMenu.new` "새 요리", `addMenu.add` "추가", `addMenu.sending` "반달이가 준비하는 중…", `addMenu.none` "더 낼 수 있는 요리가 없어요", `service.band.reopened` "다시 손님 받는다!", `tip.soldOut` "다 팔렸껑! 재료 남았으면 반달이한테 E, 더 내껑."(문구 승인 대상, en 맞춤).

- [ ] **Step 1: 실패하는 테스트** — `look.test.ts` `offers the menu at an empty pass when nothing is cooking`(→ `verb: "menu"`), `tips.test.ts` `calls a sell-out once`(`soldOut` 이벤트 → `"soldOut"`).
- [ ] **Step 2: 실행 → 실패**, **Step 3: `promptOf`·`nightTipDue` 고치기**, **Step 4: 통과**
- [ ] **Step 5: `DayFlow`** — `Night`에 `addMenu`를 넘긴다: `options = addOptions(save)`, `slots = { used: svc.dishes.length, max: menuSlots(save) }`, `send`는 `busyRef`로 막고 `transport.act({ type: "addToMenu", serviceId, dish, sets, addId })`(`addId`는 `crypto.randomUUID()` 대신 시각+난수 문자열이면 됨), 성공하면 `setSave` 후 `{ dishes: next.service.dishes }`, 실패면 `{ error: code }`. 전역 오류 패널(`failed`)은 쓰지 않는다.
- [ ] **Step 6: `ShopStage`** — 창구에서 행동 키를 누를 때 `promptOf`가 `menu`면 `shift.act()` 대신 창을 연다(그동안 `isPaused`처럼 밤 정지). "추가" → `send` → 성공이면 새 `dishes`와 지금까지 알던 그릇 수의 차이만큼 `shift.addPlates(dish, plates, price)`, 곧바로 `saveShift`, 창 닫기, 반달이 `serve` 포즈, `reopened`면 `service.band.reopened` 띠 + `bell` 소리. 실패면 창 안에 `t(\`error.${code}\`)`(없으면 `error.retry`). 메뉴 패(`dishes` 속성, 저장이 바뀌면 따라옴)는 6칸까지 지금처럼, 새로 생긴 패는 0.2초 통 튀어 나온다(`.s3-plaque` 등장 애니메이션).
- [ ] **Step 7: 2D 대체 가게** — `Service2D`는 화면 위쪽 React 버튼 "메뉴 추가"로 같은 창을 연다(2D 규칙 상태에도 `addPlates`). (설계 5장의 "그쪽 행동 키"를 버튼으로 바꾼 판단, 장부에 기록.)
- [ ] **Step 8: 확인** — `npm test`, `npm run typecheck`; 1280×720 headless: 그릇 1개 메뉴로 열어 다 팔리게 → 창구 E → 창(칸 표시·세트 −/+·가격 그대로) → 추가 → 띠 "다시 손님 받는다!" → 다음 손님 입장. `?touch`로 버튼 글자 "메뉴".
- [ ] **Step 9: 커밋·푸시** `feat(shop): add to the menu at the pass during the night (the night waits; a sell-out reopens), the lid says so the first time`

### Task 5: 마무리

- [ ] **Step 1:** VERSE8 점검표 전부(`npm test`, `npm run typecheck`, `npm --prefix server run typecheck`, `npm run build` + `GAME_SIZE_RESPONSE`, `npm run test:server`).
- [ ] **Step 2:** 1280×720 장면 묶음을 사용자에게 보낸다.
- [ ] **Step 3:** 설계 문서 머리 "구현됨" 한 줄, 기억 파일 `paused-shop3d-art.md` 개편 순서 갱신, 푸시.
