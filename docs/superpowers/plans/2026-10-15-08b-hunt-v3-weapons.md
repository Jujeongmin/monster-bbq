# 08b 사냥 재설계 2단계 (무기: 보조무기·포획·재우기·별 등급·엄니대장) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 잡는 방법이 곧 보상이 되게 한다. 작살로 끌어와 연타로 포획(★★), 보조무기(새총·수면총·그물총·폭죽) 중 하나를 골라 들고 가 재우거나 그물로 잡기(★★★), 식칼로 쓰러뜨리기(★). 2층에는 가끔 우두머리 "엄니대장"이 나온다. 손맛 연출(포획 게이지, 도장, 별, Zzz, 이름 카드)과 귀환 정산(별 등급별)을 붙인다.

**Architecture:** 규칙은 전부 `shared/`의 순수 함수 — 별·재료 계산(`shared/hunt/stars.ts`), 포획 게이지(`capture.ts`), 몬스터 상태(기절·졸음·잠·그물, `status.ts`), 엄니대장 행동(`tusk.ts`), 보조무기 표(`content/sideWeapons.ts`). 서버 정산(`settleHunt`)은 보고의 `take`(무엇을 어떻게 잡았나)를 받아 들고 간 보조무기·탄 수·방법별 최소 시간을 확인하고 재료를 직접 계산한다. 사냥 화면은 이 함수들을 매 프레임 부르고 그림·연출만 맡는다. 들고 갈 보조무기는 출발 때 고르고(`startHunt.side`), 서버가 가진 것인지 확인해 진행 중 사냥(`PendingHunt.side`)에 적는다.

**Tech Stack:** TypeScript 5.7, React 18, Phaser 3.90, vitest 3, Python 3 + Pillow(그림 자르기만).

**Spec:** [사냥 재설계 (hunt v3)](../specs/2026-10-15-hunt-v3-depths-design.md) 4장(무기·별·몬스터), 5.1(손맛 연출), 5.2(화면 표시), 5.3(서버 검증), 5.4 2단계, 6장(테스트).

## Global Constraints

- 사용자에게 보이는 글은 전부 `t()`(ko.ts 기준, en.ts 같은 키). 사용자에게는 한국어로만.
- **조작(스펙 4.1)**: PC = WASD 이동, 좌클릭 작살, **우클릭 보조무기**, **Space 식칼**, E 줍기·담기·내려가기·나가기, 1·2·3 도시락, Esc 일시정지. 포획 연타는 좌클릭 또는 Space. 모바일 = 조이스틱, 오른쪽 화면 누르고 떼기 작살, 보조무기 버튼, 베기 버튼, 쓰기 버튼, 포획 중 화면 아무 데나 탭.
- **숫자 초안 — 계획 검토 때 사용자 승인**(전부 `BALANCE`에, 플레이로 조정):
  - 별: 쓰러뜨림 ★ = 보통 1개, 포획 ★★ = 보통 2개, 재우기·그물 ★★★ = 특급 2개. 엄니대장은 ×2.
  - 보조무기 탄 수(단계별): 새총 12/16/20, 수면총 4/5/6, 그물총 2/3, 폭죽 3.
  - 보조무기 값(골드만, 깊은 층 재료는 3단계): 새총 처음부터 가짐 → 600/1,500, 수면총 800/2,000/4,500(스펙 값), 그물총 1,200/3,000, 폭죽 500.
  - 수면 발수: 토끼·닭·벌 1, 멧돼지 2, 엄니대장 5. 잠들기까지 1.5초(수면총 2·3단계 1.0/0.6초), 잠 15초.
  - 포획 게이지: 시작 0.35, 연타 한 번 +0.09(작살 2·3단계 +0.10/+0.11), 초당 0.25×(0.5 + 남은 체력 비율)씩 줆, 최소 1.2초.
  - 새총: 피해 3, 기절 1.2초. 폭죽: 반경 60, 기절 1.5초, 무리는 흩어짐. 그물총: 작은 몬스터(토끼·닭·벌) 바로 포획, 큰 몬스터 3초 묶기.
  - 엄니대장: 2층에 나올 확률 60%, 체력 240, 연속 돌진 3번, 땅 구르기(반경 70, 예고 0.9초, 피해 20), 깔아뭉개기(연타 12번/2.5초, 늦으면 피해 35), 큰 패턴 뒤 2초 헐떡임.
- 서버 행동은 public endpoint: 인자를 믿지 않는다. 세이브 전체는 Global User State 하나에 `$lock`(CLAUDE.md 결정). 지금 "근접 막타면 특급" 규칙(`meatGrade`)은 없앤다.
- 그림: 새로 그리는 것은 보조무기 아이콘 4개뿐(작업 1, 승인 전에는 작업 9로 가지 않는다). 엄니대장은 지금 멧돼지 그림을 정수배(2배)로 키워 쓴다(그림 2단계 = 스펙 5.4의 4단계에서 새로). 별·Zzz·도장은 픽셀 폰트 글자와 키트 조각으로. 코드로 그림을 그리지 않는다.
- 효과음(Mixkit)은 작업 13에서 목록을 보여 주고 허락받은 뒤에만 내려받는다.
- UI는 픽셀 키트와 갈무리. 바꾼 화면은 `art-src/mockups/tools/shot.mjs`로 실제 1280×720 화면을 찍어 확인하고 사용자에게 보여 준다.
- 서버 하네스 테스트(`npm run test:server`)는 실행 전에 사용자에게 알린다.
- 작업 2~8 사이에는 `npm run typecheck`가 깨져 있을 수 있다(보고 형식이 바뀐다). 각 작업은 자기 테스트 파일이 통과하면 커밋한다. 작업 9 끝부터 `npm test`와 `npm run typecheck`가 모두 통과해야 한다. **배포(푸시)는 작업 9 끝부터** 한다 — 그 전에 올리면 08a 때처럼 사냥 보고가 거절되는 빌드가 나간다. 작업 2~8 커밋은 로컬에만.
- 끝나면 docs/VERSE8.md 점검표, GitLab `develop`·GitHub `main` 푸시.

## Review Focus

- 수면총을 안 들고 갔는데 "재우기"로 잡았다는 보고, 들고 간 탄보다 많이 재우거나 그물로 잡은 보고, 포획을 최소 시간보다 빨리 한 보고는 서버가 거부한다 → 작업 3 테스트.
- 엄니대장은 seed가 정한 사냥에만, 2층에만 나오고, 서버도 같은 엄니대장을 다시 만든다. 잡으면 재료가 두 배 → 작업 3·6 테스트.
- 출발 때 고른 보조무기를 안 가졌으면(사지 않은 수면총) 사냥이 열리지 않는다. 응답이 끊겨 다시 보내도 같은 사냥이 선다 → 작업 2 테스트.
- 포획 중에 줄이 끊기면(게이지 0) 몬스터가 화나고(멧돼지 돌진 예고, 토끼 도망, 닭 무리 공격), 잠든 몬스터를 때리면 깬다 → 작업 4·5 테스트 + 작업 10 직접 확인.
- 층을 내려가도 남은 탄 수가 이어진다(한 판에 탄 한 묶음) → 작업 9 직접 확인.

---

### Task 1: 보조무기 아이콘 (Codex, 승인 필요)

**Files:**
- Create: `art-src/codex/prompt-side-weapons.txt`, `art-src/codex/raw/side_weapons.png`, `art-src/codex/slice_side_weapons.py`, `art-src/preview/side_weapons.png`
- Create (승인 후): `art/test/ui/side/{sling,sleepGun,netGun,firecracker}.png`

**Interfaces:**
- Produces: 텍스처 `art/test/ui/side/<id>.png`(각 20×20 아트 픽셀 안쪽). 작업 9(HUD)·11(고르기 창)·업그레이드 화면이 쓴다.

- [ ] **Step 1: 프롬프트**

`art-src/codex/prompt-side-weapons.txt`:

```text
Use your image generation tool (do not write code to draw) to create ONE image, 1536x384: four item icons side by side in four equal 384x384 cells on a perfectly flat solid magenta #FF00FF background (no glow, no shadow), each centred, nothing touching the cell edges. No text.

STYLE: real low-resolution pixel art matching the attached UI kit and item icons — every art pixel a solid 8x8 block of one flat colour, 1-art-pixel dark outline, 2-3 flat tones per material, no gradients, no glow, no anti-aliasing, the same warm palette. Each icon about 20 x 20 art pixels.

cell 1 "slingshot": a wooden Y-shaped slingshot with a brown leather band and a small round pebble.
cell 2 "sleep dart gun": a small brass-and-wood dart pistol with a fluffy pale-blue sleep dart, a tiny "z" curl of pale blue smoke at the muzzle (a shape, not a letter).
cell 3 "net gun": a stubby wooden launcher with a folded rope net bulging from its wide mouth.
cell 4 "firecracker": a red paper firecracker bundle tied with yellow string, a short lit fuse with one spark.

Save as art-src/codex/raw/side_weapons.png. Reply only with the saved file path.
```

- [ ] **Step 2: 참고 시트를 만들고 생성**

```bash
python -I -c "
from PIL import Image
ims=[Image.open(p).convert('RGBA') for p in ['art/test/ui/icon_gold.png','art/test/ui/icon_pot.png','art/test/items/icon_shiitake.png','art/test/ui2/btn_small.png']]
S=8; W=sum(i.width*S+16 for i in ims); H=max(i.height for i in ims)*S
o=Image.new('RGBA',(W,H),(255,0,255,255)); x=0
for i in ims: o.alpha_composite(i.resize((i.width*S,i.height*S),Image.NEAREST),(x,0)); x+=i.width*S+16
o.convert('RGB').save('art-src/codex/raw/ref_icons_x8.png')"
codex exec --skip-git-repo-check -s workspace-write -C "$(pwd)" --image art-src/codex/raw/ref_icons_x8.png - < art-src/codex/prompt-side-weapons.txt
```

Expected: `art-src/codex/raw/side_weapons.png`.

- [ ] **Step 3: 자르기** — `art-src/codex/slice_stamina_ring.py`와 같은 방식(마젠타 지우기, 칸 4개 자르기, 8로 상자 축소, 알파 0/255)으로 `art-src/codex/slice_side_weapons.py`를 쓰고, 이름은 `sling, sleepGun, netGun, firecracker`, 출력 `art-src/codex/out/side/<id>.png`, 미리보기 `art-src/preview/side_weapons.png`(4배, 지금 아이템 아이콘 `icon_shiitake.png`과 나란히).

Run: `python -I art-src/codex/slice_side_weapons.py` — Expected: 4개, 각각 약 20×20.

- [ ] **Step 4: 사용자 승인 (멈춤 지점)** — 미리보기를 보내고 승인받는다. 고칠 곳이 있으면 Step 1로. 승인 전에는 작업 9로 가지 않는다(작업 2~8은 그림이 필요 없다).

- [ ] **Step 5: 게임 폴더로 옮기고 커밋**

```bash
mkdir -p art/test/ui/side && cp art-src/codex/out/side/*.png art/test/ui/side/
git add art-src/codex/prompt-side-weapons.txt art-src/codex/raw/side_weapons.png art-src/codex/raw/ref_icons_x8.png art-src/codex/slice_side_weapons.py art-src/codex/out/side art-src/preview/side_weapons.png art/test/ui/side
git commit -m "art: side weapon icons (slingshot, sleep dart gun, net gun, firecracker), approved"
```

---

### Task 2: 보조무기 표·업그레이드·출발 때 고르기

**Files:**
- Create: `shared/content/sideWeapons.ts`, `shared/content/sideWeapons.test.ts`
- Modify: `shared/content/upgrades.ts`, `shared/balance.ts`, `shared/growth.ts`, `shared/growth.test.ts`, `shared/save.ts`, `shared/save.test.ts`, `shared/actions.ts`, `shared/hunt/settle.test.ts`

**Interfaces:**
- Produces:
  - `SIDE_WEAPONS = ["sling", "sleepGun", "netGun", "firecracker"] as const`, `type SideWeaponId`, `isSideWeaponId(v): v is SideWeaponId` (`shared/content/sideWeapons.ts`)
  - `UPGRADE_IDS`에 `"sling" | "sleepGun" | "netGun" | "firecracker"` 추가. `BALANCE.upgrades`: `sling { base: 1, costs: [600, 1500] }`, `sleepGun { base: 0, costs: [800, 2000, 4500] }`, `netGun { base: 0, costs: [1200, 3000] }`, `firecracker { base: 0, costs: [500] }`. 레벨 0 = 아직 없음.
  - `BALANCE.growth.ammo: Record<SideWeaponId, number[]>` = `{ sling: [12, 16, 20], sleepGun: [4, 5, 6], netGun: [2, 3], firecracker: [3] }`, `BALANCE.growth.sleepFallMs: [1500, 1000, 600]`
  - `ownsSide(save, id): boolean`(레벨 ≥ 1), `ammoOf(save, id): number`(없으면 0), `sleepFallMs(save): number` (`shared/growth.ts`)
  - `PendingHunt.side: SideWeaponId`, `startHunt`가 `{ type: "startHunt"; zone: Zone; side: SideWeaponId }`(없거나 이상하면 `"sling"`으로 읽지 않고 `bad_action`, 안 가진 것은 `"locked"`).

- [ ] **Step 1: 테스트**

`shared/content/sideWeapons.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSideWeaponId, SIDE_WEAPONS } from "./sideWeapons";

describe("side weapons", () => {
  it("lists the four the hunter can carry, one at a time", () => {
    expect(SIDE_WEAPONS).toEqual(["sling", "sleepGun", "netGun", "firecracker"]);
    expect([isSideWeaponId("netGun"), isSideWeaponId("bazooka"), isSideWeaponId(3)]).toEqual([true, false, false]);
  });
});
```

`shared/growth.test.ts`: 맨 위 `"starts every upgrade at level 1"`을 `"starts every upgrade at its base level"`로 바꾸고 본문 첫 줄을 `for (const id of UPGRADE_IDS) expect(level(s, id)).toBe(U[id].base);`로. 아래를 추가:

```ts
describe("side weapons in the upgrade shop", () => {
  it("starts with the slingshot only; the others are bought with gold", () => {
    const s = newSave();
    expect([ownsSide(s, "sling"), ownsSide(s, "sleepGun"), ownsSide(s, "netGun"), ownsSide(s, "firecracker")]).toEqual([true, false, false, false]);
    expect(ammoOf(s, "sling")).toBe(12);
    expect(ammoOf(s, "sleepGun")).toBe(0);
    const bought = buy({ ...s, gold: 800 }, "sleepGun").save;
    expect([ownsSide(bought, "sleepGun"), ammoOf(bought, "sleepGun"), bought.gold]).toEqual([true, 4, 0]);
  });
  it("puts the sleep dart to work faster at levels 2 and 3", () => {
    expect([sleepFallMs({ upgrades: { sleepGun: 1 } }), sleepFallMs({ upgrades: { sleepGun: 2 } }), sleepFallMs({ upgrades: { sleepGun: 3 } })]).toEqual([1500, 1000, 600]);
  });
});
```

(import에 `ammoOf, ownsSide, sleepFallMs` 추가.)

`shared/hunt/settle.test.ts` 끝에:

```ts
describe("the side weapon taken out", () => {
  it("starts a hunt with a side weapon the hunter owns, and keeps it on the hunt", () => {
    const s = applyAction(newSave(), { type: "startHunt", zone: "forest", side: "sling" }, ctx()).save;
    expect(s.hunt!.side).toBe("sling");
  });
  it("refuses a side weapon not bought yet, or no side weapon at all", () => {
    expect(applyAction(newSave(), { type: "startHunt", zone: "forest", side: "sleepGun" }, ctx()).error).toBe("locked");
    expect(applyAction(newSave(), { type: "startHunt", zone: "forest", side: "bazooka" }, ctx()).error).toBe("bad_action");
    expect(applyAction(newSave(), { type: "startHunt", zone: "forest" }, ctx()).error).toBe("bad_action");
  });
});
```

`settle.test.ts`·`stage.test.ts`·`actions.test.ts`·`growth.test.ts`·`lunch.test.ts`·`kitchen/actions.test.ts`·`src/net/transport.test.ts`·`server/test/server.test.ts`의 모든 `{ type: "startHunt", zone: "forest" }`에 `side: "sling"`을 넣는다(위 "or no side weapon at all" 줄만 빼고).

`shared/save.test.ts`: `"keeps the lunch stage and a hunt's time of day"`의 hunt에 `side: "sleepGun"`을 넣고 기대값에도 넣는다. 그리고:

```ts
  it("reads a hunt saved before side weapons as carrying the slingshot", () => {
    expect(readSave({ ...newSave(), hunt: { id: "h1", seed: 3, zone: "forest", period: "morning", startedAt: 5 } }).hunt?.side).toBe("sling");
  });
```

- [ ] **Step 2: 실패 확인** — `npx vitest run shared/content/sideWeapons.test.ts shared/growth.test.ts shared/hunt/settle.test.ts shared/save.test.ts` → FAIL(모듈 없음, `side` 없음).

- [ ] **Step 3: 구현**

`shared/content/sideWeapons.ts`:

```ts
// The side weapon the hunter takes out (hunt v3 design 4.4): one per hunt, chosen before leaving, with a
// fixed number of shots for the whole hunt. The slingshot stuns, the sleep dart puts to sleep (★★★ when
// bagged), the net gun catches a small monster outright (★★★), the firecracker scatters and startles.
export const SIDE_WEAPONS = ["sling", "sleepGun", "netGun", "firecracker"] as const;
export type SideWeaponId = (typeof SIDE_WEAPONS)[number];

export function isSideWeaponId(v: unknown): v is SideWeaponId {
  return typeof v === "string" && (SIDE_WEAPONS as readonly string[]).includes(v);
}
```

`shared/content/upgrades.ts`: `UPGRADE_IDS`에 `"sling", "sleepGun", "netGun", "firecracker"`를 `"lunchbox"` 다음에 더하고 주석에 "side weapons (hunt v3 design 4.4): level 0 = not bought yet"을 더한다.

`shared/balance.ts`: 타입의 `upgrades` 주석 끝에 "; base 0 = not owned until bought", 타입 `growth`에 `ammo: Record<SideWeaponId, number[]>; sleepFallMs: number[];`(import `type SideWeaponId`), 값의 `upgrades`에

```ts
    sling: { base: 1, costs: [600, 1500] },
    sleepGun: { base: 0, costs: [800, 2000, 4500] },
    netGun: { base: 0, costs: [1200, 3000] },
    firecracker: { base: 0, costs: [500] },
```

`growth`에 `ammo: { sling: [12, 16, 20], sleepGun: [4, 5, 6], netGun: [2, 3], firecracker: [3] }, sleepFallMs: [1500, 1000, 600],`.

`shared/growth.ts` 끝에:

```ts
// Side weapons (hunt v3 design 4.4): owned from level 1; shots per hunt by level.
export const ownsSide = (save: Pick<SaveData, "upgrades">, id: SideWeaponId): boolean => level(save, id) >= 1;
export const ammoOf = (save: Pick<SaveData, "upgrades">, id: SideWeaponId): number => (ownsSide(save, id) ? at(E.ammo[id], level(save, id)) : 0);
export const sleepFallMs = (save: Pick<SaveData, "upgrades">): number => at(E.sleepFallMs, Math.max(1, level(save, "sleepGun")));
```

`shared/save.ts`: `PendingHunt`에 `side: SideWeaponId;`(`period` 다음, 주석 "the side weapon taken out (its shots are the whole hunt's)"), `readHunt`에 `const side = isSideWeaponId(h.side) ? h.side : "sling";`를 넣어 반환에 `side`. `readUpgrades`의 `lv >= u.base`는 base 0도 받으므로 그대로.

`shared/actions.ts` `startHunt`:

```ts
    case "startHunt": {
      if (a.zone !== "forest" || !isSideWeaponId(a.side)) return { save, error: "bad_action" };
      // the morning hunt from the day's start, the afternoon hunt from lunch (hunt v3 design 3)
      if (save.stage !== "hunt" && save.stage !== "lunch") return { save, error: "wrong_stage" };
      // already out (a retry after a lost reply): the same hunt stands, never a second seed
      if (save.hunt) return { save };
      if (!ownsSide(save, a.side)) return { save, error: "locked" };
      const period = save.stage === "hunt" ? "morning" : "afternoon";
      const seed = Math.floor(ctx.random() * 2 ** 31);
      const id = `h${ctx.now.toString(36)}${Math.floor(ctx.random() * 1e9).toString(36)}`;
      return { save: { ...save, hunt: { id, seed, zone: a.zone, period, side: a.side, startedAt: ctx.now } } };
    }
```

`Action`의 `startHunt` 줄을 `| { type: "startHunt"; zone: Zone; side: SideWeaponId }`로.

- [ ] **Step 4: 통과 확인** — `npx vitest run shared src/net` → PASS.
- [ ] **Step 5: 커밋(로컬)** — `git commit -m "feat(hunt): side weapons as upgrades (slingshot owned, the rest bought), chosen when setting out and kept on the hunt"`

---

### Task 3: 별 등급과 서버 정산 (take 보고)

**Files:**
- Create: `shared/hunt/stars.ts`, `shared/hunt/stars.test.ts`
- Modify: `shared/actions.ts` (`HuntEvent`, `settleHunt`), `shared/balance.ts` (`hunt.stars`, `hunt.capture.minMs`, `hunt.sleepHits`, 엄니대장 수), `shared/content/monsters.ts` (`tusk`), `shared/hunt/combat.ts` (`meatGrade`·`premiumMaxRangedHits` 삭제), `shared/hunt/settle.test.ts`, `shared/actions.test.ts`, `shared/growth.test.ts`

**Interfaces:**
- Consumes: `SideWeaponId`, `ammoOf`, `sleepFallMs`, `PendingHunt.side` (작업 2), `planFloor`(작업 6에서 엄니대장을 넣는다 — 이 작업의 엄니대장 테스트는 작업 6이 끝나야 통과하므로 `it.todo`로 두고 작업 6에서 켠다)
- Produces:
  - `type TakeHow = "down" | "capture" | "sleep" | "net"`, `HuntEvent`의 `{ kill, grade }`를 `{ take: string; how: TakeHow }`로 바꾼다.
  - `starsOf(how: TakeHow): 1 | 2 | 3`, `takeYield(how: TakeHow, boss: boolean): { count: number; grade: "normal" | "premium" }` (`shared/hunt/stars.ts`)
  - `BALANCE.hunt.stars = { down: { count: 1, grade: "normal" }, capture: { count: 2, grade: "normal" }, sleep: { count: 2, grade: "premium" }, net: { count: 2, grade: "premium" }, bossMul: 2 }`, `BALANCE.hunt.capture.minMs = 1200`, `BALANCE.hunt.sleepHits: Record<MonsterId, number> = { rabbit: 1, chicken: 1, bee: 1, boar: 2, tusk: 5 }`, `BALANCE.hunt.netSmallMaxRadius = 8`
  - `MONSTERS.tusk = { kind: "boss", maxHp: 240, radius: 18, drops: [["boar_belly", 5], ["boar_neck", 3], ["boar_rib", 2]] }`

- [ ] **Step 1: 테스트** — `shared/hunt/stars.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { starsOf, takeYield } from "./stars";

describe("stars: how a monster was taken is what it gives (hunt v3 design 4.2)", () => {
  it("gives one star for a knock-down, two for a capture, three for sleep or the net", () => {
    expect([starsOf("down"), starsOf("capture"), starsOf("sleep"), starsOf("net")]).toEqual([1, 2, 3, 3]);
  });
  it("turns stars into parts: 1 regular, 2 regular, 2 premium; the boss twice that", () => {
    expect(takeYield("down", false)).toEqual({ count: 1, grade: "normal" });
    expect(takeYield("capture", false)).toEqual({ count: 2, grade: "normal" });
    expect(takeYield("sleep", false)).toEqual({ count: 2, grade: "premium" });
    expect(takeYield("net", true)).toEqual({ count: 4, grade: "premium" });
  });
});
```

`shared/hunt/settle.test.ts`의 `{ kill: x.id, grade: "normal" }`을 모두 `{ take: x.id, how: "down" }`으로, 그리고 추가:

```ts
describe("taking monsters by stars", () => {
  const out = (side: "sling" | "sleepGun" | "netGun", upgrades = {}) =>
    applyAction({ ...newSave(), upgrades: { sleepGun: 1, netGun: 1, ...upgrades } }, { type: "startHunt", zone: "forest", side }, ctx()).save;
  const wave0 = (s: SaveData) => planFloor(s.hunt!.seed, 1, "morning").spawns.filter((x) => x.wave === 0);
  const later = T0 + 600_000;
  it("brings home 1 regular part for a knock-down, 2 for a capture, 2 premium for sleep", () => {
    const s = out("sleepGun");
    const [a, b, c] = wave0(s);
    const r = finish(s, [{ take: a.id, how: "down" }, { take: b.id, how: "capture" }, { take: c.id, how: "sleep" }], "1-e0", false, later);
    expect(r.error).toBeUndefined();
    const items = r.save.items;
    const premium = Object.entries(items).filter(([k]) => k.endsWith(":premium")).reduce((n, [, v]) => n + v, 0);
    expect([count(items), premium]).toEqual([5, 2]);
  });
  it("refuses sleep without the sleep dart gun, and the net without the net gun", () => {
    const [a] = wave0(out("sling"));
    expect(finish(out("sling"), [{ take: a.id, how: "sleep" }], "1-e0", false, later).error).toBe("bad_hunt");
    expect(finish(out("sleepGun"), [{ take: a.id, how: "net" }], "1-e0", false, later).error).toBe("bad_hunt");
  });
  it("refuses more sleeping monsters than the darts could have put down", () => {
    const s = out("sleepGun");
    const five = wave0(s).filter((x) => x.monster !== "boar").slice(0, 5);
    expect(finish(s, five.map((x): HuntEvent => ({ take: x.id, how: "sleep" })), "1-e0", false, later).error).toBe("bad_hunt");
    expect(finish(s, five.slice(0, 4).map((x): HuntEvent => ({ take: x.id, how: "sleep" })), "1-e0", false, later).error).toBeUndefined();
  });
  it("refuses a capture faster than the gauge can fill", () => {
    const s = out("sling");
    const [a] = wave0(s);
    const need = BALANCE.hunt.minMsPerKill + BALANCE.hunt.capture.minMs;
    expect(finish(s, [{ take: a.id, how: "capture" }], "1-e0", false, T0 + need - 1).error).toBe("bad_hunt");
    expect(finish(s, [{ take: a.id, how: "capture" }], "1-e0", false, T0 + need).error).toBeUndefined();
  });
  it("refuses an unknown way of taking", () => {
    const s = out("sling");
    expect(finish(s, [{ take: wave0(s)[0].id, how: "bribe" as never }], "1-e0", false, later).error).toBe("bad_hunt");
  });
  it.todo("doubles the tusk boss's parts (turned on in Task 6)");
});
```

`shared/actions.test.ts`·`shared/growth.test.ts`의 `{ kill: s.id, grade: "normal" }`·`"premium"`을 `{ take: s.id, how: "down" }`으로, "a made-up grade" 테스트는 `{ take: wave0[0].id, how: "golden" }`으로, 아이템 기대값은 `itemKey(dropFor(...), "normal")`로 바꾼다(특급은 이제 잡는 방법에서만).

- [ ] **Step 2: 실패 확인** — `npx vitest run shared` → FAIL.

- [ ] **Step 3: 구현**

`shared/hunt/stars.ts`:

```ts
import { BALANCE } from "../balance";

// How a monster was taken decides what it gives (hunt v3 design 4.2, Dave the Diver's stars): knocked
// down ★, captured with the harpoon ★★, put to sleep or netted ★★★. The tusk boss gives twice as much.
export type TakeHow = "down" | "capture" | "sleep" | "net";
export const TAKE_HOWS: TakeHow[] = ["down", "capture", "sleep", "net"];

export function starsOf(how: TakeHow): 1 | 2 | 3 {
  return how === "down" ? 1 : how === "capture" ? 2 : 3;
}

export function takeYield(how: TakeHow, boss: boolean): { count: number; grade: "normal" | "premium" } {
  const r = BALANCE.hunt.stars[how];
  return { count: r.count * (boss ? BALANCE.hunt.stars.bossMul : 1), grade: r.grade };
}
```

`shared/balance.ts`: 타입 `hunt`에서 `premiumMaxRangedHits` 삭제, 추가:

```ts
    stars: Record<"down" | "capture" | "sleep" | "net", { count: number; grade: "normal" | "premium" }> & { bossMul: number };
    capture: { start: number; tap: number[]; decayPerSec: number; minMs: number };
    // sleep-dart hits that put each monster to sleep, and how long it then sleeps
    sleepHits: Record<MonsterId, number>;
    sleepMs: number;
    // monsters this small (radius) are caught outright by the net; bigger ones are only tied up
    netSmallMaxRadius: number;
    netBindMs: number;
    sling: { damage: number; stunMs: number; range: number; speed: number };
    firecracker: { radius: number; stunMs: number; range: number };
```

값(`hunt` 안, `premiumMaxRangedHits: 2,` 삭제):

```ts
    stars: { down: { count: 1, grade: "normal" }, capture: { count: 2, grade: "normal" }, sleep: { count: 2, grade: "premium" }, net: { count: 2, grade: "premium" }, bossMul: 2 },
    capture: { start: 0.35, tap: [0.09, 0.1, 0.11], decayPerSec: 0.25, minMs: 1200 },
    sleepHits: { rabbit: 1, chicken: 1, bee: 1, boar: 2, tusk: 5 },
    sleepMs: 15000,
    netSmallMaxRadius: 8,
    netBindMs: 3000,
    sling: { damage: 3, stunMs: 1200, range: 200, speed: 320 },
    firecracker: { radius: 60, stunMs: 1500, range: 150 },
```

`shared/content/monsters.ts`: 종류에 `"boss"`를 더하고 `tusk: { kind: "boss", maxHp: 240, radius: 18, drops: [["boar_belly", 5], ["boar_neck", 3], ["boar_rib", 2]] },`.

`shared/hunt/combat.ts`: `MeatGrade`, `meatGrade`를 지운다(쓰는 곳은 작업 9에서 사냥 화면이 바뀐다).

`shared/actions.ts`:

```ts
// What a hunt report lists, in the order things happened (hunt v3 design 5.3): each monster taken and
// how (the server turns that into parts by stars), each gathering spot, each way down.
export type HuntEvent = { take: string; how: TakeHow } | { gather: string } | { down: FloorId };
```

`settleHunt`의 kill 분기를 바꾼다:

```ts
    } else if (typeof e.take === "string") {
      const spawn = plan.spawns.find((s) => s.id === e.take);
      if (!spawn || taken.has(e.take) || !TAKE_HOWS.includes(e.how as TakeHow)) return null;
      const how = e.how as TakeHow;
      // sleeping and netting need that gun taken out, and only as many as its shots allow
      if (how === "sleep") {
        if (hunt.side !== "sleepGun") return null;
        dartsUsed += BALANCE.hunt.sleepHits[spawn.monster];
        if (dartsUsed > ammoOf(save, "sleepGun")) return null;
      }
      if (how === "net") {
        if (hunt.side !== "netGun" || ++netsUsed > ammoOf(save, "netGun")) return null;
      }
      const refill = plan.spawns.filter((s) => s.wave > 0).indexOf(spawn);
      const onFloor = killsOn.get(floor) ?? 0;
      if (refill >= 0 && onFloor < refill + 1) return null;
      taken.add(e.take);
      killsOn.set(floor, onFloor + 1);
      kills++;
      if (how === "capture") captures++;
      if (how === "sleep") sleeps++;
      const y = takeYield(how, spawn.monster === "tusk");
      for (let i = 0; i < y.count; i++) bag = addToBag(bag, itemKey(dropFor(hunt.seed, spawn), y.grade), bagSlots(save)).bag;
```

(위쪽에 `let dartsUsed = 0; let netsUsed = 0; let captures = 0; let sleeps = 0;`를 두고, `e`의 타입에 `take?: unknown; how?: unknown`을 더한다.) 시간 검사:

```ts
  const minMs = kills * BALANCE.hunt.minMsPerKill + descents * BALANCE.hunt.minMsPerFloor + captures * BALANCE.hunt.capture.minMs + sleeps * sleepFallMs(save);
  if (now - hunt.startedAt < minMs) return null;
```

맨 위 주석에 "takes by how (stars), sleep and net only with that gun taken out and within its shots, and a capture or a sleep only as fast as the gauge fills or the dart works"를 더한다.

- [ ] **Step 4: 통과 확인** — `npx vitest run shared` → PASS(엄니대장 1개 todo).
- [ ] **Step 5: 커밋(로컬)** — `git commit -m "feat(hunt): stars decide the parts (down 1, capture 2, sleep or net 2 premium); the server checks the gun taken out, its shots and the time each way takes"`

---

### Task 4: 포획 게이지

**Files:**
- Create: `shared/hunt/capture.ts`, `shared/hunt/capture.test.ts`

**Interfaces:**
- Produces: `interface Capture { fill: number; ms: number }`, `startCapture(): Capture`, `tapCapture(c: Capture, harpoonLevel: number): Capture`, `stepCapture(c: Capture, dtMs: number, hpFrac: number): { c: Capture; result: "going" | "caught" | "broke" }`

- [ ] **Step 1: 테스트**

```ts
import { describe, expect, it } from "vitest";
import { BALANCE } from "../balance";
import { startCapture, stepCapture, tapCapture } from "./capture";

const C = BALANCE.hunt.capture;

describe("the capture gauge (hunt v3 design 4.2)", () => {
  it("starts part full and fills with each tap, more with a better harpoon", () => {
    const c = startCapture();
    expect(c.fill).toBe(C.start);
    expect(tapCapture(c, 1).fill).toBeCloseTo(C.start + C.tap[0]);
    expect(tapCapture(c, 3).fill).toBeCloseTo(C.start + C.tap[2]);
  });
  it("drains faster the more health the monster has left", () => {
    const healthy = stepCapture(startCapture(), 1000, 1).c.fill;
    const weak = stepCapture(startCapture(), 1000, 0.1).c.fill;
    expect(healthy).toBeLessThan(weak);
  });
  it("breaks the rope when it runs dry", () => {
    expect(stepCapture({ fill: 0.01, ms: 500 }, 1000, 1).result).toBe("broke");
  });
  it("catches when full, but never before minMs", () => {
    expect(stepCapture({ fill: 1, ms: 100 }, 16, 0).result).toBe("going");
    expect(stepCapture({ fill: 1, ms: C.minMs }, 16, 0).result).toBe("caught");
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL(모듈 없음).
- [ ] **Step 3: 구현**

```ts
import { BALANCE } from "../balance";

// The capture gauge (hunt v3 design 4.2): a harpooned monster struggles; each tap fills the gauge, it
// drains faster the more health the monster has left (so the way to do it is a light slash, then the
// harpoon). Full = caught (★★), never before minMs, the time the server allows a capture; empty = the
// rope breaks.
const C = BALANCE.hunt.capture;

export interface Capture {
  fill: number;
  ms: number;
}

export const startCapture = (): Capture => ({ fill: C.start, ms: 0 });

export function tapCapture(c: Capture, harpoonLevel: number): Capture {
  const tap = C.tap[Math.max(0, Math.min(C.tap.length - 1, harpoonLevel - 1))];
  return { ...c, fill: Math.min(1, c.fill + tap) };
}

export function stepCapture(c: Capture, dtMs: number, hpFrac: number): { c: Capture; result: "going" | "caught" | "broke" } {
  const fill = Math.max(0, c.fill - (C.decayPerSec * (0.5 + hpFrac) * dtMs) / 1000);
  const next = { fill, ms: c.ms + dtMs };
  if (fill <= 0) return { c: next, result: "broke" };
  if (fill >= 1 && next.ms >= C.minMs) return { c: next, result: "caught" };
  return { c: next, result: "going" };
}
```

- [ ] **Step 4: 통과** — `npx vitest run shared/hunt/capture.test.ts` → PASS(4).
- [ ] **Step 5: 커밋(로컬)** — `git commit -m "feat(hunt): the capture gauge"`

---

### Task 5: 몬스터 상태 — 기절·졸음·잠·그물

**Files:**
- Create: `shared/hunt/status.ts`, `shared/hunt/status.test.ts`

**Interfaces:**
- Produces:
  - `type MobStatus = { kind: "free" } | { kind: "stunned"; ms: number } | { kind: "drowsy"; hits: number; fallMs: number | null } | { kind: "asleep"; ms: number } | { kind: "bound"; ms: number }`
  - `FREE: MobStatus`, `isHeld(s): boolean`(기절·잠·그물 = 움직이지 못함), `stun(s, ms)`, `dart(s, hitsNeeded, fallMs)`, `wake(s)`(맞으면 깸: 잠·졸음 → free), `bind(s, ms)`, `stepStatus(s, dtMs): { s: MobStatus; event: "fell_asleep" | "woke" | null }`

- [ ] **Step 1: 테스트**

```ts
import { describe, expect, it } from "vitest";
import { bind, dart, FREE, isHeld, stepStatus, stun, wake } from "./status";

describe("monster status (hunt v3 design 4.4)", () => {
  it("is held still while stunned, asleep or tied up, and free again after", () => {
    const s = stun(FREE, 1000);
    expect(isHeld(s)).toBe(true);
    expect(stepStatus(s, 1000).s).toEqual(FREE);
    expect(isHeld(bind(FREE, 500))).toBe(true);
  });
  it("falls asleep after enough darts and the fall time, then sleeps", () => {
    let s = dart(FREE, 2, 1500);
    expect(s).toEqual({ kind: "drowsy", hits: 1, fallMs: null });
    s = dart(s, 2, 1500);
    expect(s).toEqual({ kind: "drowsy", hits: 2, fallMs: 1500 });
    const r = stepStatus(s, 1500);
    expect(r.event).toBe("fell_asleep");
    expect(r.s.kind).toBe("asleep");
  });
  it("wakes when hit, and wakes by itself after its sleep", () => {
    expect(wake({ kind: "asleep", ms: 9000 })).toEqual(FREE);
    expect(wake({ kind: "drowsy", hits: 1, fallMs: null })).toEqual(FREE);
    expect(stepStatus({ kind: "asleep", ms: 100 }, 100)).toEqual({ s: FREE, event: "woke" });
  });
  it("keeps drowsiness between darts that are not enough yet", () => {
    expect(stepStatus({ kind: "drowsy", hits: 1, fallMs: null }, 5000).s).toEqual({ kind: "drowsy", hits: 1, fallMs: null });
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현**

```ts
import { BALANCE } from "../balance";

// What the side weapons do to a monster, on top of its own behaviour (hunt v3 design 4.4): stunned by a
// pebble or a firecracker, drowsy from sleep darts until enough hit, then asleep (bag it with E for ★★★),
// tied up by the net. A held monster does not move or attack. A hit wakes a sleeping or drowsy one.
export type MobStatus =
  | { kind: "free" }
  | { kind: "stunned"; ms: number }
  | { kind: "drowsy"; hits: number; fallMs: number | null }
  | { kind: "asleep"; ms: number }
  | { kind: "bound"; ms: number };

export const FREE: MobStatus = { kind: "free" };

export const isHeld = (s: MobStatus): boolean => s.kind === "stunned" || s.kind === "asleep" || s.kind === "bound";

export const stun = (s: MobStatus, ms: number): MobStatus => (s.kind === "asleep" ? s : { kind: "stunned", ms });
export const bind = (_s: MobStatus, ms: number): MobStatus => ({ kind: "bound", ms });
export const wake = (s: MobStatus): MobStatus => (s.kind === "asleep" || s.kind === "drowsy" ? FREE : s);

// One more sleep dart: drowsier, and once there are enough, the fall begins.
export function dart(s: MobStatus, hitsNeeded: number, fallMs: number): MobStatus {
  if (s.kind === "asleep") return s;
  const hits = (s.kind === "drowsy" ? s.hits : 0) + 1;
  return { kind: "drowsy", hits, fallMs: hits >= hitsNeeded ? (s.kind === "drowsy" && s.fallMs !== null ? s.fallMs : fallMs) : null };
}

export function stepStatus(s: MobStatus, dtMs: number): { s: MobStatus; event: "fell_asleep" | "woke" | null } {
  switch (s.kind) {
    case "stunned":
    case "bound":
      return { s: s.ms - dtMs <= 0 ? FREE : { ...s, ms: s.ms - dtMs }, event: null };
    case "asleep":
      return s.ms - dtMs <= 0 ? { s: FREE, event: "woke" } : { s: { ...s, ms: s.ms - dtMs }, event: null };
    case "drowsy":
      if (s.fallMs === null) return { s, event: null };
      return s.fallMs - dtMs <= 0 ? { s: { kind: "asleep", ms: BALANCE.hunt.sleepMs }, event: "fell_asleep" } : { s: { ...s, fallMs: s.fallMs - dtMs }, event: null };
    default:
      return { s, event: null };
  }
}
```

- [ ] **Step 4: 통과** — PASS(4). **Step 5: 커밋(로컬)** — `git commit -m "feat(hunt): monster status for stun, sleep darts, sleep and the net"`

---

### Task 6: 엄니대장 — 등장과 행동

**Files:**
- Create: `shared/hunt/tusk.ts`, `shared/hunt/tusk.test.ts`
- Modify: `shared/hunt/plan.ts` (2층에 seed로 엄니대장), `shared/hunt/plan.test.ts`, `shared/balance.ts` (`hunt.tusk`), `shared/hunt/settle.test.ts` (todo 켜기)

**Interfaces:**
- Produces:
  - `BALANCE.hunt.tusk = { chance: 0.6, wanderSpeed: 22, aggroRange: 150, chargeSpeed: 210, telegraphMs: 700, chargeMs: 650, charges: 3, chargeGapMs: 450, slamTelegraphMs: 900, slamRadius: 70, slamDamage: 20, grabRange: 24, grabRushSpeed: 150, grabRushMs: 1200, grabMashes: 12, grabMs: 2500, grabDamage: 35, recoverMs: 2000, contactDamage: 22, angryMul: 1.3 }`
  - `planFloor`가 2층에서 `rand() < tusk.chance`면 `{ id: "2-boss", monster: "tusk", x, y, wave: 0 }`을 하나 더한다(층 가운데쯤, 시작점에서 먼 곳).
  - `type TuskPattern = "charges" | "slam" | "grab"`, `interface TuskState { pos; phase: "wander" | "telegraph" | "charge" | "gap" | "slamWindup" | "slam" | "rush" | "grab" | "recover"; phaseMs; facing; chargeDir; chargesLeft; pattern: TuskPattern; nextPattern: number; angry: boolean; mashes: number; hitThisMove: boolean }`, `newTusk(pos)`, `updateTusk(s, player, dtMs, field, rand): { state; hurt: { damage: number } | null; grabbed: boolean; slam: Vec | null }`, `mashTusk(s): TuskState`(깔아뭉개기 중 연타), `isTuskVulnerable(s)`(`recover`)

- [ ] **Step 1: 테스트** — `shared/hunt/tusk.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BALANCE } from "../balance";
import { FLOORS } from "../content/floors";
import { planFloor } from "./plan";
import { isTuskVulnerable, mashTusk, newTusk, updateTusk, type TuskState } from "./tusk";

const T = BALANCE.hunt.tusk;
const field = FLOORS[2].field;
const run = (s: TuskState, ms: number, player = { x: s.pos.x + 60, y: s.pos.y }) => {
  let st = s;
  let hurt = 0;
  let grabbed = false;
  for (let t = 0; t < ms; t += 16) {
    const r = updateTusk(st, player, 16, field, () => 0.5);
    st = r.state;
    if (r.hurt) hurt += r.hurt.damage;
    grabbed ||= r.grabbed;
  }
  return { st, hurt, grabbed };
};

describe("the tusk boss (hunt v3 design 4.7)", () => {
  it("appears on floor 2 for some hunts only, the same for the same seed, never on floor 1", () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
    const withBoss = seeds.filter((s) => planFloor(s, 2, "morning").spawns.some((x) => x.monster === "tusk"));
    expect(withBoss.length).toBeGreaterThan(10);
    expect(withBoss.length).toBeLessThan(40);
    expect(seeds.some((s) => planFloor(s, 1, "morning").spawns.some((x) => x.monster === "tusk"))).toBe(false);
    expect(planFloor(withBoss[0], 2, "morning")).toEqual(planFloor(withBoss[0], 2, "morning"));
  });
  it("opens with three charges in a row, then catches its breath (open to counters)", () => {
    const s = newTusk({ x: 600, y: 500 });
    const { st } = run(s, 3 * (T.telegraphMs + T.chargeMs + T.chargeGapMs) + 200);
    expect(st.phase).toBe("recover");
    expect(isTuskVulnerable(st)).toBe(true);
  });
  it("cycles its patterns: charges, then the slam, then the grab", () => {
    let s: TuskState = { ...newTusk({ x: 600, y: 500 }), nextPattern: 1 };
    s = run(s, 300).st;
    expect(s.pattern).toBe("slam");
    s = { ...newTusk({ x: 600, y: 500 }), nextPattern: 2 };
    s = run(s, 300).st;
    expect(s.pattern).toBe("grab");
  });
  it("hurts on the slam only within its circle", () => {
    const near = run({ ...newTusk({ x: 600, y: 500 }), nextPattern: 1 }, T.slamTelegraphMs + 400, { x: 640, y: 500 });
    const far = run({ ...newTusk({ x: 600, y: 500 }), nextPattern: 1 }, T.slamTelegraphMs + 400, { x: 600 + T.aggroRange - 5, y: 500 });
    expect(near.hurt).toBeGreaterThanOrEqual(T.slamDamage);
    expect(far.hurt).toBe(0);
  });
  it("pins the hunter on the grab: enough mashes free him, too few cost dearly", () => {
    const grabbing: TuskState = { ...newTusk({ x: 600, y: 500 }), phase: "grab", phaseMs: 0, pattern: "grab" };
    let freed = grabbing;
    for (let i = 0; i < T.grabMashes; i++) freed = mashTusk(freed);
    expect(freed.phase).toBe("recover");
    const late = run(grabbing, T.grabMs + 50);
    expect(late.hurt).toBeGreaterThanOrEqual(T.grabDamage);
  });
});
```

`shared/hunt/settle.test.ts`의 `it.todo(...)`를:

```ts
  it("doubles the tusk boss's parts", () => {
    let s: SaveData | null = null;
    for (let r = 0; r < 1 && !s; r += 0.01) {
      const tried = applyAction(newSave(), { type: "startHunt", zone: "forest", side: "sling" }, { now: T0, random: () => r }).save;
      if (planFloor(tried.hunt!.seed, 2, "morning").spawns.some((x) => x.monster === "tusk")) s = tried;
    }
    const res = finish(s!, [{ down: 2 }, { take: "2-boss", how: "down" }], "2-e0", false, T0 + 600_000);
    expect(res.error).toBeUndefined();
    expect(count(res.save.items)).toBe(2);
  });
```

`shared/hunt/plan.test.ts`의 "brings the floor's roster" 테스트의 2층 줄 `count(m2, "boar")`… 기대값은 엄니대장을 빼고 세므로 그대로(엄니대장은 `monster: "tusk"`).

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — `shared/hunt/tusk.ts`:

```ts
import { BALANCE } from "../balance";
import { clampToField, distance, stepToward, unit } from "./geometry";
import type { Field, Vec } from "./types";

// The tusk boss (hunt v3 design 4.7, user-chosen "엄니대장"): a big boar that wanders until the hunter
// comes near, then runs its patterns in turn — three charges in a row, a ground slam (a circle warned
// before the shock), a rush that pins the hunter (mash to break free) — and after each big pattern
// catches its breath for recoverMs, the window to hit it. Woken from sleep it is angry: faster.
const T = BALANCE.hunt.tusk;
export type TuskPattern = "charges" | "slam" | "grab";
const ORDER: TuskPattern[] = ["charges", "slam", "grab"];

export interface TuskState {
  pos: Vec;
  phase: "wander" | "telegraph" | "charge" | "gap" | "slamWindup" | "slam" | "rush" | "grab" | "recover";
  phaseMs: number;
  facing: Vec;
  chargeDir: Vec;
  chargesLeft: number;
  pattern: TuskPattern;
  nextPattern: number;
  angry: boolean;
  mashes: number;
  hitThisMove: boolean;
  wanderTarget: Vec | null;
}

export const newTusk = (pos: Vec): TuskState => ({
  pos, phase: "wander", phaseMs: 0, facing: { x: -1, y: 0 }, chargeDir: { x: -1, y: 0 }, chargesLeft: 0,
  pattern: "charges", nextPattern: 0, angry: false, mashes: 0, hitThisMove: false, wanderTarget: null,
});

export const isTuskVulnerable = (s: TuskState): boolean => s.phase === "recover";

// One mash while pinned: enough of them throw the boss off, and it has to catch its breath.
export function mashTusk(s: TuskState): TuskState {
  if (s.phase !== "grab") return s;
  const mashes = s.mashes + 1;
  return mashes >= T.grabMashes ? { ...s, phase: "recover", phaseMs: 0, mashes: 0 } : { ...s, mashes };
}

export function updateTusk(s: TuskState, player: Vec, dtMs: number, field: Field, rand: () => number): { state: TuskState; hurt: { damage: number } | null; grabbed: boolean; slam: Vec | null } {
  const speed = (v: number) => v * (s.angry ? T.angryMul : 1);
  const dt = dtMs / 1000;
  const phaseMs = s.phaseMs + dtMs;
  const toPlayer = unit({ x: player.x - s.pos.x, y: player.y - s.pos.y }, s.facing);
  const none = { hurt: null, grabbed: false, slam: null };
  const begin = (pattern: TuskPattern): TuskState => {
    const base = { ...s, pattern, nextPattern: (ORDER.indexOf(pattern) + 1) % ORDER.length, phaseMs: 0, facing: toPlayer, hitThisMove: false, wanderTarget: null };
    if (pattern === "charges") return { ...base, phase: "telegraph", chargesLeft: T.charges, chargeDir: toPlayer };
    if (pattern === "slam") return { ...base, phase: "slamWindup" };
    return { ...base, phase: "rush", chargeDir: toPlayer };
  };
  switch (s.phase) {
    case "wander": {
      if (distance(s.pos, player) <= T.aggroRange) return { state: begin(ORDER[s.nextPattern]), ...none };
      const target = s.wanderTarget ?? { x: field.minX + rand() * (field.maxX - field.minX), y: field.minY + rand() * (field.maxY - field.minY) };
      const step = stepToward(s.pos, target, speed(T.wanderSpeed) * dt);
      return { state: { ...s, pos: clampToField(step.pos, field), phaseMs, facing: unit({ x: target.x - s.pos.x, y: target.y - s.pos.y }, s.facing), wanderTarget: step.arrived ? null : target }, ...none };
    }
    case "telegraph":
      return { state: phaseMs >= T.telegraphMs ? { ...s, phase: "charge", phaseMs: 0, hitThisMove: false } : { ...s, phaseMs, chargeDir: toPlayer, facing: toPlayer }, ...none };
    case "charge": {
      const pos = clampToField({ x: s.pos.x + s.chargeDir.x * speed(T.chargeSpeed) * dt, y: s.pos.y + s.chargeDir.y * speed(T.chargeSpeed) * dt }, field);
      const hit = !s.hitThisMove && distance(pos, player) <= 22;
      const done = phaseMs >= T.chargeMs;
      const left = s.chargesLeft - (done ? 1 : 0);
      const next: TuskState = done ? (left > 0 ? { ...s, pos, phase: "gap", phaseMs: 0, chargesLeft: left } : { ...s, pos, phase: "recover", phaseMs: 0, chargesLeft: 0 }) : { ...s, pos, phaseMs, hitThisMove: s.hitThisMove || hit };
      return { state: next, hurt: hit ? { damage: T.contactDamage } : null, grabbed: false, slam: null };
    }
    case "gap":
      return { state: phaseMs >= T.chargeGapMs ? { ...s, phase: "telegraph", phaseMs: 0, chargeDir: toPlayer, facing: toPlayer } : { ...s, phaseMs }, ...none };
    case "slamWindup":
      return { state: phaseMs >= T.slamTelegraphMs ? { ...s, phase: "slam", phaseMs: 0 } : { ...s, phaseMs }, ...none };
    case "slam": {
      const hit = distance(s.pos, player) <= T.slamRadius;
      return { state: { ...s, phase: "recover", phaseMs: 0 }, hurt: hit ? { damage: T.slamDamage } : null, grabbed: false, slam: s.pos };
    }
    case "rush": {
      const pos = clampToField({ x: s.pos.x + s.chargeDir.x * speed(T.grabRushSpeed) * dt, y: s.pos.y + s.chargeDir.y * speed(T.grabRushSpeed) * dt }, field);
      if (distance(pos, player) <= T.grabRange) return { state: { ...s, pos, phase: "grab", phaseMs: 0, mashes: 0 }, hurt: null, grabbed: true, slam: null };
      return { state: phaseMs >= T.grabRushMs ? { ...s, pos, phase: "recover", phaseMs: 0 } : { ...s, pos, phaseMs, chargeDir: toPlayer }, ...none };
    }
    case "grab":
      return phaseMs >= T.grabMs ? { state: { ...s, phase: "recover", phaseMs: 0, mashes: 0 }, hurt: { damage: T.grabDamage }, grabbed: false, slam: null } : { state: { ...s, phaseMs }, ...none };
    case "recover":
      return { state: phaseMs >= T.recoverMs ? { ...s, phase: "wander", phaseMs: 0 } : { ...s, phaseMs }, ...none };
  }
}
```

`shared/hunt/plan.ts`의 `planFloor` 끝(`return` 앞):

```ts
  // the tusk boss (hunt v3 design 4.7): some hunts only, on floor 2, somewhere away from the arrival
  if (floor === 2 && rand() < BALANCE.hunt.tusk.chance) {
    const at = spots(s0 + 400, 1, 0, 24)[0];
    if (at) spawns.push({ id: "2-boss", monster: "tusk", x: at.x, y: at.y, wave: 0 });
  }
```

(`import { BALANCE } from "../balance";`.) `shared/balance.ts`에 `tusk` 타입·값(Interfaces의 숫자)을 더한다.

- [ ] **Step 4: 통과** — `npx vitest run shared` → PASS(todo 없음).
- [ ] **Step 5: 커밋(로컬)** — `git commit -m "feat(hunt): the tusk boss on floor 2 for some hunts, with its three patterns and the pin to mash out of"`

---

### Task 7: 사냥 화면 — 조작 바꾸기와 보조무기 발사

**Files:**
- Modify: `src/game/scenes/HuntScene.ts`, `src/game/hunt/mobs.ts`, `src/screens/DayFlow.tsx` (`HuntData.side`·`sideLevel`·`sideAmmo`·`harpoonLevel` 넘기기)

**Interfaces:**
- Consumes: `SideWeaponId`, `ammoOf`, `sleepFallMs`, `level` (작업 2), `MobStatus` 함수(작업 5), `BALANCE.hunt.sling/firecracker/netBindMs/netSmallMaxRadius/sleepHits` (작업 3)
- Produces: `Mob.status: MobStatus`, `Run.ammo: number`(층을 넘어 이어짐), `HuntData.side: SideWeaponId`, `HuntData.ammo: number`, `HuntData.harpoonLevel: number`, `HuntData.sleepFallMs: number`

- [ ] **Step 1: 몬스터에 상태 붙이기** — `src/game/hunt/mobs.ts`: `Mob`에 `status: MobStatus`(createMob에서 `FREE`), `stepMob` 맨 앞에서 `const st = stepStatus(m.status, dt); m.status = st.s; if (isHeld(m.status)) return { phaseChanged: false, statusEvent: st.event };`(반환 타입 `MobStep`에 `statusEvent?: "fell_asleep" | "woke" | null`), 졸음 중이면 이동 속도를 절반으로(드로우 쪽에서 비틀거림). `drawMob`에서 상태별 그림: 잠 = 옆으로 누운 정지 프레임(`setAngle(90)`이 아니라 `${monster}_side_0` 정지 + 위아래 2px 숨쉬기 tween), 기절 = 정지 + 머리 위 `@@` 글자, 그물 = 정지 + 머리 위 `#` 글자(TEXT, 노랑). 맞으면 `wake`(applyHit에서).

- [ ] **Step 2: 조작** — `createMouseControls`: 우클릭 = `this.sideQueued = 조준점`, 좌클릭 = 작살(포획 중이면 연타). 키: `Space` = 식칼(`slashQueued`), `Keys`에 `SPACE`, `ESC` 추가. 모바일: 베기 버튼 그대로, 그 위에 보조무기 버튼(`SIDE_BTN`, 아이콘 = `side_${id}`), 누르면 지금 조준 방향으로 발사.

- [ ] **Step 3: 발사체** — 새총·수면총·그물총은 `shared/hunt/harpoon.ts`의 `fireHarpoon`/`stepHarpoon`/`harpoonHit`을 그대로 써서 직선 비행(속도 `BALANCE.hunt.sling.speed`, 사거리 `sling.range`), 그림은 작은 아이콘(`side_<id>`를 0.5배, 날아가며 회전). 맞으면:
  - 새총: `applyHit(m, "ranged", sling.damage, [])` 후 `m.status = stun(m.status, sling.stunMs)`.
  - 수면총: `m.status = dart(m.status, BALANCE.hunt.sleepHits[m.spawn.monster], this.huntData.sleepFallMs)`, 머리 위 졸음 게이지 갱신(작업 10).
  - 그물총: 반지름 ≤ `netSmallMaxRadius`면 바로 `this.take(m, "net")`, 아니면 `m.status = bind(m.status, BALANCE.hunt.netBindMs)`.
  - 폭죽: 조준점(최대 `firecracker.range`)에 떨어져 0.4초 뒤 터짐 — 반경 안 몬스터 모두 `stun`, 닭은 무리째 바깥으로 밀려나며(`setMobPos` + `stun`) 흩어짐, 화면 흔들림. 몬스터를 깨우지 않는다(소리로 놀람 = 기절).
  - 쏠 때마다 `this.run.ammo--`, 0이면 발사 안 됨(HUD에 "탄 없음").

- [ ] **Step 4: 잡기 한 곳으로** — `killMob`을 `take(m, how: TakeHow)`로 바꾼다: `this.run.report.push({ take: m.spawn.id, how })`, 가방에 `takeYield(how, m.spawn.monster === "tusk")` 개수만큼 `itemKey(dropFor(seed, spawn), grade)`, 사라지는 연출·리필은 지금 그대로. 체력 0 = `take(m, "down")`. E로 잠든 몬스터 옆(28px 안)이면 `nearestUse`가 `{ kind: "sleeper", mob }`를 돌려주고 `take(m, "sleep")`.

- [ ] **Step 5: 타입·테스트** — `npm run typecheck`(작업 9 전까지 엄니대장·포획 부분이 남아 있으면 그 줄만 깨질 수 있다), `npx vitest run`.

- [ ] **Step 6: 실제 화면** — 시드 페이지에 `upgrades: { sleepGun: 1, netGun: 1, firecracker: 1 }`, `stage: "hunt"`를 둔 `seed-hunt-weapons.html`을 만들고, `shot.mjs`로 우클릭 대신 키(`@press C` — 키보드 보조무기 `C`를 함께 만든다) 발사를 찍는다: 새총 맞은 토끼 위 `@@`, 수면총 2발 맞은 멧돼지가 잠듦.

- [ ] **Step 7: 커밋(로컬)** — `git commit -m "feat(hunt): right click fires the side weapon, Space slashes; slingshot stuns, sleep darts put to sleep, the net catches, the firecracker scatters"`

---

### Task 8: 사냥 화면 — 작살 포획

**Files:**
- Modify: `src/game/scenes/HuntScene.ts`

**Interfaces:**
- Consumes: `startCapture`, `tapCapture`, `stepCapture` (작업 4), `take(m, "capture")` (작업 7)

- [ ] **Step 1: 끌어온 다음 포획** — `updateHarpoon`에서 끌어오기가 끝나면(`r.done`) `dazeMob` 대신 `this.capturing = { mob: m, c: startCapture() }`. 포획 중: 사냥꾼은 못 움직이고(다른 공격 불가), 몬스터 상태는 묶임과 같다. 좌클릭·Space·모바일 탭 = `tapCapture(c, harpoonLevel)`; 매 프레임 `stepCapture(c, dt, m.hp / MONSTERS[...].maxHp)`. `caught` → `take(m, "capture")`, `broke` → 줄 끊김 연출 + 몬스터가 화남: 멧돼지 = 바로 돌진 예고(`telegraph`), 토끼 = 도망(`fleerHit`), 닭 = 무리 공격(`angerFlock`), 벌 = 조준(`aim`), 엄니대장 = 다음 패턴.
- [ ] **Step 2: 빗맞힘** — 작살이 아무것도 못 맞히고 끝나면 줄을 0.6초 동안 사냥꾼 손으로 감아들이는 선(지금 `drawFx`의 줄 그리기 재사용)을 보여 주고 그동안 `harpoonCooldownMs`를 600 이상으로 둔다.
- [ ] **Step 3: 자동 연타** — 설정 `localStorage["monster-bbq:autoMash"] === "1"`(try/catch)이면 포획·깔아뭉개기 중 120ms마다 저절로 연타.
- [ ] **Step 4: 타입·테스트·실제 화면** — 시드 페이지에서 토끼에 작살 → 연타(`@press Space` 반복) → "포획!"; 연타 안 하면 끊김.
- [ ] **Step 5: 커밋(로컬)** — `git commit -m "feat(hunt): reeled-in monsters struggle on the capture gauge; mash to bag them, or the rope breaks and they turn on you"`

---

### Task 9: 사냥 화면 — 엄니대장, 그리고 첫 배포

**Files:**
- Modify: `src/game/scenes/HuntScene.ts`, `src/game/hunt/mobs.ts`, `src/game/hunt/anims.ts`, `src/i18n/ko.ts`, `src/i18n/en.ts`

**Interfaces:**
- Consumes: `newTusk`, `updateTusk`, `mashTusk`, `isTuskVulnerable` (작업 6), 보조무기 아이콘(작업 1, 승인됨)

- [ ] **Step 1: 몬스터 종류 `boss`** — `createMob`이 `tusk`면 `{ kind: "boss", s: newTusk(pos) }`, 그림은 멧돼지 프레임을 2배(`setScale(CHAR_SCALE * 2)`, 정수배 아님을 피하려면 `CHAR_SCALE`(0.7)과 곱한 1.4 — **Ruling 기록**: 그림 크기 배율), `stepMob`에 `boss` 분기: `updateTusk` 결과의 `hurt` → 사냥꾼 피해, `grabbed` → `this.pinned = m`(사냥꾼 못 움직임, 연타 = `mashTusk`), `slam` → 화면 흔들림 + 원 표시. `drawMob`: `telegraph`/`slamWindup` = 빨간 번쩍임 + 예고(돌진 길은 지금 `drawLane`, 땅 구르기는 원 — `drawFx`에서 반경 원을 빨간 선으로), `recover` = 헐떡임(정지 프레임 + "헉헉").
- [ ] **Step 2: 등장 카드와 체력 막대** — 엄니대장이 처음 화면에 들어오면 1.5초 이름 카드("이 구역 대장이다! · 엄니대장", 층 카드와 같은 키트 조각, 탭으로 건너뛰기), 화면 위 가운데에 키트 게이지(`addGauge`, 폭 240)로 체력. 잡히면 대사 "돌진대왕 형님한테 이르지 마…"(말풍선 키트, 2초).
- [ ] **Step 3: HUD 보조무기** — 오른쪽 아래에 고른 보조무기 아이콘 + 남은 탄 수(TEXT), 0이면 회색. 모바일 버튼에도 같은 아이콘.
- [ ] **Step 4: 문구** — ko/en에 `hunt.side.{sling,sleepGun,netGun,firecracker}`, `hunt.noAmmo`("탄이 없다"), `hunt.captured`("포획!"), `hunt.ropeBroke`("줄이 끊겼다!"), `hunt.take`("E 담기"), `hunt.mash`("연타!"), `hunt.tuskCard`("이 구역 대장이다!"), `hunt.tuskName`("엄니대장"), `hunt.tuskCaught`("돌진대왕 형님한테 이르지 마…"), `hunt.panting`("헉헉").
- [ ] **Step 5: 전체 확인** — `npm run typecheck` + `npm test` 모두 통과(이 작업부터 필수). 시드 페이지로 실제 화면: 2층 엄니대장 등장 카드, 체력 막대, 깔아뭉개기 연타.
- [ ] **Step 6: 커밋하고 첫 배포** — 사용자에게 서버 하네스 실행을 알리고 `npm run test:server`(하네스의 `finishHunt` 보고를 `take`로 바꿔 둔다). 통과하면 `git push -q gitlab develop; git push -q github develop:main`.

---

### Task 10: 손맛 연출

**Files:**
- Modify: `src/game/scenes/HuntScene.ts`

- [ ] **Step 1: 포획** — 포획 중 줄이 팽팽하게 떨림(줄 끝 좌우 1px 흔들림), 몬스터 위 원형 포획 게이지(키트 `gauge_empty`/`gauge_full`을 짧은 막대로 — 원형 그림이 없으므로 **막대**로 하고 Ruling 기록), 연타마다 게이지가 튀고 화면 살짝 흔들림(`shake(60, 0.004)`), 성공하면 "포획!" 도장(굵은 글자가 크게 찍혔다 작아짐 + 0.1초 멈춤) + "★★"가 튀어 오름.
- [ ] **Step 2: 재우기** — 머리 위 졸음 게이지(같은 키트 막대, 파랑 대신 키트 색 그대로 + "z" 글자 수가 늘어남), 비틀(좌우 기울임 tween) → 털썩(정지 + 아래로 2px) + "Zzz" 글자가 위로 떠오르며 반복, E로 담으면 "★★★" + 반짝(글자 `✦` 몇 개 흩어짐).
- [ ] **Step 3: 담은 재료가 가방으로** — 잡을 때 재료 아이콘이 몬스터 위에서 화면 왼쪽 위 가방 글자 쪽으로 곡선을 그리며 날아감(지금 `popItem` 대신).
- [ ] **Step 4: 실제 화면** — 포획 도장·별·Zzz 장면을 찍어 사용자에게 보여 준다.
- [ ] **Step 5: 커밋·푸시** — `git commit -m "feat(hunt): the feel of a catch — taut rope, capture stamp and stars, drowsy sway, Zzz, parts flying to the bag"` 후 두 원격에 푸시.

---

### Task 11: 출발 준비(보조무기 고르기)·일시정지·귀환 정산

**Files:**
- Create: `src/screens/SidePick.tsx`, `src/screens/HuntSummary.tsx`
- Modify: `src/screens/DayFlow.tsx`, `src/screens/kitchen/Kitchen.tsx`, `src/screens/dayflow.css`, `src/screens/Upgrades.tsx`, `src/i18n/*`, `src/game/scenes/HuntScene.ts`

- [ ] **Step 1: 보조무기 고르기** — `SidePick({ save, onGo, onCancel })`: 키트 패널에 가진 보조무기 카드(아이콘·이름·탄 수), 안 가진 것은 잠금 표시와 값. 아침: DayFlow의 자동 출발을 없애고 `phase === "hunt" && !save.hunt`이면 `SidePick`을 띄운다(지난번 고른 것을 `localStorage["monster-bbq:side"]`로 기억, 없으면 새총). 점심의 "오후 사냥 나가기"도 이 창을 연다. `onGo(side)` → `act({ type: "startHunt", zone: "forest", side }, "hunt")`.
- [ ] **Step 2: 업그레이드 화면** — `Upgrades.tsx`의 사냥 묶음에 `sling, sleepGun, netGun, firecracker`(아이콘 `test/ui/side/<id>.png`), 효과 글 = 탄 수 `{a}발 → {b}발`(수면총은 "잠드는 시간 {a}초 → {b}초"도), 레벨 0은 "사기".
- [ ] **Step 3: 일시정지** — Esc(모바일: 오른쪽 위 작은 ‖ 버튼, 키트 `btn_small`) = 장면 멈춤 + 키트 패널: [계속] [자동 연타: 켜짐/꺼짐]. 사냥 기력은 멈춘 동안 줄지 않는다.
- [ ] **Step 4: 귀환 정산** — `finishHunt`가 받아들여지면 다음 화면 전에 `HuntSummary`: 보고를 별 등급별로 묶어 "★★★ 재우기·그물 2마리 / ★★ 포획 3 / ★ 쓰러뜨림 4", 가져온 재료 아이콘과 개수(세이브 전후 `items` 차이), [계속]. 기절이면 "가방 절반을 잃었다" 줄.
- [ ] **Step 5: 실제 화면** — 고르기 창(아침·점심), 일시정지, 귀환 정산을 찍어 보여 준다.
- [ ] **Step 6: 커밋·푸시** — `git commit -m "feat(day): pick the side weapon before setting out; pause with auto-mash; the hunt's take by stars on the way home"`

---

### Task 12: 서버 하네스·점검표

- [ ] `server/test/server.test.ts`에 "재우기는 수면총을 들고 나갔을 때만" 테스트 하나(`startHunt side: "sling"` → `finishHunt [{ take: <1층 첫 몬스터>, how: "sleep" }]` → 거부)를 더한다. 사용자에게 알리고 `npm run test:server`.
- [ ] `npm run typecheck && npm test && npm run build`, docs/VERSE8.md 점검표(서버 검증: 보조무기·탄·시간; 재시도: startHunt; 실패: 거절된 보고).
- [ ] 스펙 상태 줄 "2단계(무기) 구현됨", 푸시.

---

### Task 13: 효과음 (Mixkit, 허락 필요)

- [ ] Mixkit에서 고를 소리 목록(작살 발사, 줄 감기, 버둥, 포획 성공, 코골이, 우두머리 등장, 층 이동, 경고음, 새총, 폭죽)과 각 후보 페이지 링크를 사용자에게 보여 주고 **내려받기 허락**을 받는다. 허락받은 것만 `public/sfx/`에 넣고 `docs/CREDITS.md`에 출처를 적는다.
- [ ] `src/game/sfx.ts`(작은 래퍼: 볼륨 하나, 음소거 설정)로 사냥 장면의 해당 순간에 붙인다. 실제로 들어 보고 커밋·푸시.
