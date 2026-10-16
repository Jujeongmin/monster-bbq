# 06b-1 황금 숯 · VX 상점 · 각성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 superpowers:executing-plans(사용자가 고른 방식). 출시 전이라 큰 검토자 에이전트는 돌리지 않는다(사용자, 2026-10-15) — 단, 결제 지급은 마지막에 한 번 꼼꼼히 본다. 작업이 바뀔 때마다 사용자에게 "진행할까요?"(2026-10-16).

**Goal:** VX로 황금 숯을 사고(첫 구매 2배·VIP 보너스·실제 값 효율 띠), 숯과 골드로 사냥 장비 7개와 요리 9종을 별 1~20까지 각성해 강해지고 더 비싸게 판다. 지급은 서버 웹훅에서만, 같은 결제는 한 번만.

**Architecture:** 세이브 v9에 `charcoal`·`stars`·`vip`·`shop`. 규칙은 전부 `shared/`(서버와 `?local` 모드가 같은 코드): 각성 표와 배수(`shared/awaken.ts`), 상품 표(`shared/content/products.ts`), 지급·상점 제안·VIP(`shared/shop.ts`). 서버는 `$onItemPurchased`가 `act`와 같은 잠금 안에서 `grantPurchase`를 부른다. 클라이언트는 VXShop을 `src/net/shop.ts` 하나에 모으고, 상점 화면·각성 탭·위쪽 막대를 더한다.

**Tech Stack:** TypeScript 5.7, React 18, Phaser 3.90, vitest 3, `@verse8/platform/vanilla`(VXShop), `@agent8/gameserver`(서버 하네스).

**Spec:** [06b-1 설계](../specs/2026-10-16-06b1-charcoal-shop-awakening-design.md)

## Global Constraints

- 숫자는 `BALANCE` 한 곳(설계 1·2·3장 표 그대로): 각성 별마다 ×1.1, 별 1~10 골드 = 200 × 별², 별 1~10 숯 = 5, 8, 10, 14, 18, 22, 26, 30, 35, 40, 별 11~20 숯 = 120, 160, 200, 260, 320, 380, 460, 540, 560, 600. 상품 = 설계 2장 표. VIP 문턱 = 100 / 500 / 1,500 / 3,000 / 6,000 / 12,000 / 25,000 / 45,000 / 70,000 / 100,000, 보너스 = 2/4/6/8/10/13/16/19/22/25%, 하루 숯 = VIP × 2. 보스 첫 처치 숯 50.
- 피해·요리 값 = round(기본 × 1.1ⁿ). 받는 피해 = 기본 ÷ 1.1ⁿ(반올림 없음). 수면 다트 수 = ceil(기본 ÷ 1.1ⁿ). 그물 묶는 시간 × 1.1ⁿ.
- **폭죽은 피해가 없어서(지금 규칙: 기절만) 폭죽 각성은 기절 시간 × 1.1ⁿ** — 설계 표의 "폭죽 피해"와 다르다. 계획 승인 때 사용자에게 알린다.
- 효율 띠 = floor(실제로 받는 숯 × (100 ÷ 30) ÷ 가격 × 100)%. 골드는 계산에서 뺀다.
- 지급은 서버 `$onItemPurchased`만. 클라이언트 `onClose`는 화면 갱신만. Product ID는 대시보드와 글자까지 같다.
- 세이브 하나·`$lock`(CLAUDE.md 결정, `$asset` 안 씀). 서버 행동은 public endpoint, 인자를 믿지 않는다.
- 사용자에게 보이는 글은 전부 `t()`(ko 기준, en 같은 키). UI는 지금 키트(`ui-panel`, `ui-box`, `ui-btn`, `ui-tab`, `ui-ribbon`, `ui-plate`), CSS 색 박스로 새 창·버튼을 만들지 않는다.
- 그림(숯 아이콘·상품 아이콘·VIP 배지)은 승인 전엔 지금 그림으로 대신하고 파일만 넣으면 바뀌게(`hasArt`). 작은 소품이라 Codex + `art-src/codex/pixelsnap.py`.
- 서버 하네스(`npm run test:server`)는 실행 전에 사용자에게 알린다. 작업마다 커밋, 작업 8 끝에 점검표·푸시.

## Review Focus

- 웹훅이 같은 `purchaseId`로 두 번(또는 동시에) 오면 한 번만 지급 → 작업 3 테스트 "같은 purchaseId 두 번", 작업 4 하네스.
- 결제 창을 닫은 직후 웹훅이 아직 안 왔을 때 숯이 0으로 보여 다시 사는 사고 → 작업 5: 닫힌 뒤 1초·4초에 다시 읽고, 그동안 "확인 중" 표시.
- 각성 버튼 연타·느린 네트워크 → 작업 1 테스트 "`from`이 지난 별이면 아무것도 안 바뀜".
- 사냥·장사 도중 각성으로 값이 바뀌어 정산 검증이 어긋남 → 작업 1: 사냥·장사 중에는 각성 거부(`wrong_stage`), 테스트.
- VIP 단계가 오르는 그 결제의 보너스(오르기 전 단계로 계산) → 작업 3 테스트 "경계값".

---

### Task 1: 세이브 v9와 각성 규칙

**Files:**
- Create: `shared/awaken.ts`, `shared/awaken.test.ts`
- Modify: `shared/balance.ts`(`awaken` 표), `shared/save.ts`(v9), `shared/actions.ts`(`awaken` 행동), `shared/save.test.ts`, `src/net/transport.ts`(`asSave` 버전 9)

**Interfaces:**
- Produces: `AWAKEN_GEAR`, `type AwakenTarget`, `isAwakenTarget(v)`, `MAX_STARS = 20`, `starLevel(save, target): number`, `starMul(stars: number): number`, `awakenCost(toStar: number): { gold: number; charcoal: number }`, `canAwaken(save, target): boolean`. 세이브 필드 `charcoal: number`, `stars: Partial<Record<AwakenTarget, number>>`, `vip: { spent: number; day: number }`, `shop: { firstBuy: string[]; purchases: string[] }`. 행동 `{ type: "awaken"; target: string; from: number }`.

- [ ] **Step 1: 실패하는 테스트** — `shared/awaken.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { applyAction } from "./actions";
import { awakenCost, canAwaken, starLevel, starMul } from "./awaken";
import { newSave, type SaveData } from "./save";

const ctx = { now: 1, random: () => 0.5 };
const rich = (over: Partial<SaveData> = {}): SaveData => ({ ...newSave(), stage: "kitchen", gold: 1_000_000, charcoal: 100_000, ...over });
const awaken = (s: SaveData, target: string, from = starLevel(s, target as never)) => applyAction(s, { type: "awaken", target, from }, ctx);

describe("awakening", () => {
  it("costs gold and a little charcoal up to star 10, charcoal alone after", () => {
    expect(awakenCost(1)).toEqual({ gold: 200, charcoal: 5 });
    expect(awakenCost(10)).toEqual({ gold: 20_000, charcoal: 40 });
    expect(awakenCost(11)).toEqual({ gold: 0, charcoal: 120 });
    expect(awakenCost(20)).toEqual({ gold: 0, charcoal: 600 });
    let charcoal = 0;
    for (let n = 1; n <= 20; n++) charcoal += awakenCost(n).charcoal;
    expect(charcoal).toBe(208 + 3600);
  });
  it("multiplies by 1.1 a star", () => {
    expect(starMul(0)).toBe(1);
    expect(starMul(20)).toBeCloseTo(6.7275, 3);
  });
  it("takes the gold and charcoal and adds a star", () => {
    const r = awaken(rich(), "melee");
    expect(r.error).toBeUndefined();
    expect([r.save.gold, r.save.charcoal, r.save.stars.melee]).toEqual([1_000_000 - 200, 100_000 - 5, 1]);
  });
  it("refuses short of gold or charcoal, past star 20, and changes nothing", () => {
    expect(awaken(rich({ gold: 199 }), "melee").error).toBe("no_gold");
    expect(awaken(rich({ charcoal: 4 }), "melee").error).toBe("no_charcoal");
    expect(awaken(rich({ stars: { melee: 20 } }), "melee").error).toBe("max_stars");
  });
  it("does nothing for a press that saw an older star (a retry, or a double tap)", () => {
    const once = awaken(rich(), "melee").save;
    const again = applyAction(once, { type: "awaken", target: "melee", from: 0 }, ctx);
    expect(again.error).toBeUndefined();
    expect(again.save).toBe(once);
    expect(applyAction(once, { type: "awaken", target: "melee", from: 5 }, ctx).error).toBe("bad_action");
  });
  it("awakens only side weapons bought and dishes researched", () => {
    expect(canAwaken(rich(), "sling")).toBe(true);
    expect(awaken(rich(), "netGun").error).toBe("not_owned");
    expect(awaken(rich(), "baeksuk").error).toBe("not_owned");
    expect(awaken(rich({ dishes: { baeksuk: 1 } }), "baeksuk").error).toBeUndefined();
    expect(awaken(rich(), "pot").error).toBe("bad_action");
  });
  it("waits while a hunt or a night service is on", () => {
    expect(awaken(rich({ hunt: { id: "h", seed: 1, zone: "forest", period: "morning", side: "sling", startedAt: 1 } }), "melee").error).toBe("wrong_stage");
    expect(awaken(rich({ service: { id: "s", seed: 1, startedAt: 1, dishes: [] } }), "melee").error).toBe("wrong_stage");
  });
});
```

`shared/save.test.ts`의 `FRESH`에 `charcoal: 0, stars: {}, vip: { spent: 0, day: 0 }, shop: { firstBuy: [], purchases: [] }`를 더하고 `version: 9`로, `readSave (version 8)` 묶음의 `valid`도 v9로 바꾸고 이 테스트를 더한다:

```ts
  it("reads a version 8 save as version 9 with no charcoal, stars, VIP or purchases", () => {
    const s = readSave({ ...valid, version: 8, charcoal: undefined, stars: undefined, vip: undefined, shop: undefined });
    expect(s.version).toBe(9);
    expect([s.charcoal, s.stars, s.vip, s.shop]).toEqual([0, {}, { spent: 0, day: 0 }, { firstBuy: [], purchases: [] }]);
    expect(readSave({ ...valid, stars: { melee: 25, nope: 3, ranged: -1 } }).stars).toEqual({ melee: 20 });
  });
```

- [ ] **Step 2: 실패 확인** — `npx vitest run shared/awaken.test.ts shared/save.test.ts` → `Cannot find module './awaken'`, 버전 기대값 실패.

- [ ] **Step 3: 구현**

`shared/balance.ts` 타입과 값(맨 아래 `service` 다음):

```ts
  // awakening (06b-1, user-approved 2026-10-16): stars 1-20, each ×mul; gold = goldPerStarSq × star² up
  // to goldUntil, charcoal by the star reached
  awaken: { mul: number; goldPerStarSq: number; goldUntil: number; charcoal: number[] };
```
```ts
  awaken: { mul: 1.1, goldPerStarSq: 200, goldUntil: 10, charcoal: [5, 8, 10, 14, 18, 22, 26, 30, 35, 40, 120, 160, 200, 260, 320, 380, 460, 540, 560, 600] },
```

`shared/awaken.ts`:

```ts
import { BALANCE } from "./balance";
import { isDishId, type DishId } from "./content/dishes";
import { isSideWeaponId } from "./content/sideWeapons";
import type { SaveData } from "./save";

// Awakening (06b-1 design 1): hunting gear and dishes take stars 1-20, each multiplying what they do
// by 1.1. Gold and a little charcoal up to star 10, charcoal alone after: the paid growth.
const A = BALANCE.awaken;
export const AWAKEN_GEAR = ["melee", "ranged", "armor", "sling", "sleepGun", "netGun", "firecracker"] as const;
export type AwakenTarget = (typeof AWAKEN_GEAR)[number] | DishId;
export const MAX_STARS = A.charcoal.length;

export const isAwakenTarget = (v: unknown): v is AwakenTarget => (AWAKEN_GEAR as readonly unknown[]).includes(v) || isDishId(v);
export const starLevel = (save: Partial<Pick<SaveData, "stars">>, t: AwakenTarget): number => save.stars?.[t] ?? 0;
export const starMul = (stars: number): number => A.mul ** stars;

// What reaching `toStar` (1..MAX_STARS) costs.
export function awakenCost(toStar: number): { gold: number; charcoal: number } {
  return { gold: toStar <= A.goldUntil ? A.goldPerStarSq * toStar * toStar : 0, charcoal: A.charcoal[toStar - 1] };
}

// Side weapons only once bought, dishes only once researched; the knife, harpoon and apron always.
// (Reads the upgrade level itself: shared/growth imports this file for the stars' effects.)
export function canAwaken(save: Pick<SaveData, "upgrades" | "dishes">, t: AwakenTarget): boolean {
  if (isDishId(t)) return (save.dishes[t] ?? 0) >= 1;
  if (isSideWeaponId(t)) return (save.upgrades[t] ?? BALANCE.upgrades[t].base) >= 1;
  return true;
}
```

`shared/save.ts`: `version: 9`, 필드 넷과 `newSave` 기본값, 읽기:

```ts
  // golden charcoal, awakening stars, VIP and the shop's record (06b-1)
  charcoal: number;
  stars: Partial<Record<AwakenTarget, number>>;
  vip: { spent: number; day: number };
  shop: { firstBuy: string[]; purchases: string[] };
```
```ts
function readStars(raw: unknown): Partial<Record<AwakenTarget, number>> {
  const out: Partial<Record<AwakenTarget, number>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) if (isAwakenTarget(k) && typeof v === "number" && Number.isInteger(v) && v > 0) out[k] = Math.min(MAX_STARS, v);
  return out;
}
const strings = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-max) : []);
```
`readSave`에서 `if (r.version === 8) return readSave({ ...r, version: 9 });`, `if (r.version !== 9) return newSave();`, 반환에:

```ts
    charcoal: count(r.charcoal),
    stars: readStars(r.stars),
    vip: { spent: count((r.vip as { spent?: unknown } | undefined)?.spent), day: count((r.vip as { day?: unknown } | undefined)?.day) },
    shop: { firstBuy: strings((r.shop as { firstBuy?: unknown } | undefined)?.firstBuy, 50), purchases: strings((r.shop as { purchases?: unknown } | undefined)?.purchases, 200) },
```

`shared/actions.ts`: `Action`에 `| { type: "awaken"; target: string; from: number }`, `applyAction`에 `case "awaken": return awaken(save, a);`, 함수:

```ts
// Awakening (06b-1): `from` is the star the screen saw, so a retry after a lost reply, or a second tap,
// finds the star already past it and changes nothing. Not while a hunt or a service is on (their
// settling checks use the stats they started with).
function awaken(save: SaveData, a: Record<string, unknown>): { save: SaveData; error?: string } {
  if (!isAwakenTarget(a.target)) return { save, error: "bad_action" };
  const now = starLevel(save, a.target);
  if (typeof a.from !== "number" || !Number.isInteger(a.from) || a.from > now) return { save, error: "bad_action" };
  if (a.from < now) return { save };
  if (save.hunt || save.service) return { save, error: "wrong_stage" };
  if (now >= MAX_STARS) return { save, error: "max_stars" };
  if (!canAwaken(save, a.target)) return { save, error: "not_owned" };
  const cost = awakenCost(now + 1);
  if (save.gold < cost.gold) return { save, error: "no_gold" };
  if (save.charcoal < cost.charcoal) return { save, error: "no_charcoal" };
  return { save: { ...save, gold: save.gold - cost.gold, charcoal: save.charcoal - cost.charcoal, stars: { ...save.stars, [a.target]: now + 1 } } };
}
```

`src/net/transport.ts` `asSave`: `r.version !== 9`.

- [ ] **Step 4: 통과 확인** — `npx vitest run` 전체 통과(버전 7·8을 기대하던 테스트는 9로).
- [ ] **Step 5: 커밋** — `git commit -m "feat(growth): awakening stars on gear and dishes (gold and charcoal), save v9"`

### Task 2: 각성이 실제로 강하게 만든다

**Files:**
- Modify: `shared/growth.ts`(`huntStats`), `shared/kitchen/dish.ts`(`planShop`), `shared/actions.ts`(`openShop`, `settleHunt` 다트 수), `shared/awaken.ts`(`sidePower`, `sleepDartsFor`), `src/game/scenes/HuntScene.ts`(보조무기 효과), `src/screens/DayFlow.tsx`(사냥 데이터), `src/screens/kitchen/MenuPick.tsx`
- Test: `shared/awaken.test.ts`에 추가

**Interfaces:**
- Consumes: `starLevel`, `starMul`(작업 1).
- Produces: `sidePower(save, side): number`, `sleepDartsFor(monster, sleepStars): number`, `planShop(items, levels, menu, stars = {})`, `HuntData.sidePower: number`.

- [ ] **Step 1: 실패하는 테스트**

```ts
import { huntStats } from "./growth";
import { planShop } from "./kitchen/dish";
import { sleepDartsFor } from "./awaken";
import { BALANCE } from "./balance";

describe("what the stars do", () => {
  it("hits harder with an awakened knife and harpoon, and the apron takes more off", () => {
    const base = huntStats({ upgrades: {} });
    const s = huntStats({ upgrades: {}, stars: { melee: 5, ranged: 3, armor: 2 } });
    expect(s.meleeDamage).toBe(Math.round(base.meleeDamage * 1.1 ** 5));
    expect(s.rangedDamage).toBe(Math.round(base.rangedDamage * 1.1 ** 3));
    expect(s.damageTaken).toBeCloseTo(base.damageTaken / 1.1 ** 2);
  });
  it("sells an awakened dish dearer", () => {
    const items = { "boar_belly:normal": 1 };
    const plain = planShop(items, { grilled_belly: 1 }, [{ dish: "grilled_belly", sets: 1 }])!;
    const star = planShop(items, { grilled_belly: 1 }, [{ dish: "grilled_belly", sets: 1 }], { grilled_belly: 4 })!;
    expect(star.dishes[0].price).toBe(Math.round(plain.dishes[0].price * 1.1 ** 4));
  });
  it("puts a monster to sleep with fewer darts, the server counting the same", () => {
    expect(sleepDartsFor("king", 0)).toBe(BALANCE.hunt.sleepHits.king);
    expect(sleepDartsFor("king", 8)).toBe(Math.ceil(BALANCE.hunt.sleepHits.king / 1.1 ** 8));
    expect(sleepDartsFor("rabbit", 20)).toBe(1);
  });
});
```

`shared/boss.test.ts`(또는 `actions.test.ts`)에 서버 다트 수 확인 하나: 수면총 별 8이면 돌진대왕을 `ceil(10 ÷ 1.1⁸) = 5`발로 재운 보고가 다트 5발짜리 수면총(레벨 1 = 4발 → 레벨 2 = 5발)으로 통과.

```ts
  it("counts the darts an awakened sleep gun needs", () => {
    // the sleep gun at level 2 carries 5 darts; the King takes 10, or ceil(10 / 1.1^8) = 5 at star 8
    const s: SaveData = { ...newSave(), upgrades: { boots: 1, lantern: 1, sleepGun: 2 }, bossKey: true, stars: { sleepGun: 8 } };
    const started = applyAction(s, { type: "startHunt", zone: "forest", side: "sleepGun" }, { now: T0, random: () => 0.3 }).save;
    expect(finish(started, [...toDen, king("sleep")], "5-e0").error).toBeUndefined();
    expect(finish({ ...started, stars: {} }, [...toDen, king("sleep")], "5-e0").error).toBe("bad_hunt");
  });
```

- [ ] **Step 2: 실패 확인** — `npx vitest run shared/awaken.test.ts shared/boss.test.ts`.

- [ ] **Step 3: 구현**

`shared/awaken.ts`에:

```ts
import type { MonsterId } from "./content/monsters";
import type { SideWeaponId } from "./content/sideWeapons";

// How much an awakened side weapon does: the slingshot's damage, the firecracker's stun, the net's hold
// (all × this); the sleep gun's darts per monster go down by it (sleepDartsFor).
export const sidePower = (save: Partial<Pick<SaveData, "stars">>, side: SideWeaponId): number => starMul(starLevel(save, side));
export const sleepDartsFor = (monster: MonsterId, sleepStars: number): number => Math.ceil(BALANCE.hunt.sleepHits[monster] / starMul(sleepStars));
```

`shared/growth.ts` `huntStats(save: Pick<SaveData, "upgrades"> & Partial<Pick<SaveData, "stars">>)`:

```ts
    meleeDamage: Math.round(at(E.meleeDamage, level(save, "melee")) * starMul(starLevel(save, "melee"))),
    rangedDamage: Math.round(at(E.rangedDamage, level(save, "ranged")) * starMul(starLevel(save, "ranged"))),
    rangedRange: at(E.rangedRange, level(save, "ranged")),
    maxHp: at(E.maxHp, level(save, "tank")),
    damageTaken: at(E.damageTaken, level(save, "armor")) / starMul(starLevel(save, "armor")),
```
(`growth.ts`가 `awaken.ts`를 가져온다. `awaken.ts`는 `growth.ts`를 가져오지 않는다 — 작업 1의 `canAwaken`이 업그레이드 단계를 직접 읽는 이유.)

`shared/kitchen/dish.ts` `planShop(items, levels, menu, stars: Partial<Record<DishId, number>> = {})`: 가격 줄을

```ts
    const price = Math.round(dishPrice(line.dish, level) * starMul(stars[line.dish] ?? 0) * (1 + (D.premiumBonus * took.premium) / line.sets));
```

`shared/actions.ts`: `openShop`의 `planShop(save.items, save.dishes, lines, save.stars)`. `settleHunt`의 다트: `dartsUsed += sleepDartsFor(spawn.monster, starLevel(save, "sleepGun"));`

`src/screens/kitchen/MenuPick.tsx`: `planShop(save.items, save.dishes, menu, save.stars)`.

`src/game/scenes/HuntScene.ts` `HuntData`에 `// the side weapon's awakening (06b-1): × its effect; sleep darts ÷ it\n  sidePower: number;` 그리고:
- 새총: `this.applyHit(m, "ranged", Math.round(H.sling.damage * this.huntData.sidePower), [])`
- 수면: `m.status = dart(m.status, Math.ceil(H.sleepHits[m.spawn.monster] / this.huntData.sidePower), this.huntData.sleepFallMs)`
- 그물: `bind(m.status, H.netBindMs * this.huntData.sidePower)`
- 폭죽: 기절 `H.firecracker.stunMs * this.huntData.sidePower`(폭발 처리의 `stun(...)` 줄)

`src/screens/DayFlow.tsx` 사냥 데이터에 `sidePower: sidePower(save, save.hunt.side)`, `stats: huntStats(save)`(이미 `save`를 넘기므로 별이 들어간다).

- [ ] **Step 4: 통과 확인** — `npx vitest run`, `npx tsc --noEmit`.
- [ ] **Step 5: 커밋** — `git commit -m "feat(growth): stars raise the knife, harpoon, apron, side weapons and dish prices (server counts the same)"`

### Task 3: 상품·지급·상점 제안·VIP·하루 숯·보스 숯

**Files:**
- Create: `shared/content/products.ts`, `shared/shop.ts`, `shared/shop.test.ts`
- Modify: `shared/balance.ts`(`shop`), `shared/actions.ts`(`claimVipDaily`, 보스 첫 처치 숯), `shared/boss.test.ts`

**Interfaces:**
- Produces: `PRODUCTS`, `productById(id)`, `type Product = { id: string; vx: number; charcoal: number; gold: number; once: boolean; bundle: boolean; needsPage?: string }`, `vipLevel(spent): number`, `vipBonus(level): number`, `grantPurchase(save, p: { purchaseId: string; productId: string; quantity: number }): { save; error? }`, `shopOffer(save): Offer[]` with `type Offer = { id: string; vx: number; charcoal: number; gold: number; valuePct: number; firstBuy: boolean; vipPct: number; once: boolean }`, 행동 `{ type: "claimVipDaily" }`.

- [ ] **Step 1: 실패하는 테스트** — `shared/shop.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { applyAction } from "./actions";
import { grantPurchase, shopOffer, vipBonus, vipLevel } from "./shop";
import { newSave, type SaveData } from "./save";

const buy = (s: SaveData, productId: string, purchaseId = `p-${Math.random()}`) => grantPurchase(s, { purchaseId, productId, quantity: 1 });

describe("buying charcoal", () => {
  it("gives twice the first time a bundle is bought, then its plain amount", () => {
    const a = buy(newSave(), "charcoal_1").save;
    expect(a.charcoal).toBe(60);
    expect(buy(a, "charcoal_1").save.charcoal).toBe(90);
  });
  it("grants a purchase once however often the webhook comes", () => {
    const a = buy(newSave(), "charcoal_2", "p-1").save;
    const b = buy(a, "charcoal_2", "p-1");
    expect(b.error).toBeUndefined();
    expect(b.save).toBe(a);
    expect(a.vip.spent).toBe(500);
  });
  it("adds the VIP bonus of the level before this purchase", () => {
    const vip5 = { ...newSave(), vip: { spent: 6_000, day: 0 }, shop: { firstBuy: ["charcoal_3"], purchases: [] } };
    expect(vipLevel(6_000)).toBe(5);
    expect(buy(vip5, "charcoal_3").save.charcoal).toBe(Math.floor(600 * 1.1));
    expect([vipLevel(99), vipLevel(100), vipLevel(70_000), vipLevel(10 ** 7)]).toEqual([0, 1, 9, 10]);
    expect([vipBonus(0), vipBonus(1), vipBonus(10)]).toEqual([0, 0.02, 0.25]);
  });
  it("sells the starter pack once: a second webhook grants nothing but is recorded", () => {
    const a = buy({ ...newSave(), pages: ["forest"] }, "starter_pack", "s-1").save;
    expect([a.charcoal, a.gold]).toEqual([200, 5_000]);
    const b = buy(a, "starter_pack", "s-2").save;
    expect([b.charcoal, b.gold, b.shop.purchases.includes("s-2")]).toEqual([200, 5_000, true]);
  });
  it("refuses a product it does not know", () => {
    expect(buy(newSave(), "gold_pouch").error).toBe("unknown_product");
  });
  it("keeps the last 200 purchase ids", () => {
    let s = newSave();
    for (let i = 0; i < 210; i++) s = buy(s, "charcoal_1", `p${i}`).save;
    expect(s.shop.purchases).toHaveLength(200);
    expect(s.shop.purchases[0]).toBe("p10");
  });
});

describe("the shop's offer", () => {
  it("shows each bundle's true value, doubled while its first purchase is left", () => {
    const o = shopOffer(newSave());
    expect(o.find((x) => x.id === "charcoal_1")!.valuePct).toBe(200);
    expect(o.find((x) => x.id === "charcoal_4")!.valuePct).toBe(300);
    const after = shopOffer({ ...newSave(), shop: { firstBuy: ["charcoal_4"], purchases: [] } });
    expect(after.find((x) => x.id === "charcoal_4")!.valuePct).toBe(150);
  });
  it("counts the VIP bonus in the band", () => {
    const o = shopOffer({ ...newSave(), vip: { spent: 6_000, day: 0 }, shop: { firstBuy: ["charcoal_1"], purchases: [] } });
    expect(o.find((x) => x.id === "charcoal_1")).toMatchObject({ charcoal: 33, valuePct: 110, vipPct: 10 });
  });
  it("offers the starter pack only after the Charge King, and not once bought", () => {
    expect(shopOffer(newSave()).some((x) => x.id === "starter_pack")).toBe(false);
    expect(shopOffer({ ...newSave(), pages: ["forest"] }).find((x) => x.id === "starter_pack")!.valuePct).toBe(666);
    expect(shopOffer({ ...newSave(), pages: ["forest"], shop: { firstBuy: ["starter_pack"], purchases: [] } }).some((x) => x.id === "starter_pack")).toBe(false);
  });
});

describe("the VIP's daily charcoal", () => {
  const morning = (over: Partial<SaveData> = {}): SaveData => ({ ...newSave(), day: 4, stage: "hunt", vip: { spent: 1_500, day: 0 }, ...over });
  it("gives 2 a VIP level once a day, in the morning before the hunt", () => {
    const r = applyAction(morning(), { type: "claimVipDaily" }, { now: 1, random: () => 0.5 });
    expect([r.save.charcoal, r.save.vip.day]).toEqual([6, 4]);
    expect(applyAction(r.save, { type: "claimVipDaily" }, { now: 1, random: () => 0.5 }).error).toBe("claimed");
  });
  it("refuses without VIP or outside the morning", () => {
    expect(applyAction(morning({ vip: { spent: 0, day: 0 } }), { type: "claimVipDaily" }, { now: 1, random: () => 0.5 }).error).toBe("no_vip");
    expect(applyAction(morning({ stage: "kitchen" }), { type: "claimVipDaily" }, { now: 1, random: () => 0.5 }).error).toBe("wrong_stage");
  });
});
```

(스타터팩 효율: floor(200 × 100/30 ÷ 100 × 100) = 666. 설계 표의 "667%"는 반올림 값 — 띠는 내림 666%로 고정하고 설계 문서 표도 666%로 고친다.)

`shared/boss.test.ts`의 첫 처치 테스트에 `expect(r.save.charcoal).toBe(50)`, 두 번째 처치 테스트에 `expect(r.save.charcoal).toBe(0)`.

- [ ] **Step 2: 실패 확인** — `npx vitest run shared/shop.test.ts shared/boss.test.ts`.

- [ ] **Step 3: 구현**

`shared/balance.ts`:

```ts
  // the VX shop (06b-1, user-approved 2026-10-16): 30 charcoal = 100 VX is the value line; VIP levels by VX
  // spent, each adding a share to charcoal bundles and 2 charcoal a day; the first boss of a chapter gives
  // bossCharcoal the first time
  shop: { charcoalPerVx: number; vipAt: number[]; vipBonus: number[]; vipDaily: number; bossCharcoal: number; keepPurchases: number };
```
```ts
  shop: { charcoalPerVx: 0.3, vipAt: [100, 500, 1500, 3000, 6000, 12000, 25000, 45000, 70000, 100000], vipBonus: [0.02, 0.04, 0.06, 0.08, 0.1, 0.13, 0.16, 0.19, 0.22, 0.25], vipDaily: 2, bossCharcoal: 50, keepPurchases: 200 },
```

`shared/content/products.ts`:

```ts
// The VX Shop's products (06b-1 design 2). The ids are the Verse8 dashboard's, letter for letter; the
// prices here are what VIP counts (the purchase webhook carries no price).
export interface Product {
  id: string;
  vx: number;
  charcoal: number;
  gold: number;
  once: boolean; // one per account
  bundle: boolean; // a charcoal bundle: twice the first time, plus the VIP bonus
  needsPage?: string; // shown only once this notebook page is back
}

export const PRODUCTS: Product[] = [
  { id: "starter_pack", vx: 100, charcoal: 200, gold: 5_000, once: true, bundle: false, needsPage: "forest" },
  { id: "charcoal_1", vx: 100, charcoal: 30, gold: 0, once: false, bundle: true },
  { id: "charcoal_2", vx: 500, charcoal: 180, gold: 0, once: false, bundle: true },
  { id: "charcoal_3", vx: 1_500, charcoal: 600, gold: 0, once: false, bundle: true },
  { id: "charcoal_4", vx: 5_000, charcoal: 2_250, gold: 0, once: false, bundle: true },
  { id: "charcoal_5", vx: 30_000, charcoal: 15_000, gold: 0, once: false, bundle: true },
];

export const productById = (id: unknown): Product | undefined => PRODUCTS.find((p) => p.id === id);
```

`shared/shop.ts`:

```ts
import { BALANCE } from "./balance";
import { productById, PRODUCTS, type Product } from "./content/products";
import type { SaveData } from "./save";

// Paying (06b-1 design 2-3): what a purchase grants, what the shop offers this account at its true value,
// and VIP. Only the server's purchase webhook calls grantPurchase (and the page in ?local development).
const S = BALANCE.shop;

export const vipLevel = (spent: number): number => S.vipAt.filter((at) => spent >= at).length;
export const vipBonus = (level: number): number => (level > 0 ? S.vipBonus[level - 1] : 0);

// The charcoal one unit of a product gives this account now: twice for a bundle's first purchase, plus
// the VIP bonus of the level before it.
function charcoalFor(save: SaveData, p: Product, first: boolean): number {
  if (!p.bundle) return p.charcoal;
  return Math.floor(p.charcoal * (first ? 2 : 1) * (1 + vipBonus(vipLevel(save.vip.spent))));
}

// One purchase from the webhook. The same purchaseId again changes nothing; a one-per-account product
// bought before is recorded but grants nothing.
export function grantPurchase(save: SaveData, p: { purchaseId: string; productId: string; quantity: number }): { save: SaveData; error?: string } {
  if (typeof p.purchaseId !== "string" || save.shop.purchases.includes(p.purchaseId)) return { save };
  const product = productById(p.productId);
  if (!product) return { save, error: "unknown_product" };
  const units = Math.max(1, Math.min(99, Math.floor(Number(p.quantity) || 1)));
  let s = save;
  for (let i = 0; i < units; i++) {
    const first = !s.shop.firstBuy.includes(product.id);
    if (product.once && !first) break;
    s = {
      ...s,
      charcoal: s.charcoal + charcoalFor(s, product, first),
      gold: s.gold + product.gold,
      vip: { ...s.vip, spent: s.vip.spent + product.vx },
      shop: { ...s.shop, firstBuy: first ? [...s.shop.firstBuy, product.id] : s.shop.firstBuy },
    };
  }
  return { save: { ...s, shop: { ...s.shop, purchases: [...s.shop.purchases, p.purchaseId].slice(-S.keepPurchases) } } };
}

export interface Offer {
  id: string;
  vx: number;
  charcoal: number;
  gold: number;
  valuePct: number; // the value band: charcoal's worth in VX over the price
  firstBuy: boolean;
  vipPct: number;
  once: boolean;
}

// What the shop shows this account, each at what it would really get now.
export function shopOffer(save: SaveData): Offer[] {
  const vip = vipBonus(vipLevel(save.vip.spent));
  return PRODUCTS.filter((p) => (!p.needsPage || save.pages.includes(p.needsPage)) && !(p.once && save.shop.firstBuy.includes(p.id))).map((p) => {
    const first = !save.shop.firstBuy.includes(p.id);
    const charcoal = charcoalFor(save, p, first);
    // (+1e-9: 30 / 0.3 is 99.99… in floating point, and a band must not lose a percent to that)
    const valuePct = Math.floor((charcoal / S.charcoalPerVx / p.vx) * 100 + 1e-9);
    return { id: p.id, vx: p.vx, charcoal, gold: p.gold, valuePct, firstBuy: p.bundle && first, vipPct: p.bundle ? Math.round(vip * 100) : 0, once: p.once };
  });
}
```

`shared/actions.ts`: `Action`에 `| { type: "claimVipDaily" }`, `case "claimVipDaily": return claimVipDaily(save);`,

```ts
// The VIP's charcoal (06b-1 design 3): once a game day, in the morning before the hunt.
function claimVipDaily(save: SaveData): { save: SaveData; error?: string } {
  const lv = vipLevel(save.vip.spent);
  if (lv === 0) return { save, error: "no_vip" };
  if (save.vip.day === save.day) return { save, error: "claimed" };
  if (save.stage !== "hunt" || save.hunt) return { save, error: "wrong_stage" };
  return { save: { ...save, charcoal: save.charcoal + lv * BALANCE.shop.vipDaily, vip: { ...save.vip, day: save.day } } };
}
```

`finishHunt`의 반환에 `charcoal: save.charcoal + (firstKing ? BALANCE.shop.bossCharcoal : 0)`.

설계 문서 2장 표의 스타터팩 효율 `667%` → `666%`(내림 규칙).

- [ ] **Step 4: 통과 확인** — `npx vitest run`.
- [ ] **Step 5: 커밋** — `git commit -m "feat(shop): charcoal bundles (twice the first time, VIP bonus), the starter pack after the first boss, true value bands, VIP daily charcoal, 50 for the first boss"`

### Task 4: 서버 결제 웹훅

**Files:**
- Modify: `server/src/server.ts`, `server/test/server.test.ts`

**Interfaces:**
- Consumes: `grantPurchase`(작업 3).
- Produces: `Server.$onItemPurchased(p: { account: string; purchaseId: string; productId: string; quantity: number }): Promise<{ success: boolean }>`.

- [ ] **Step 1: 실패하는 하네스 테스트** — `server/test/server.test.ts`:

```ts
describe("purchases", () => {
  test("the same purchaseId is granted once", async (server) => {
    const acct = `buyer-${Date.now()}`;
    await server.$onItemPurchased({ account: acct, purchaseId: "p-1", productId: "charcoal_1", quantity: 1 });
    await server.$onItemPurchased({ account: acct, purchaseId: "p-1", productId: "charcoal_1", quantity: 1 });
    server.connect({ account: acct });
    const s = await server.load();
    expect(s.charcoal).toBe(60);
    expect(s.vip.spent).toBe(100);
  });
  test("refuses a product it does not know", async (server) => {
    const r = await server.$onItemPurchased({ account: `buyer-x-${Date.now()}`, purchaseId: "p-2", productId: "gold_pouch", quantity: 1 });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — 사용자에게 알린 뒤 `npm run test:server` → `$onItemPurchased is not a function`.

- [ ] **Step 3: 구현** — `server/src/server.ts`:

```ts
  // The VX Shop's purchase webhook (Verse8 calls it; 06b-1): grants under the same lock as `act`, so a
  // purchase never lands between a read and a write of the same save. The same purchaseId twice grants
  // once (grantPurchase keeps the ids).
  async $onItemPurchased(p: { account: string; purchaseId: string; productId: string; quantity: number }): Promise<{ success: boolean }> {
    return $lock(`save:${p.account}`, async () => {
      const state = await $global.getUserState(p.account);
      const r = grantPurchase(readSave(state?.[SAVE_KEY]), p);
      if (r.error) return { success: false };
      await $global.updateUserState(p.account, { [SAVE_KEY]: r.save });
      return { success: true };
    });
  }
```

- [ ] **Step 4: 통과 확인** — `npm run test:server`, `npm --prefix server run typecheck`.
- [ ] **Step 5: 커밋** — `git commit -m "feat(server): the VX Shop purchase webhook grants under the save's lock, once per purchase"`

### Task 5: 상점 서비스(클라이언트)

**Files:**
- Create: `src/net/shop.ts`, `src/net/shop.test.ts`
- Modify: `src/net/transport.ts`(`LocalTransport.purchase`), `src/App.tsx`(로컬 여부 전달)

**Interfaces:**
- Produces: `type ShopItem = { productId: string; price: number; purchasable: boolean; purchaseLimitReached: boolean }`, `startShop(opts: { local: LocalTransport | null; onItems: (items: ShopItem[]) => void; onClosed: () => void }): () => void`, `buy(productId: string): void`, `LocalTransport.purchase(productId): Promise<SaveData>`, `refreshAfterPurchase(load: () => Promise<void>, sleep?: (ms: number) => Promise<void>): Promise<void>`(1초·4초 뒤 두 번 읽기).

- [ ] **Step 1: 실패하는 테스트** — `src/net/shop.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { LocalTransport } from "./transport";
import { refreshAfterPurchase } from "./shop";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("the shop service", () => {
  it("buys in local development through the same grant rules", async () => {
    const t = new LocalTransport(memory());
    const s = await t.purchase("charcoal_1");
    expect(s.charcoal).toBe(60);
    expect((await t.purchase("charcoal_1")).charcoal).toBe(90);
  });
  it("reads the save again one and four seconds after the payment window closes", async () => {
    const waits: number[] = [];
    let loads = 0;
    await refreshAfterPurchase(async () => void loads++, async (ms) => void waits.push(ms));
    expect([waits, loads]).toEqual([[1000, 3000], 2]);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/net/shop.test.ts`.

- [ ] **Step 3: 구현**

`src/net/transport.ts` `LocalTransport`:

```ts
  // ?local development: a purchase granted at once by the server's own rules (no Verse8 shop here)
  async purchase(productId: string): Promise<SaveData> {
    const r = grantPurchase(await this.load(), { purchaseId: `local-${Date.now()}-${Math.random()}`, productId, quantity: 1 });
    if (r.error) throw new Error(r.error);
    this.storage.setItem(this.key, JSON.stringify(r.save));
    return r.save;
  }
```

`src/net/shop.ts`:

```ts
import { VXShop } from "@verse8/platform/vanilla";
import { PRODUCTS } from "../../shared/content/products";
import type { LocalTransport } from "./transport";

// The VX Shop in one place (06b-1). The dashboard's items come through VXShop; buying opens Verse8's
// payment window; the grant itself is the server's webhook, so when the window closes the page only reads
// the save again (twice: the webhook can trail the window). In ?local development a fake list (price 0)
// and a purchase granted at once by the same rules.
export interface ShopItem {
  productId: string;
  price: number;
  purchasable: boolean;
  purchaseLimitReached: boolean;
}

let local: LocalTransport | null = null;
let closed: (() => void) | null = null;
let initialized = false;

export function startShop(opts: { local: LocalTransport | null; onItems: (items: ShopItem[]) => void; onClosed: () => void }): () => void {
  local = opts.local;
  closed = opts.onClosed;
  if (local) {
    opts.onItems(PRODUCTS.map((p) => ({ productId: p.id, price: p.vx, purchasable: true, purchaseLimitReached: false })));
    return () => void (closed = null);
  }
  const off = VXShop.subscribe((state) => opts.onItems(state.items as ShopItem[]));
  const offClose = VXShop.onClose(() => {
    void VXShop.refresh();
    closed?.();
  });
  if (!initialized) {
    VXShop.init();
    initialized = true;
  }
  return () => {
    off();
    offClose();
    closed = null;
  };
}

export function buy(productId: string): void {
  if (local) {
    void local.purchase(productId).then(() => closed?.());
    return;
  }
  VXShop.buyItem(productId);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// After the payment window: read the save at 1 s and again at 4 s (the webhook may trail the window).
export async function refreshAfterPurchase(load: () => Promise<void>, sleep: (ms: number) => Promise<void> = wait): Promise<void> {
  await sleep(1000);
  await load();
  await sleep(3000);
  await load();
}
```

`src/App.tsx`: 로컬일 때 `LocalTransport`를 `DayFlow`에 `localShop` prop으로 넘긴다(온라인이면 `null`).

- [ ] **Step 4: 통과 확인** — `npx vitest run src/net`, `npx tsc --noEmit`.
- [ ] **Step 5: 커밋** — `git commit -m "feat(shop): the VX Shop service in one place (local development buys by the same rules), the save read again after the payment window"`

### Task 6: 상점 화면·위쪽 막대

**Files:**
- Create: `src/screens/Shop.tsx`, `src/screens/shop.css`
- Modify: `src/screens/DayFlow.tsx`(입구·막대·하루 숯·결제 뒤 다시 읽기), `src/screens/HuntSummary.tsx`(상점 버튼), `src/screens/Upgrades.tsx`(상점 버튼), `src/i18n/ko.ts`, `src/i18n/en.ts`

**Interfaces:**
- Consumes: `shopOffer`, `vipLevel`, `BALANCE.shop.vipAt`(작업 3), `startShop`, `buy`, `refreshAfterPurchase`(작업 5).
- Produces: `<Shop save items checking onBuy onClose />`.

- [ ] **Step 1: 구현** — `src/screens/Shop.tsx`(상품 카드 그리드: 아이콘(`art/test/shop/products/<id>.png`가 있으면 그것, 없으면 `test/ui/icon_charcoal.png`), 이름 `t("product.<id>")`, 내용 `t("shop.gives", { charcoal, gold })`, `ui-ribbon` 효율 띠 `t("shop.value", { pct })`(VIP 보너스가 있으면 `t("shop.valueVip", { pct, vip })`), `firstBuy`면 `ui-plate` "첫 구매 2배", `once`면 "계정당 1번", 가격 버튼 `t("shop.price", { vx })` — VXShop 목록에 그 상품이 없거나 `purchasable`이 아니면 비활성. 위에 VIP 줄: `t("shop.vip", { lv, need })`(다음 단계까지 남은 VX, 10이면 `t("shop.vipMax")`). `checking`이면 패널 아래에 `t("shop.checking")`). `src/screens/shop.css`는 키트 클래스 배치만(그리드·간격).
- [ ] **Step 2: DayFlow 연결** — `const [shop, setShop] = useState(false)`, `const [items, setItems] = useState<ShopItem[]>([])`, `const [checking, setChecking] = useState(false)`; `useEffect(() => startShop({ local: localShop, onItems: setItems, onClosed: () => { setChecking(true); void refreshAfterPurchase(async () => setSave(await transport.load())).finally(() => setChecking(false)); } }), [transport])`. 막대에 숯(`icon_charcoal`, `t("hud.charcoal", { n: save.charcoal })`)과 VIP 1 이상이면 `t("hud.vip", { lv })`. 사냥 전 아침(`stage === "hunt" && !save.hunt`)이고 VIP ≥ 1이고 `save.vip.day !== save.day`면 "하루 숯 받기" 버튼(`act({ type: "claimVipDaily" }, phase)`). 상점 버튼: 귀환 화면·정산 패널·업그레이드 화면.
- [ ] **Step 3: 문구** — ko/en 키: `product.starter_pack/charcoal_1..5`, `shop.title`, `shop.gives`, `shop.value`, `shop.valueVip`, `shop.firstBuy`, `shop.once`, `shop.price`, `shop.vip`, `shop.vipMax`, `shop.checking`, `shop.open`, `hud.charcoal`, `hud.vip`, `vip.claim`, `error.no_charcoal`, `error.max_stars`, `error.not_owned`, `error.no_vip`, `error.claimed`, `error.unknown_product`.
- [ ] **Step 4: 확인** — `npx tsc --noEmit`, `npx vitest run src/i18n`(키 짝 맞춤). 실제 화면 1280×720(`?local`): 상점(첫 구매 띠 200~333%, 스타터팩은 돌진대왕 처치 세이브에서만), 사면 숯이 늘고 띠가 바뀜, 막대의 숯·VIP, 하루 숯 버튼. 스크린샷을 사용자에게 보여 준다.
- [ ] **Step 5: 커밋** — `git commit -m "feat(shop): the shop screen (true value bands, first-purchase and VIP marks), charcoal and VIP on the bar, the VIP's daily charcoal"`

### Task 7: 각성 탭

**Files:**
- Modify: `src/screens/Upgrades.tsx`(탭 둘: 업그레이드 / 각성), `src/screens/dayflow.css`, `src/i18n/*`

**Interfaces:**
- Consumes: `AWAKEN_GEAR`, `starLevel`, `starMul`, `awakenCost`, `canAwaken`, `MAX_STARS`(작업 1), `huntStats`(작업 2).

- [ ] **Step 1: 구현** — 위에 `ui-tab` 두 개. 각성 탭: 장비 7줄 + 요리 9줄(연 요리·산 무기만 활성, 나머지는 흐리게 "아직"), 줄마다 아이콘, 이름, `★n/20`, 오르는 값(`t("awaken.fx", { a, b })`: 식칼·작살은 피해 a → b, 갑옷은 받는 피해 a% → b%, 새총은 피해, 수면총은 돌진대왕 다트 a → b, 그물은 묶는 시간 a → b초, 폭죽은 기절 a → b초, 요리는 가격 a → b), 비용(골드·숯, 모자라면 빨간 글자), 버튼 `act({ type: "awaken", target, from: starLevel(save, target) })`. 숯이 모자라면 버튼 대신 "상점" 바로가기.
- [ ] **Step 2: 확인** — 실제 화면 1280×720: 각성 탭, 별 올리기 전후 값, 숯 부족일 때 상점 바로가기. 스크린샷을 보여 준다.
- [ ] **Step 3: 커밋** — `git commit -m "feat(growth): the awakening tab (stars, what the next star does, gold and charcoal, a way to the shop)"`

### Task 8: 그림·등록표·점검·배포

**Files:**
- Create: `docs/vxshop-products.md`, `art/test/shop/products/*.png`, `art/test/ui/icon_golden_charcoal.png`, `art/test/ui/vip_badge.png`(승인 뒤)
- Modify: `docs/superpowers/specs/2026-10-16-06b1-charcoal-shop-awakening-design.md`(상태 줄)

- [ ] **Step 1: 그림 후보** — Codex로 황금 숯 아이콘·상품 아이콘 6개·VIP 배지를 한 장에 뽑아 `pixelsnap.py`로 줄이고(상품 아이콘은 대시보드용 512×512도 정수 배율로), 실제 화면에 올린 미리보기를 보여 주고 승인받아 `art/`에 넣는다(코드는 `hasArt`로 바뀌게 되어 있음).
- [ ] **Step 2: 등록표** — `docs/vxshop-products.md`(낮밤용사 형식): Product ID, Product Name(영어), Price, Stock 999999, Lifetime Limit(스타터팩 1), 이미지 경로, Description(영어, 한국어 참고). "등록은 사용자가 Verse8 게임 관리 → VX Shop에서 직접, Active 켜기"를 적는다.
- [ ] **Step 3: 점검표** — `npm test`, `npm run typecheck`, `npm --prefix server run typecheck`, `npm run build` 후 `GAME_SIZE_RESPONSE`, 서버 하네스(알리고), 그리고 결제 지급 코드(`shared/shop.ts`, `server.ts`의 웹훅)를 한 번 더 읽어 Review Focus 다섯 줄을 하나씩 확인.
- [ ] **Step 4: 배포** — `git push gitlab develop`, `git push github develop:main`. 설계 문서 상태 줄 "06b-1 구현됨(대시보드 등록 대기)". 사용자에게 등록표를 건네고, 출시판에서 테스트 결제가 필요하다고 알린다.
