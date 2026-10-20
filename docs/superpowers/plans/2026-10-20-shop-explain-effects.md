# 가게 개편 3단계: 밤 장사 설명·효과 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 밤 장사에서 할 일을 늘 보이게 하고(대상 말풍선·뚜껑이 첫 안내·마감 띠), 데이브식 화면·소리 반응을 붙이고, 황금 숯을 알기 전엔 상점을 밀지 않는다.

**Architecture:** 규칙(`Shift`)은 그대로 두고, 무엇을 보일지는 `look.ts`·새 `tips.ts`의 순수 함수로 계산해 테스트한다. 화면은 지금처럼 `ShopHud`(React, 960×540 층) 위에 얹고, 소리는 `src/audio/sfx.ts` 한 곳에 모은다. 황금 숯 판정은 `hud.ts`의 순수 함수.

**Tech Stack:** Vite + React + TypeScript, three.js(3D 가게), Phaser(2D 대체 가게), vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-shop-explain-effects-design.md` (승인 2026-10-20)

## Global Constraints

- 규칙·숫자·서버 정산은 바꾸지 않는다(팁 = 가격 × `tipRate` 0.1, 인내심, 숯 소모, 음료 배수 그대로).
- 서버가 주지 않는 보너스·콤보 숫자를 띄우지 않는다. 화면 금액은 이벤트에 실린 값(`tip`) 그대로.
- **설계와 다른 점(코드 확인 결과):** 팁은 빠르기와 무관하다(`tipFor(price, perfectTea)`). 그래서 서빙 등급(빠름!/좋아/늦었어)은 돈과 상관없는 **손님 반응**으로만 보이고, 기준은 기다린 시간 ÷ 인내심(0.4 미만 빠름, 0.75 미만 좋아, 그 위 늦었어 — 제 판단)이다. 등급 옆에 금액을 붙이지 않는다.
- 새 그림·소리·대사 문구는 넣기 전에 사용자 승인. 그림은 Codex → 도트 변환(코드로 그리지 않음), UI는 CSS 색 박스 금지, 움직임은 `steps()`.
- 행동 키는 E(스페이스도 됨). 안내·음소거 기록은 브라우저 저장소(`try/catch`, 막혀도 게임이 돈다).
- 문자열은 `src/i18n/ko.ts`·`en.ts` 둘 다. 사용자에게 보이는 말은 한국어 기준.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. 태스크마다 docs/VERSE8.md 점검표 후 `git push gitlab develop` + `git push github develop:main`.

## Review Focus

- **장사 도중 새로고침**(`sessionStorage`에서 이어 하기): 이미 본 안내가 다시 뜨지 않고, 복원 직후 동전·소리가 터지지 않아야 한다 → Task 3 테스트 `does not repeat a tip already seen`, Task 5는 이벤트로만 효과를 낸다(상태에서 만들지 않음).
- **저장소가 막힌 환경**(Verse8 에디터 iframe, 사생활 모드): 안내 기록·음소거 읽기/쓰기가 던지지 않아야 한다 → Task 3 테스트 `works when storage throws`.
- **일시정지 중**: 안내 띠의 4초가 흐르지 않고, 효과음이 나지 않아야 한다 → Task 4 단계에서 `paused`면 타이머 멈춤, Task 7 `play`는 일시정지면 무시.
- **모바일**: 행동 버튼 글자가 동사로 바뀌어도 버튼 밖으로 넘치지 않아야 한다(영어 포함) → Task 2 화면 확인을 `?touch`로도 찍는다.
- **이미 결제했거나 각성한 기존 세이브**: 황금 숯이 0이어도 "안다"로 판정되어 HUD 칸이 사라지지 않아야 한다 → Task 8 테스트 `knows charcoal after spending it all`.

---

### Task 1: 대상 말풍선과 인내심 색 판정 (순수 함수)

**Files:**
- Modify: `src/game/shop3d/look.ts`
- Test: `src/game/shop3d/look.test.ts`

**Interfaces:**
- Produces:
  - `export type PromptVerb = "take" | "give" | "scrub" | "coal" | "pour";`
  - `export type PromptWhy = "handsFull" | "cooking" | "otherDish" | "noDrink";`
  - `export interface Prompt { at: { kind: "pass" } | { kind: "drinks" } | { kind: "coal" } | { kind: "seat"; seat: number }; verb: PromptVerb; ok: boolean; why: PromptWhy | null }`
  - `export function promptOf(shift: Shift): Prompt | null` — `shift.target()` 기준(손이 닿는 가장 가까운 대상). 바쁠 때(`busyMs > 0`)도 같은 말풍선을 계속 낸다.
  - `export type PatienceTier = "ok" | "warn" | "late";` / `export function patienceTier(p: number): PatienceTier` — 0.5 미만 ok, 0.75 미만 warn, 그 위 late.
  - `ShopLook`에 `prompt: Prompt | null` 추가(`lookAt`이 채움).

- [ ] **Step 1: 실패하는 테스트**

```ts
describe("promptOf", () => {
  it("offers to take a plate at the pass, and says why not when the hands are full or nothing is ready", () => {
    // at the pass with a plate ready
    expect(promptOf(sh)).toEqual({ at: { kind: "pass" }, verb: "take", ok: true, why: null });
    // a plate already carried
    expect(promptOf(sh)).toMatchObject({ verb: "take", ok: false, why: "handsFull" });
    // nothing on the pass, Bandal still cooking
    expect(promptOf(sh)).toMatchObject({ verb: "take", ok: false, why: "cooking" });
  });
  it("offers to give the guest their dish, or says another dish is in hand", () => {
    expect(promptOf(sh)).toMatchObject({ at: { kind: "seat", seat: 0 }, verb: "give", ok: true });
    expect(promptOf(sh)).toMatchObject({ verb: "give", ok: false, why: "otherDish" });
  });
  it("offers to scrub a messy seat and to add charcoal below 100", () => {
    expect(promptOf(sh)).toMatchObject({ verb: "scrub", ok: true });
    expect(promptOf(sh)).toMatchObject({ at: { kind: "coal" }, verb: "coal", ok: true });
  });
  it("offers to pour only when a guest wants a drink", () => {
    expect(promptOf(sh)).toMatchObject({ at: { kind: "drinks" }, verb: "pour", ok: false, why: "noDrink" });
  });
  it("shows nothing out of reach, at a full charcoal box, or at an empty seat", () => {
    expect(promptOf(sh)).toBeNull();
  });
});
it("colours patience green, then yellow from half, red from three quarters", () => {
  expect([0, 0.49, 0.5, 0.74, 0.75, 1].map(patienceTier)).toEqual(["ok", "ok", "warn", "warn", "late", "late"]);
});
```

각 상황은 파일의 `guest`/`cfg`/`run`/`serveFirst` 도우미로 만든다(손주 위치는 `sh.s.x`를 `LAYOUT.pass`·`sh.s.seats[0].x` 등으로 둔다).

- [ ] **Step 2: 실행 → 실패 확인**: `npx vitest run src/game/shop3d/look.test.ts` → `promptOf is not a function`
- [ ] **Step 3: `promptOf`, `patienceTier` 구현, `lookAt`이 `prompt` 채우기.** 손님 쪽 판정은 공개 상태만 쓴다(`g.ordered && g.servedMs === null && g.phase === "seated"`이면 요리를 기다림; `tray[0]`이 그 요리면 ok, 다른 요리면 `otherDish`; 들고 있는 음료가 그 손님 것이면 `give` ok). `cooking` = `s.pass`가 비고 `s.kitchen.length > 0`.
- [ ] **Step 4: 실행 → 통과**: `npx vitest run src/game/shop3d/look.test.ts` → PASS
- [ ] **Step 5: 커밋** `feat(shop3d): what the grandchild can do at the nearest thing, and why not (tested)`

### Task 2: 말풍선·행동 버튼 글자·인내심 색을 화면에

**Files:**
- Modify: `src/game/shop3d/ShopView.ts` (`anchors`), `src/game/shop3d/ShopHud.tsx`, `src/game/shop3d/shop3d.css`, `src/game/service/ServiceScene.ts`, `src/i18n/ko.ts`, `src/i18n/en.ts`

**Interfaces:**
- Consumes: Task 1의 `Prompt`, `promptOf`, `patienceTier`, `ShopLook.prompt`.
- Produces: `Anchors`에 `pass: {x,y}`, `seats: {x,y}[]` 추가. 문자열 키 `prompt.take|give|scrub|coal|pour`, `prompt.why.handsFull|cooking|otherDish|noDrink`.

문구(ko): take "요리 받기", give "내려놓기", scrub "닦기 (연타)", coal "숯 넣기 (연타)", pour "꾹 누르고 선에서 떼기"; why handsFull "손이 차 있어요", cooking "아직 굽는 중", otherDish "다른 요리를 들고 있어요", noDrink "음료 원하는 손님 없음". (en: "Take dish", "Serve", "Scrub (tap)", "Add charcoal (tap)", "Hold, let go at the line"; "Hands full", "Still cooking", "Holding another dish", "No one wants a drink".)

- [ ] **Step 1: `ShopView.anchors`가 `pass`(창구 위 `FLOOR_Y + PASS.h + 24`), `seats`(자리마다 카운터 위 `FLOOR_Y + COUNTER.h + 30`)를 돌려준다.**
- [ ] **Step 2: `ShopHud`가 `look.prompt`를 그 대상의 앵커 위에 낮 가게 `ui-bubble day-prompt`와 같은 모양으로 그린다.** PC는 `day-key` 칩 "E" + 동사, `ok:false`면 회색(`closed`) + 이유 한 줄. 모바일(`p.touch`)은 칩 없이 말풍선, 그리고 `s3-act` 버튼 글자를 `prompt.verb` 문구로(없으면 지금처럼 "행동").
- [ ] **Step 3: 손님 말풍선의 `s3-patience`에 `patienceTier` 클래스(`ok`/`warn`/`late`)를 달고 CSS로 초록·노랑·빨강(반투명 채움, 지금 빨강 rgba 그대로를 late로).**
- [ ] **Step 4: 2D `ServiceScene`도 빛나는 대상 위에 같은 동사 글자(텍스트)를 띄운다.** 3D와 같은 `promptOf`를 쓴다.
- [ ] **Step 5: 확인**: `npm test`, `npm run typecheck`; 1280×720 headless(메모리 `screenshot-1280`, 세이브에 `service`를 넣어 바로 밤)로 창구·손님·숯통·수레 앞에서 각각 찍고, `?touch`로 행동 버튼 글자도 찍는다. 말풍선이 손님 말풍선·게이지와 겹치지 않는지 본다.
- [ ] **Step 6: 커밋·푸시** `feat(shop3d): a bubble over the nearest thing says what E does there (or why not), the action button says it on touch, patience turns yellow then red`

### Task 3: 처음 한 번 안내 — 기록과 발동 판정 (순수)

**Files:**
- Create: `src/screens/tips.ts`, `src/screens/tips.test.ts`

**Interfaces:**
- Produces:
  - `export type TipId = "open" | "cooked" | "carry" | "coalLow" | "drink" | "mess" | "angry" | "charcoal";`
  - `export function readSeen(store: Pick<Storage, "getItem"> | null): Set<TipId>` / `export function markSeen(store: Pick<Storage, "getItem" | "setItem"> | null, id: TipId): void` — 키 `"monster-bbq:tips"`, JSON 배열. 저장소가 없거나 던지면 빈 집합/무시.
  - `export function nightTipDue(shift: Shift, events: ShiftEvent[], seen: ReadonlySet<TipId>): TipId | null` — 아직 안 본 것 중 하나(아래 순서가 우선): `open`(항상 먼저), `angry`(이벤트), `cooked`(이벤트), `carry`(`take` 이벤트), `mess`(더러운 자리가 하나라도), `coalLow`(`s.coal < COAL_LOW`), `drink`(`shift.drinkWanted() !== null`).
  - `export const COAL_LOW = 30;`
  - `export const TIP_FACE: Record<TipId, LidFace>` — open smug, cooked normal, carry normal, coalLow surprised, drink normal, mess angry, angry angry, charcoal smug.

- [ ] **Step 1: 실패하는 테스트**

```ts
it("starts with the opening tip, then each tip the first time its moment comes", () => {
  expect(nightTipDue(sh, [], new Set())).toBe("open");
  expect(nightTipDue(sh, [{ type: "cooked", dish: "grilled_belly" }], new Set(["open"]))).toBe("cooked");
});
it("does not repeat a tip already seen", () => {
  expect(nightTipDue(sh, [{ type: "cooked", dish: "grilled_belly" }], new Set(["open", "cooked"]))).toBeNull();
});
it("calls the charcoal low under 30 and a drink when one is wanted", () => { /* sh.s.coal = 29 → "coalLow" */ });
it("remembers seen tips, and works when storage throws", () => {
  const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  expect(readSeen(bad).size).toBe(0);
  expect(() => markSeen(bad, "open")).not.toThrow();
});
```

- [ ] **Step 2: 실행 → 실패**: `npx vitest run src/screens/tips.test.ts`
- [ ] **Step 3: 구현**
- [ ] **Step 4: 실행 → 통과**
- [ ] **Step 5: 커밋** `feat(shop): which first-time tip is due and remembering it (tested)`

### Task 4: 뚜껑이 한 줄 띠와 마감 띠

**Files:**
- Create: `src/screens/hud/LidLine.tsx`
- Modify: `src/game/shop3d/ShopStage.tsx`, `src/game/shop3d/ShopHud.tsx`, `src/game/shop3d/shop3d.css`, `src/screens/hud/hud.css`, `src/i18n/ko.ts`, `src/i18n/en.ts`

**Interfaces:**
- Consumes: Task 3 전부.
- Produces: `export function LidLine({ face, text }: { face: LidFace; text: string })` — 승인된 `art/test/lid/<face>.png`(작게, 1배) + 한 줄, `ui-plate` 띠, 위쪽 가운데, 들어올 때·나갈 때 `steps()`. 문자열 키 `tip.<TipId>`, `service.band.soldOut`, `service.band.closing`.

뚜껑이 문구(ko, 사용자 승인 대상 — 계획 검토 때 함께 확인):
- open "말풍선 요리를 창구에서 받아 갖다주껑!"
- cooked "다 됐껑! 창구로 가서 E껑."
- carry "그 요리 시킨 손님한테 가껑."
- coalLow "숯 떨어진다껑! 숯통에서 E 연타껑."
- drink "보리차 손님이껑. 수레에서 꾹 눌렀다 선에서 떼껑."
- mess "잔반 치우껑. 안 치우면 다음 손님 못 앉껑."
- angry "늦으면 화내고 가껑. 평판 깎이껑."
- charcoal "할미 비법 황금 숯이껑. 장비랑 요리를 각성시키껑."(Task 8에서 씀)

- [ ] **Step 1: `ShopStage`가 프레임마다(일시정지·끝난 뒤 제외) 띠가 비어 있으면 `nightTipDue(shift, 이번 프레임 이벤트, seen)`을 부르고, 나오면 4초 띠 + `markSeen`.** 띠의 4초는 일시정지 동안 멈춘다(`isPaused`면 남은 시간 그대로). 하루 제목 카드가 떠 있는 동안(`holdRef`)은 부르지 않는다.
- [ ] **Step 2: (개점 띠는 이미 있다: 장사로 넘어갈 때 하루 제목 카드 `card.service` "밤 장사 시작". 손대지 않는다.) `soldOut`·`closing` 이벤트 때 지금의 글자 팝 대신 `ui-ribbon` 띠("다 팔렸다!" / "영업 끝!", 1.6초, 하루 제목 카드와 같은 등장)를 화면 가운데 위에.** 게임은 멈추지 않는다.
- [ ] **Step 3: 확인**: `npm test`, 1280×720 headless로 첫 밤(저장소 비움)을 처음부터 찍어 open → cooked → carry 띠가 차례로 한 번씩 나오는지, 같은 세이브로 다시 열면 안 나오는지.
- [ ] **Step 4: 커밋·푸시** `feat(shop): the lid's one-line tips the first time each thing happens, and bands when the plates run out or the shop closes`

### Task 5: 그림 없이 되는 효과 — 서빙 반응, 동전, 골드 굴리기, 화남 흔들림, 음료 도장

**Files:**
- Modify: `src/game/service/shift.ts` (`served` 이벤트), `src/game/service/shift.test.ts`, `src/game/shop3d/look.ts`(+test), `src/game/shop3d/ShopStage.tsx`, `src/game/shop3d/ShopHud.tsx`, `src/game/shop3d/shop3d.css`, `src/i18n/ko.ts`, `src/i18n/en.ts`

**Interfaces:**
- Produces:
  - `ShiftEvent`의 `served`에 `ratio: number`(= `servedMs / patienceMs`) 추가.
  - `export type ServeGrade = "fast" | "good" | "late";` / `export function serveGrade(ratio: number): ServeGrade` (look.ts) — 0.4 미만 fast, 0.75 미만 good, 그 위 late.
  - `HudProps`에 `fx: Fx[]`(`{ id: number; kind: "coin" | "stamp"; x: number; y: number; text?: string; tone?: string; born: number }`)와 `shake: boolean`.
  - 문자열 `service.grade.fast|good|late` = "빠름!" / "좋아" / "늦었어".

- [ ] **Step 1: 실패하는 테스트** — `shift.test.ts`: 서빙 이벤트가 `ratio`를 싣는다(기다린 10초 / 인내심 40초 → 0.25). `look.test.ts`: `serveGrade` 경계 `[0, 0.39, 0.4, 0.74, 0.75] → fast, fast, good, good, late`.
- [ ] **Step 2: 실행 → 실패**, **Step 3: 구현**, **Step 4: 통과**
- [ ] **Step 5: 화면** — `served`: 등급 도장(글자, 손님 위) + 동전 3~5개(`icon_gold.png`, 1배)가 손님 머리에서 튀어 위쪽 골드 칸으로 0.6초 날아감, 위쪽 골드 숫자는 실제 값으로 0.5초 동안 굴러 오름(팁 글자 팝은 그대로). `order`: 그 손님 말풍선이 처음 나타날 때 0.2초 통 튀어 나옴(말풍선 `key`가 바뀌는 순간의 CSS 등장). `angry`: `.s3-layer`에 0.2초 흔들림 클래스(2px, `steps`). `pour`: 지금 글자를 크게 도장처럼 쿵(PERFECT 금색). 모두 이벤트에서만 생긴다.
- [ ] **Step 6: 확인**: `npm test`; headless로 서빙 직후 0.2초·0.5초 찍어 동전이 골드 칸으로 가는지, 화난 손님 때 흔들림.
- [ ] **Step 7: 커밋·푸시** `feat(shop3d): a served guest's reaction (fast/good/late, no money attached), coins flying to the gold, the gold rolling up, a shake when a guest storms out, the pour judged like a stamp`

### Task 6: 효과 그림 (Codex → 승인)

**Files:**
- Create: `art-src/codex/prompt-fx-shop.txt`, `art-src/codex/slice_fx_shop.py`, (승인 후) `art/test/fx/*.png`
- Modify: `src/game/shop3d/ShopHud.tsx`, `src/game/shop3d/ShopStage.tsx`, `src/game/shop3d/shop3d.css`

**Interfaces:**
- Produces: `art/test/fx/` 아래 `coin_0..3`(돌아가는 동전 4장, 12px), `steam_0..2`(김), `spark_0..2`(불티), `foam_0..2`(거품), `sparkle_0..2`(반짝), `puff_angry_0..2`(붉은 김), `heart`(하트). 효과는 `hasArt`로 그림이 있을 때만 그 그림을 쓴다(동전은 없으면 `icon_gold`).

- [ ] **Step 1: 프롬프트 작성** — 한 장 시트, 칸마다 하나, 마젠타 배경, 6배 도트(앉은 손님 프롬프트와 같은 규칙), 참고 그림 `art-src/codex/raw/ref_hud_icons_x8.png`.
- [ ] **Step 2: Codex 한 번 실행**(동시 실행 금지, 429면 5분 뒤 재시도), `slice_fx_shop.py`로 덩어리 중심 기준 자르기 → `art-src/codex/out/fx/` + 4배 미리보기.
- [ ] **Step 3: 사용자에게 미리보기를 보여 주고 승인받는다.** 승인된 것만 `art/test/fx/`로.
- [ ] **Step 4: 효과 연결** — `cooked`: 창구 위 김, `coal`: 숯통 불티, `noCoal`: 반달이 쪽 땀 대신 숯통 위 빨간 깜빡(그림 없음, 기존 글자 유지), `scrub`: 거품, 끝나면 반짝, `served`: 하트 + 돌아가는 동전, `angry`: 붉은 김. 프레임은 `steps()`로 넘긴다.
- [ ] **Step 5: 확인·커밋·푸시** `art(shop): the night's little effects (coins, steam, sparks, foam, sparkle, angry puff, heart), approved 2026-10-..`

### Task 7: 효과음 (Mixkit → 승인)

**Files:**
- Create: `src/audio/sfx.ts`, `src/audio/sfx.test.ts`, (승인 후) `sfx/*.mp3`
- Modify: `src/game/shop3d/ShopStage.tsx`, `src/game/shop3d/ShopHud.tsx`, `src/i18n/ko.ts`, `src/i18n/en.ts`, `docs/VERSE8.md`(지우면 안 되는 것에 `sfx/` 추가하지 않음 — 소리 폴더 위치만 한 줄)

**Interfaces:**
- Produces:
  - `export type Sfx = "order" | "tick" | "cooked" | "take" | "coin" | "angry" | "pourPerfect" | "pourGood" | "pourBad" | "coal" | "coalOut" | "scrub" | "scrubDone" | "bell";`
  - `export function play(name: Sfx): void` — 음소거·첫 조작 전·파일 없음이면 아무것도 안 함. 같은 소리는 80ms 안에 겹쳐 울리지 않음.
  - `export function setMuted(m: boolean): void`, `export function isMuted(): boolean` — 키 `"monster-bbq:mute"`, 저장소가 막혀도 동작.
  - `export function unlock(): void` — 첫 키·포인터 입력에서 부름.
  - 파일은 `import.meta.glob("../../sfx/*.mp3", { eager: true, query: "?url", import: "default" })`.
  - 문자열 `service.mute` "소리 끄기" / `service.unmute` "소리 켜기".

- [ ] **Step 1: 실패하는 테스트** — 음소거면 재생 안 함, 80ms 안 같은 소리 한 번, 저장소가 던져도 `setMuted`/`isMuted` 동작(오디오 객체는 주입 가능한 팩토리로 대신).
- [ ] **Step 2: 실행 → 실패**, **Step 3: 구현**, **Step 4: 통과**
- [ ] **Step 5: 소리 고르기** — Mixkit(mixkit.co, 무료 효과음)에서 이름마다 후보 1~2개를 찾아 목록(제목·주소·길이)을 사용자에게 보이고, **내려받기 전에 허락을 받는다.** 받은 후보는 `art-src/sfx/candidates/`에 두고 들어 보게 한 뒤 승인된 것만 `sfx/<이름>.mp3`로.
- [ ] **Step 6: 연결** — 표(설계 4장)대로 이벤트마다 `play`. 인내심 `tick`은 손님마다 late로 넘어갈 때 한 번. 일시정지면 `play` 안 부름. 일시정지 버튼 옆 음소거 버튼(`ui-btn`).
- [ ] **Step 7: 확인·커밋·푸시** `feat(shop): sounds for the night (Mixkit, approved) with a mute button`

### Task 8: 황금 숯은 알게 된 다음에

**Files:**
- Modify: `src/screens/hud/hud.ts`, `src/screens/hud/hud.test.ts`, `src/screens/hud/DayHud.tsx`, `src/screens/HuntSummary.tsx`, `src/screens/Upgrades.tsx`, `src/screens/Awaken.tsx`, `src/screens/hud/Notebook.tsx`, `src/screens/DayFlow.tsx`, `src/i18n/ko.ts`, `src/i18n/en.ts`

**Interfaces:**
- Consumes: Task 3 `readSeen`/`markSeen`/`TipId "charcoal"`, Task 4 `LidLine`.
- Produces: `export function knowsCharcoal(save: Pick<SaveData, "charcoal" | "stars" | "shop" | "pages">): boolean` — `charcoal > 0` 또는 `stars`에 0보다 큰 값 하나라도 또는 `shop.purchases.length > 0` 또는 `pages.includes("forest")`.

- [ ] **Step 1: 실패하는 테스트**

```ts
it("does not know golden charcoal on a new save", () => expect(knowsCharcoal(newSave())).toBe(false));
it("knows it after the first chapter boss, a purchase or VIP charcoal", () => { /* pages ["forest"]; purchases ["x"]; charcoal 2 → true */ });
it("knows charcoal after spending it all", () => expect(knowsCharcoal({ ...newSave(), charcoal: 0, stars: { knife: 1 } })).toBe(true));
```

(`stars`의 키 이름은 `AwakenTarget`에서 실제 값을 쓴다.)

- [ ] **Step 2: 실행 → 실패**, **Step 3: 구현**, **Step 4: 통과**
- [ ] **Step 5: 화면**
  - `DayHud`: 모르면 황금 숯 칸을 그리지 않는다.
  - `HuntSummary`: 상점 버튼과 `onShop` 속성 삭제. 첫 장 보스 귀환(`gotPage`)이면 "황금 숯 50을 얻었다!" 줄(`summary.charcoal`, 수는 `BALANCE.shop.bossCharcoal`).
  - `Upgrades`: 아래 상점 버튼 삭제(`onShop`은 각성 목록에만 넘김).
  - `Awaken`: 황금 숯이 모자랄 때 — 모르면 누를 수 없는 "황금 숯이 모자라요" + 작은 글씨 `awaken.charcoalWhere` "장 보스를 처음 잡으면 받아요", 알면 "황금 숯 구하기"(`awaken.getCharcoal`) → 상점.
  - `DayFlow`: `knowsCharcoal(save)`이고 `charcoal` 안내를 아직 안 봤으면 `LidLine`(`tip.charcoal`, 4초) 한 번 + `markSeen`. 수첩 각성 앱에 그때까지 "새로" 표시(`notebook.new`), 각성을 한 번 열면 사라짐(같은 저장소, 키 `TipId`와 별도 `"awakenApp"` — `tips.ts`의 `TipId`에 추가).
  - 이름: `product.charcoal_1..5` "황금 숯 주머니/자루/상자/가마/대장간", `awaken.cost` "{gold}골드 · 황금 숯 {charcoal}", `awaken.costCharcoal` "황금 숯 {charcoal}", `vip.claim` "VIP 하루 황금 숯 받기"(en은 "golden charcoal"로 맞춤). 밤 장사의 "숯" 문구는 그대로.
- [ ] **Step 6: 확인**: `npm test`, `npm run typecheck`, `npm --prefix server run typecheck`; headless로 새 세이브의 낮 HUD(황금 숯 칸 없음), 사냥 귀환(상점 버튼 없음), `pages:["forest"], charcoal:50` 세이브의 HUD·각성·뚜껑이 띠.
- [ ] **Step 7: 커밋·푸시** `feat(shop): golden charcoal is introduced before the shop is offered — no shop buttons on the haul or upgrades, the HUD shows it once known, awakening says where it comes from, and the premium currency is always "golden charcoal"`

### Task 9: 마무리 확인

- [ ] **Step 1:** docs/VERSE8.md 점검표 전부(`npm test`, `npm run typecheck`, `npm --prefix server run typecheck`, `npm run build` + `GAME_SIZE_RESPONSE`, 서버 코드를 건드렸으면 `npm run test:server`).
- [ ] **Step 2:** 1280×720 headless로 새 계정 첫 밤을 처음부터 끝까지 찍어 사용자에게 보낸다(안내 순서, 말풍선, 효과, 마감 띠).
- [ ] **Step 3:** 설계 문서 머리에 "구현됨(계획 2026-10-20)" 한 줄, 기억 파일 `paused-shop3d-art.md` 갱신, 푸시.
