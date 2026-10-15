# 07a 고깃집 개편 1단계 (레시피·주방) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 직접 조리를 지우고, 데이브 더 다이버식 레시피(도감 실루엣 → 연구 → 강화 → 메뉴판 세트 수)로 바꾼다. 밤 장사는 임시로 "주문을 탭하면 바로 나감"으로 돌아가게 둔다.

**Architecture:** 레시피 표는 공개 파일 `shared/content/recipes.ts` 하나. 요리 레벨·가격·그릇 수·재료 차감 계산은 순수 함수 `shared/kitchen/dish.ts`에 모아 서버 규칙(`shared/actions.ts`)과 주방 화면이 같은 함수를 쓴다. 세이브는 v5(`dishes` 레벨, `seenItems`, 메뉴 줄 `{dish, sets}`, 오늘 밤 `service.dishes`)로 올리고 v2~v4는 읽을 때 옮긴다(삭제된 업그레이드 골드 환불). 서버는 더 이상 비밀 표가 없으므로 `ActionContext`에서 `recipes`가 빠진다.

**Tech Stack:** TypeScript 5.7, React 18, Phaser 3.90, vitest 3, Python 3 + Pillow(그림 자르기만).

**Spec:** [고깃집 운영 개편 설계](../specs/2026-10-15-restaurant-v2-design.md) 3장(레시피·데이터), 5장(주방 화면), 6장(반달이 컷인), 8장(06a 영향), 9장 1단계, 10장(테스트).

## Global Constraints

- 사용자에게 보이는 글은 전부 `t()` (ko.ts가 기준, en.ts도 같은 키). 사용자에게는 한국어로 말한다.
- 숫자는 `BALANCE` 한 곳. 요리 숫자 초안(승인됨): 레벨 1~5 가격 ×1 / 1.15 / 1.3 / 1.5 / 1.75, 세트당 그릇 3 / 4 / 4 / 5 / 6, 그 레벨로 올리는 비용 = 기본가 × 5 / 15 / 30 / 60 / 100 골드 + 재료 1 / 1 / 2 / 3 / 4세트(레벨 1 = 연구). 특급 재료 세트 가격 +20%.
- 서버 행동은 public endpoint: 인자를 믿지 않고 `shared/actions.ts` 규칙이 전부 검사한다. 거부된 행동은 세이브를 바꾸지 않는다.
- 재료는 일반 등급부터 쓴다(특급 고기는 손님용으로 남김).
- UI는 새 픽셀 키트(`art/test/ui2`, 사용자 승인 2026-10-15, Task 5b) + 갈무리. 그림 1픽셀 = 게임 2픽셀(`--k`). 주방 화면은 승인된 시안(`art-src/mockups/kitchen-*.html`, 그림 `art-src/preview/mock_kitchen_*.png`)대로. CSS 색 박스로 새 창·버튼을 만들지 않는다.
- 그림은 승인된 것만 `art/`에 넣는다(반달이 변환본 승인됨). 코드로 그리지 않는다(자르기·배경 지우기만).
- 서버 하네스 테스트(`npm run test:server`)는 실행 전에 사용자에게 알린다(Windows에서 isolated-vm 오류 창).
- 작업 7까지는 중간에 `npm run typecheck`가 깨져 있을 수 있다(한 번에 바뀌는 타입이 많다). 각 작업은 **자기 테스트 파일**이 통과하면 커밋한다. 작업 7 끝부터 `npm test`와 `npm run typecheck`가 모두 통과해야 한다.
- 끝나면 docs/VERSE8.md 점검표를 돌리고 GitLab `develop`과 GitHub `main`에 푸시.

## Review Focus

- 재료를 두 요리가 나눠 쓰는 메뉴(삼겹살 구이 + 삼겹 깻잎쌈)에서 세트를 합쳐 재료보다 많이 열 수 없다 → 작업 1 `planShop` 테스트, 작업 3 `openShop` 테스트.
- 연구·강화 버튼을 빠르게 두 번 눌러도 골드·재료가 두 번 빠지지 않는다(두 번째는 `known`/다음 레벨 비용으로 검사) → 작업 3 테스트 "두 번 보내면 두 번째는 거부".
- v4 세이브(장사 중이던 것 포함)를 열어도 진행이 깨지지 않고, 삭제된 업그레이드 골드를 정확히 돌려받는다 → 작업 2 테스트.
- 임시 장사에서 그릇이 다 팔린 뒤 남은 손님은 평판을 깎지 않는다(서버가 `min(손님 수, 그릇 수) − 서빙 수`만 떠난 손님으로 친다) → 작업 4 테스트.
- 지난밤 메뉴가 오늘 재료로 안 되면 메뉴판이 세트를 줄이거나 빼서 보여 준다(`fitMenu`) → 작업 1 테스트.

---

### Task 1: 레시피 표와 요리 계산

**Files:**
- Create: `shared/content/recipes.ts`
- Create: `shared/kitchen/dish.ts`
- Create: `shared/kitchen/dish.test.ts`
- Modify: `shared/balance.ts` (타입 선언에 `dishes`, 값에 `dishes` 추가)
- Modify: `shared/content/dishes.ts:1-2` (주석만)

**Interfaces:**
- Produces:
  - `interface Recipe { method: Method; items: ItemId[]; price: number; cookMs: number }`, `RECIPES: Record<DishId, Recipe>` (`shared/content/recipes.ts`)
  - `MAX_DISH_LEVEL: number`, `dishPrice(dish: DishId, level: number): number`, `platesPerSet(level: number): number`, `levelCost(dish: DishId, level: number): { gold: number; sets: number } | null`, `takeSets(items: Record<string, number>, dish: DishId, sets: number): { items: Record<string, number>; premium: number } | null`, `setsAvailable(items: Record<string, number>, dish: DishId): number`, `interface MenuLine { dish: DishId; sets: number }`, `interface TonightDish { dish: DishId; plates: number; price: number }`, `planShop(items, levels: Partial<Record<DishId, number>>, menu: MenuLine[]): { items: Record<string, number>; dishes: TonightDish[] } | null`, `fitMenu(items, levels, menu: MenuLine[]): MenuLine[]`, `MAX_SETS = 99` (`shared/kitchen/dish.ts`)

- [ ] **Step 1: 레시피 표 만들기**

`shared/content/recipes.ts`:

```ts
import type { DishId, Method } from "./dishes";
import type { ItemId } from "./items";

// What every dish is made of (restaurant v2 design 3). Public now that nothing is guessed: the cookbook
// shows each dish as a silhouette with its ingredient count. `method` is for show ("3 ingredients ·
// grill"), `price` the level 1 price, `cookMs` how long Bandal takes at night (stage 2).
export interface Recipe {
  method: Method;
  items: ItemId[];
  price: number;
  cookMs: number;
}

export const RECIPES: Record<DishId, Recipe> = {
  grilled_belly: { method: "grill", items: ["boar_belly"], price: 40, cookMs: 3000 },
  garlic_neck: { method: "grill", items: ["boar_neck", "wild_garlic"], price: 50, cookMs: 3500 },
  belly_ssam: { method: "grill", items: ["boar_belly", "perilla", "wild_garlic"], price: 65, cookMs: 4500 },
  honey_rabbit: { method: "grill", items: ["rabbit_leg", "honeycomb"], price: 70, cookMs: 4000 },
  shiitake_grill: { method: "grill", items: ["shiitake"], price: 18, cookMs: 3000 },
  rib_stew: { method: "boil", items: ["boar_rib", "shiitake"], price: 80, cookMs: 5500 },
  baeksuk: { method: "boil", items: ["chicken_thigh", "wild_garlic", "shiitake"], price: 90, cookMs: 6000 },
  chicken_perilla: { method: "season", items: ["chicken_breast", "perilla"], price: 55, cookMs: 3500 },
};
```

`shared/content/dishes.ts` 맨 위 주석 두 줄을 바꾼다:

```ts
// The dishes anyone may know exist (names are in i18n). What goes into them and what they cost:
// shared/content/recipes.ts.
```

- [ ] **Step 2: 밸런스 표에 요리 레벨 넣기**

`shared/balance.ts`의 `BALANCE` 타입 선언에서 `kitchen: { menuSlots: number; maxIngredients: number };` 줄 바로 아래에 추가:

```ts
  // dish levels (restaurant v2 design 3): row i is level i+1 — its price multiplier, plates per set of
  // ingredients, and the cost to reach it (gold = times the dish's base price, sets of its own
  // ingredients; level 1's cost is the research). A set with a premium part sells for premiumBonus more.
  dishes: { levels: { price: number; plates: number; gold: number; sets: number }[]; premiumBonus: number };
```

값 쪽 `kitchen: { menuSlots: 2, maxIngredients: 3 },` 줄 바로 아래에 추가:

```ts
  // user-approved draft numbers 2026-10-15, tuned in play
  dishes: {
    levels: [
      { price: 1, plates: 3, gold: 5, sets: 1 },
      { price: 1.15, plates: 4, gold: 15, sets: 1 },
      { price: 1.3, plates: 4, gold: 30, sets: 2 },
      { price: 1.5, plates: 5, gold: 60, sets: 3 },
      { price: 1.75, plates: 6, gold: 100, sets: 4 },
    ],
    premiumBonus: 0.2,
  },
```

- [ ] **Step 3: 실패하는 테스트 쓰기**

`shared/kitchen/dish.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DISHES, type DishId } from "../content/dishes";
import { isItemId } from "../content/items";
import { RECIPES } from "../content/recipes";
import { dishPrice, fitMenu, levelCost, MAX_DISH_LEVEL, planShop, platesPerSet, setsAvailable, takeSets } from "./dish";

describe("RECIPES", () => {
  it("has every dish once, made of 1 to 3 different known items, with a price and a cooking time", () => {
    expect(Object.keys(RECIPES).sort()).toEqual(Object.keys(DISHES).sort());
    for (const r of Object.values(RECIPES)) {
      expect(r.items.length).toBeGreaterThanOrEqual(1);
      expect(r.items.length).toBeLessThanOrEqual(3);
      expect(new Set(r.items).size).toBe(r.items.length);
      expect(r.items.every(isItemId)).toBe(true);
      expect(r.price).toBeGreaterThan(0);
      expect(r.cookMs).toBeGreaterThanOrEqual(3000);
      expect(r.cookMs).toBeLessThanOrEqual(6000);
    }
  });
});

describe("dish levels", () => {
  it("raises the price and the plates per set with the level", () => {
    expect(MAX_DISH_LEVEL).toBe(5);
    expect(dishPrice("grilled_belly", 1)).toBe(40);
    expect(dishPrice("grilled_belly", 2)).toBe(46);
    expect(dishPrice("grilled_belly", 5)).toBe(70);
    expect(platesPerSet(1)).toBe(3);
    expect(platesPerSet(5)).toBe(6);
  });
  it("prices research (level 1) and each next level in gold and sets, nothing past the top", () => {
    expect(levelCost("baeksuk", 1)).toEqual({ gold: 450, sets: 1 });
    expect(levelCost("grilled_belly", 2)).toEqual({ gold: 600, sets: 1 });
    expect(levelCost("grilled_belly", 5)).toEqual({ gold: 4000, sets: 4 });
    expect(levelCost("grilled_belly", 6)).toBeNull();
    expect(levelCost("grilled_belly", 0)).toBeNull();
  });
});

describe("takeSets", () => {
  it("uses regular parts first and counts the sets that needed a premium part", () => {
    const r = takeSets({ "boar_belly:premium": 1, "boar_belly:normal": 1 }, "grilled_belly", 2);
    expect(r).toEqual({ items: {}, premium: 1 });
  });
  it("takes one of each ingredient per set, forage by its plain key", () => {
    const r = takeSets({ "boar_belly:normal": 3, perilla: 2, wild_garlic: 2 }, "belly_ssam", 2);
    expect(r).toEqual({ items: { "boar_belly:normal": 1 }, premium: 0 });
  });
  it("is null when one ingredient runs out, and leaves the items it was given alone", () => {
    const items = { "boar_belly:normal": 3, perilla: 1, wild_garlic: 3 };
    expect(takeSets(items, "belly_ssam", 2)).toBeNull();
    expect(items).toEqual({ "boar_belly:normal": 3, perilla: 1, wild_garlic: 3 });
  });
});

describe("setsAvailable", () => {
  it("counts both grades, the scarcest ingredient decides", () => {
    expect(setsAvailable({ "boar_belly:normal": 2, "boar_belly:premium": 1, perilla: 2, wild_garlic: 5 }, "belly_ssam")).toBe(2);
    expect(setsAvailable({}, "grilled_belly")).toBe(0);
  });
});

describe("planShop", () => {
  const items = { "boar_belly:normal": 2, "boar_belly:premium": 1, perilla: 1, wild_garlic: 1 };
  const levels: Partial<Record<DishId, number>> = { grilled_belly: 2, belly_ssam: 1 };
  it("takes the sets line by line and prices each dish by level and premium share", () => {
    const r = planShop(items, levels, [{ dish: "grilled_belly", sets: 2 }, { dish: "belly_ssam", sets: 1 }]);
    expect(r).toEqual({
      items: {},
      dishes: [
        { dish: "grilled_belly", plates: 8, price: 46 },
        { dish: "belly_ssam", plates: 3, price: 78 },
      ],
    });
  });
  it("is null when two dishes sharing an ingredient ask for more than there is", () => {
    expect(planShop(items, levels, [{ dish: "grilled_belly", sets: 3 }, { dish: "belly_ssam", sets: 1 }])).toBeNull();
  });
});

describe("fitMenu", () => {
  it("cuts last night's sets down to what the items make now and drops lines with none", () => {
    const items = { "boar_belly:normal": 2, shiitake: 0 };
    const levels: Partial<Record<DishId, number>> = { grilled_belly: 1, shiitake_grill: 1 };
    expect(fitMenu(items, levels, [{ dish: "grilled_belly", sets: 5 }, { dish: "shiitake_grill", sets: 1 }])).toEqual([{ dish: "grilled_belly", sets: 2 }]);
  });
  it("drops dishes not researched", () => {
    expect(fitMenu({ "boar_belly:normal": 2 }, {}, [{ dish: "grilled_belly", sets: 1 }])).toEqual([]);
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `npx vitest run shared/kitchen/dish.test.ts`
Expected: FAIL — `Failed to resolve import "./dish"`

- [ ] **Step 5: 계산 함수 쓰기**

`shared/kitchen/dish.ts`:

```ts
import { BALANCE } from "../balance";
import type { DishId } from "../content/dishes";
import { itemKey, ITEMS, type ItemId } from "../content/items";
import { RECIPES } from "../content/recipes";

// Dish levels, prices, plates and ingredient sets (restaurant v2 design 3), in one place: the server's
// rules (research, upgradeDish, openShop, packLunch) and the kitchen screens all ask here.
const D = BALANCE.dishes;
export const MAX_DISH_LEVEL = D.levels.length;
// the most sets of one dish a menu line may ask for (a sanity cap on the client's word)
export const MAX_SETS = 99;
const row = (level: number) => D.levels[Math.max(1, Math.min(MAX_DISH_LEVEL, level)) - 1];

export const dishPrice = (dish: DishId, level: number): number => Math.round(RECIPES[dish].price * row(level).price);
export const platesPerSet = (level: number): number => row(level).plates;

// What it costs to reach `level` (1 = research): gold and sets of the dish's own ingredients; null
// outside 1..MAX_DISH_LEVEL.
export function levelCost(dish: DishId, level: number): { gold: number; sets: number } | null {
  if (!Number.isInteger(level) || level < 1 || level > MAX_DISH_LEVEL) return null;
  const r = D.levels[level - 1];
  return { gold: RECIPES[dish].price * r.gold, sets: r.sets };
}

// Where one unit of an item is taken from, in order: regular parts first, so premium meat stays for
// paying guests; forage has a single key.
const keysFor = (id: ItemId): string[] => (ITEMS[id].kind === "part" ? [itemKey(id, "normal"), itemKey(id, "premium")] : [itemKey(id)]);

// `sets` sets of a dish's ingredients taken out of a copy of `items`, and how many of those sets used
// a premium part. null when an ingredient runs out.
export function takeSets(items: Record<string, number>, dish: DishId, sets: number): { items: Record<string, number>; premium: number } | null {
  const left = { ...items };
  let premium = 0;
  for (let s = 0; s < sets; s++) {
    let rich = false;
    for (const id of RECIPES[dish].items) {
      const key = keysFor(id).find((k) => (left[k] ?? 0) > 0);
      if (!key) return null;
      left[key] -= 1;
      if (left[key] === 0) delete left[key];
      if (key === itemKey(id, "premium")) rich = true;
    }
    if (rich) premium++;
  }
  return { items: left, premium };
}

// How many sets of a dish the items make (both grades count; the scarcest ingredient decides).
export function setsAvailable(items: Record<string, number>, dish: DishId): number {
  const have = (id: ItemId) => keysFor(id).reduce((n, k) => n + (items[k] ?? 0), 0);
  return Math.min(...RECIPES[dish].items.map(have));
}

export interface MenuLine {
  dish: DishId;
  sets: number;
}

// One dish on tonight's board: plates made and the price of each.
export interface TonightDish {
  dish: DishId;
  plates: number;
  price: number;
}

// Tonight's plates from a menu, taking each line's sets out of the items in menu order (dishes may share
// ingredients). A dish's price is its level price, raised by premiumBonus for the share of its sets that
// used a premium part. null when the items do not cover the whole menu.
export function planShop(
  items: Record<string, number>,
  levels: Partial<Record<DishId, number>>,
  menu: MenuLine[],
): { items: Record<string, number>; dishes: TonightDish[] } | null {
  let left = items;
  const dishes: TonightDish[] = [];
  for (const line of menu) {
    const level = levels[line.dish] ?? 1;
    const took = takeSets(left, line.dish, line.sets);
    if (!took) return null;
    left = took.items;
    const price = Math.round(dishPrice(line.dish, level) * (1 + (D.premiumBonus * took.premium) / line.sets));
    dishes.push({ dish: line.dish, plates: line.sets * platesPerSet(level), price });
  }
  return { items: left, dishes };
}

// Last night's menu made to fit tonight: researched dishes only, each line cut down to the sets the
// items still make after the lines before it, lines with none left out.
export function fitMenu(items: Record<string, number>, levels: Partial<Record<DishId, number>>, menu: MenuLine[]): MenuLine[] {
  let left = items;
  const out: MenuLine[] = [];
  for (const line of menu) {
    if (!levels[line.dish]) continue;
    const sets = Math.min(line.sets, setsAvailable(left, line.dish));
    if (sets < 1) continue;
    left = takeSets(left, line.dish, sets)!.items;
    out.push({ dish: line.dish, sets });
  }
  return out;
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run shared/kitchen/dish.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 7: 커밋**

```bash
git add shared/content/recipes.ts shared/content/dishes.ts shared/kitchen/dish.ts shared/kitchen/dish.test.ts shared/balance.ts
git commit -m "feat(recipes): public recipe table, dish levels, sets and tonight's plates"
```

---

### Task 2: 세이브 v5와 마이그레이션

**Files:**
- Modify: `shared/save.ts` (전체 재작성 — 아래 코드)
- Modify: `shared/save.test.ts` (전체 재작성 — 아래 코드)
- Modify: `shared/content/upgrades.ts`
- Modify: `shared/balance.ts` (`upgrades`에서 6개 삭제, `growth.quality` 삭제, `kitchen.maxIngredients` 삭제)
- Modify: `shared/growth.ts` (`toolQuality` 삭제)
- Modify: `shared/growth.test.ts`
- Modify: `src/net/transport.ts:61` (버전 5)

**Interfaces:**
- Consumes: `RECIPES` (Task 1), `MenuLine`, `TonightDish`, `MAX_DISH_LEVEL`, `MAX_SETS` (Task 1)
- Produces:
  - `SaveData` v5: `{ version: 5; day; stage; gold; items; hunt; seenItems: ItemId[]; dishes: Partial<Record<DishId, number>>; menu: MenuLine[]; reputation; upgrades; lunchbox: DishId[]; service: PendingService | null; lastService: ServiceSummary | null }`
  - `PendingService`: `{ id: string; seed: number; startedAt: number; dishes: TonightDish[] }`
  - `ServiceSummary` 그대로(`tips`는 임시 장사에서 0)
  - `UPGRADE_IDS = ["melee", "ranged", "armor", "bag", "menu", "seats", "lunchbox"]`
  - `refundRetired(raw: unknown): number` (`shared/save.ts`, 테스트용 export)

- [ ] **Step 1: 업그레이드 목록 줄이기**

`shared/content/upgrades.ts` 전체:

```ts
// What gold can improve (growth design 2). Costs, locks and effects live in BALANCE.upgrades. The cooking
// tools and their quality went with hands-on cooking (restaurant v2); saves get that gold back
// (shared/save.ts refundRetired).
export const UPGRADE_IDS = ["melee", "ranged", "armor", "bag", "menu", "seats", "lunchbox"] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];

export function isUpgradeId(v: unknown): v is UpgradeId {
  return typeof v === "string" && (UPGRADE_IDS as readonly string[]).includes(v);
}
```

`shared/balance.ts`:
- 값의 `upgrades`에서 `pot`, `wok`, `fryer`, `board`, `grillQuality`, `potQuality` 여섯 줄을 지운다.
- 타입의 `growth`에서 `quality: number[];`, 값의 `growth`에서 `quality: [1, 1.15, 1.3],`를 지운다.
- 타입 `kitchen: { menuSlots: number; maxIngredients: number };` → `kitchen: { menuSlots: number };`, 값 `kitchen: { menuSlots: 2, maxIngredients: 3 },` → `kitchen: { menuSlots: 2 },`.
- `upgrades` 타입의 `base: 0 | 1`은 그대로 둔다.

`shared/growth.ts`: 맨 아래 `toolQuality` 함수와 그 위 주석 줄을 지운다. 위쪽 주석 `// Upgrade levels (growth design 2): gear starts at level 1, cooking tools at 0 (not owned).` → `// Upgrade levels (growth design 2): everything starts at level 1.`

`shared/growth.test.ts`:
- import에서 `toolQuality`를 지운다.
- "starts gear at level 1 and tools not owned (level 0)" 테스트와 "adds a cooking method when a tool is bought" 테스트에서 `pot`·`tools`를 쓰는 기대문을 지운다(둘째 테스트는 통째로 지운다). 첫째 테스트는 이름을 "starts every upgrade at level 1"로 바꾸고 `for (const id of UPGRADE_IDS) expect(level(newSave(), id)).toBe(1);` 한 줄로 한다.
- "...and kinder tools by level" 테스트에서 `toolQuality` 두 줄을 지우고 이름 끝의 "and kinder tools"를 지운다.

- [ ] **Step 2: 실패하는 세이브 테스트 쓰기**

`shared/save.test.ts` 전체:

```ts
import { describe, expect, it } from "vitest";
import { itemKey, parseItemKey } from "./content/items";
import { newSave, readSave, refundRetired } from "./save";

describe("itemKey / parseItemKey", () => {
  it("keys monster parts by grade and forage without one", () => {
    expect(itemKey("boar_belly", "premium")).toBe("boar_belly:premium");
    expect(itemKey("shiitake")).toBe("shiitake");
    expect(parseItemKey("boar_rib:normal")).toEqual({ id: "boar_rib", grade: "normal" });
    expect(parseItemKey("perilla")).toEqual({ id: "perilla", grade: null });
  });
  it("rejects unknown items and wrong grade use", () => {
    expect(parseItemKey("dragon_tail:premium")).toBeNull();
    expect(parseItemKey("boar_belly")).toBeNull();
    expect(parseItemKey("shiitake:premium")).toBeNull();
    expect(parseItemKey("boar_belly:golden")).toBeNull();
  });
});

const FRESH = {
  version: 5,
  day: 1,
  stage: "hunt",
  gold: 0,
  items: {},
  hunt: null,
  seenItems: [],
  dishes: {},
  menu: [],
  reputation: 0,
  upgrades: {},
  lunchbox: [],
  service: null,
  lastService: null,
};

describe("newSave", () => {
  it("starts on day 1 with nothing researched and nothing seen", () => {
    expect(newSave()).toEqual(FRESH);
  });
});

describe("readSave (version 5)", () => {
  const valid = {
    version: 5,
    day: 4,
    stage: "kitchen",
    gold: 120,
    items: { "boar_belly:premium": 2, shiitake: 1 },
    hunt: null,
    seenItems: ["boar_belly", "shiitake"],
    dishes: { grilled_belly: 2, shiitake_grill: 1 },
    menu: [{ dish: "grilled_belly", sets: 2 }],
    reputation: 12,
    upgrades: { melee: 2 },
    lunchbox: ["grilled_belly"],
    service: { id: "s1", seed: 9, startedAt: 2000, dishes: [{ dish: "grilled_belly", plates: 8, price: 46 }] },
    lastService: { id: "s0", served: 3, left: 1, sales: 120, tips: 0, happy: 3, repDelta: 1 },
  };
  it("keeps a valid save as it is", () => {
    expect(readSave(valid)).toEqual(valid);
  });
  it("starts fresh for nothing, garbage or an unknown version", () => {
    expect(readSave(undefined)).toEqual(newSave());
    expect(readSave("nope")).toEqual(newSave());
    expect(readSave({ version: 99, day: 5 })).toEqual(newSave());
  });
  it("drops broken dishes, menu lines, seen items and tonight's dishes instead of failing", () => {
    const r = readSave({
      ...valid,
      seenItems: ["boar_belly", "boar_belly", "unicorn", 3],
      dishes: { grilled_belly: 2, dragon_steak: 1, rib_stew: 0, baeksuk: 9, garlic_neck: 1.5 },
      menu: [{ dish: "grilled_belly", sets: 2 }, { dish: "grilled_belly", sets: 1 }, { dish: "baeksuk", sets: 1 }, { dish: "grilled_belly" }, "x"],
      service: { ...valid.service, dishes: [{ dish: "grilled_belly", plates: 8, price: 46 }, { dish: "moon_cake", plates: 1, price: 1 }, { dish: "grilled_belly", plates: -2, price: 5 }] },
    });
    expect(r.seenItems).toEqual(["boar_belly"]);
    expect(r.dishes).toEqual({ grilled_belly: 2 });
    expect(r.menu).toEqual([{ dish: "grilled_belly", sets: 2 }]);
    expect(r.service?.dishes).toEqual([{ dish: "grilled_belly", plates: 8, price: 46 }]);
  });
  it("drops a broken service, summary or reputation instead of failing", () => {
    const r = readSave({ ...valid, reputation: -5, service: { id: 3 }, lastService: { id: "x", served: "lots" } });
    expect(r.reputation).toBe(0);
    expect(r.service).toBeNull();
    expect(r.lastService).toBeNull();
  });
});

describe("readSave (from version 4 and older)", () => {
  const v4 = {
    version: 4,
    day: 4,
    stage: "settle",
    gold: 100,
    items: { "boar_neck:normal": 2, perilla: 1 },
    hunt: null,
    cookbook: { grilled_belly: { method: "grill", items: ["boar_belly"] }, garlic_neck: { method: "grill", items: ["boar_neck", "wild_garlic"] } },
    hints: ["rib_stew"],
    menu: ["grilled_belly", "rib_stew"],
    tools: ["grill", "boil"],
    lastCook: null,
    reputation: 7,
    upgrades: { melee: 2, pot: 1, grillQuality: 3 },
    lunchbox: [],
    service: null,
    lastService: null,
  };
  it("opens found recipes at level 1, sees their ingredients and what is in the fridge, keeps the menu as one set each", () => {
    const r = readSave(v4);
    expect(r.version).toBe(5);
    expect(r.dishes).toEqual({ grilled_belly: 1, garlic_neck: 1 });
    expect([...r.seenItems].sort()).toEqual(["boar_belly", "boar_neck", "perilla", "wild_garlic"]);
    expect(r.menu).toEqual([{ dish: "grilled_belly", sets: 1 }]);
    expect(r).not.toHaveProperty("cookbook");
    expect(r).not.toHaveProperty("tools");
    expect(r).not.toHaveProperty("hints");
    expect(r).not.toHaveProperty("lastCook");
  });
  it("gives back the gold spent on the cooking tools and their quality, keeps the rest of the upgrades", () => {
    const r = readSave(v4);
    // pot level 1 = 600, grill quality 1 -> 3 = 500 + 2000
    expect(r.gold).toBe(100 + 600 + 2500);
    expect(r.upgrades).toEqual({ melee: 2 });
  });
  it("closes a service that was open (no ingredients were taken yet in version 4) and goes back to the kitchen", () => {
    const r = readSave({ ...v4, stage: "kitchen", service: { id: "s1", seed: 9, startedAt: 2000, menu: ["grilled_belly"] } });
    expect(r.service).toBeNull();
    expect(r.stage).toBe("kitchen");
    expect(r.items).toEqual(v4.items);
  });
  it("moves a version 1 save's meat into items and sees it", () => {
    const r = readSave({ version: 1, day: 3, gold: 50, meat: { premium: 2, normal: 5 } });
    expect(r).toEqual({ ...FRESH, day: 3, gold: 50, items: { "boar_belly:premium": 2, "boar_belly:normal": 5 }, seenItems: ["boar_belly"] });
  });
});

describe("refundRetired", () => {
  it("adds up what each bought level of a removed upgrade cost", () => {
    expect(refundRetired({ pot: 1, wok: 1, fryer: 1, board: 1, grillQuality: 2, potQuality: 3 })).toBe(600 + 1500 + 3000 + 5000 + 500 + 2500);
    expect(refundRetired({ pot: 0, grillQuality: 1, melee: 4 })).toBe(0);
    expect(refundRetired({ pot: 7, grillQuality: "x" })).toBe(600);
    expect(refundRetired(null)).toBe(0);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run shared/save.test.ts`
Expected: FAIL — `refundRetired` is not exported / `version` 4 ≠ 5

- [ ] **Step 4: 세이브 v5 쓰기**

`shared/save.ts` 전체:

```ts
import { isDishId, type DishId } from "./content/dishes";
import { isItemId, parseItemKey, type ItemId } from "./content/items";
import { RECIPES } from "./content/recipes";
import { BALANCE } from "./balance";
import { isUpgradeId, type UpgradeId } from "./content/upgrades";
import { MAX_DISH_LEVEL, MAX_SETS, type MenuLine, type TonightDish } from "./kitchen/dish";

export type Zone = "forest";

// A hunt the server has started and not yet settled: its seed decides the whole hunting ground.
export interface PendingHunt {
  id: string;
  seed: number;
  zone: Zone;
  startedAt: number;
}

// Tonight's service as the server opened it: its seed decides the customers; the ingredients were taken
// when it opened (openShop) and became these plates.
export interface PendingService {
  id: string;
  seed: number;
  startedAt: number;
  dishes: TonightDish[];
}

// The last settled service, for the settle screen (and to ignore a resent report).
export interface ServiceSummary {
  id: string;
  served: number;
  left: number;
  sales: number;
  tips: number;
  happy: number;
  repDelta: number;
}

// Where the day is: the server moves it along (hunt settled -> kitchen, service settled -> settle,
// next day -> hunt), so a reload cannot skip ahead or hunt twice in one day.
export type Stage = "hunt" | "kitchen" | "settle";

// The whole save of one account, kept in its Global User State under "save" (spec 7).
export interface SaveData {
  version: 5;
  day: number;
  stage: Stage;
  gold: number;
  // item key (see itemKey) -> count
  items: Record<string, number>;
  hunt: PendingHunt | null;
  // every ingredient ever brought home: the cookbook shows these on the dish silhouettes
  seenItems: ItemId[];
  // researched dishes -> level (1..MAX_DISH_LEVEL)
  dishes: Partial<Record<DishId, number>>;
  // last night's menu, offered again on the menu board
  menu: MenuLine[];
  reputation: number;
  // upgrade levels bought (missing = the starting level, see shared/growth)
  upgrades: Partial<Record<UpgradeId, number>>;
  // dishes packed for the next hunt (emptied when it is settled)
  lunchbox: DishId[];
  service: PendingService | null;
  lastService: ServiceSummary | null;
}

export function newSave(): SaveData {
  return {
    version: 5,
    day: 1,
    stage: "hunt",
    gold: 0,
    items: {},
    hunt: null,
    seenItems: [],
    dishes: {},
    menu: [],
    reputation: 0,
    upgrades: {},
    lunchbox: [],
    service: null,
    lastService: null,
  };
}

function count(v: unknown, min = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : min;
}

const isWhole = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

function readItems(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, n] of Object.entries(raw)) {
    if (!parseItemKey(key) || typeof n !== "number" || !Number.isFinite(n)) continue;
    const c = Math.floor(n);
    if (c > 0) out[key] = c;
  }
  return out;
}

function readHunt(raw: unknown): PendingHunt | null {
  const h = raw as Partial<PendingHunt> | null;
  if (!h || typeof h !== "object") return null;
  if (typeof h.id !== "string" || typeof h.seed !== "number" || h.zone !== "forest" || typeof h.startedAt !== "number") return null;
  return { id: h.id, seed: h.seed, zone: h.zone, startedAt: h.startedAt };
}

// A list of known values, each once, in stored order.
function readList<T>(raw: unknown, ok: (v: unknown) => v is T): T[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(ok))] : [];
}

function readDishes(raw: unknown): Partial<Record<DishId, number>> {
  const out: Partial<Record<DishId, number>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, lv] of Object.entries(raw)) if (isDishId(id) && isWhole(lv, 1, MAX_DISH_LEVEL)) out[id] = lv;
  return out;
}

// Menu lines of researched dishes, each dish once, 1..MAX_SETS sets.
function readMenu(raw: unknown, dishes: Partial<Record<DishId, number>>): MenuLine[] {
  const out: MenuLine[] = [];
  if (!Array.isArray(raw)) return out;
  for (const l of raw as { dish?: unknown; sets?: unknown }[]) {
    if (!l || typeof l !== "object" || !isDishId(l.dish) || !dishes[l.dish] || !isWhole(l.sets, 1, MAX_SETS) || out.some((o) => o.dish === l.dish)) continue;
    out.push({ dish: l.dish, sets: l.sets });
  }
  return out;
}

function readTonight(raw: unknown): TonightDish[] {
  const out: TonightDish[] = [];
  if (!Array.isArray(raw)) return out;
  for (const d of raw as { dish?: unknown; plates?: unknown; price?: unknown }[]) {
    if (!d || typeof d !== "object" || !isDishId(d.dish) || !isWhole(d.plates, 0, 10_000) || !isWhole(d.price, 0, 1_000_000) || out.some((o) => o.dish === d.dish)) continue;
    out.push({ dish: d.dish, plates: d.plates, price: d.price });
  }
  return out;
}

function readService(raw: unknown): PendingService | null {
  const r = raw as Partial<PendingService> | null;
  if (!r || typeof r !== "object" || typeof r.id !== "string" || typeof r.seed !== "number" || typeof r.startedAt !== "number") return null;
  return { id: r.id, seed: r.seed, startedAt: r.startedAt, dishes: readTonight(r.dishes) };
}

function readUpgrades(raw: unknown): Partial<Record<UpgradeId, number>> {
  const out: Partial<Record<UpgradeId, number>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, lv] of Object.entries(raw)) {
    if (!isUpgradeId(id) || typeof lv !== "number" || !Number.isInteger(lv)) continue;
    const u = BALANCE.upgrades[id];
    if (lv >= u.base && lv <= u.base + u.costs.length) out[id] = lv;
  }
  return out;
}

function readSummary(raw: unknown): ServiceSummary | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || typeof r.id !== "string") return null;
  const nums = ["served", "left", "sales", "tips", "happy", "repDelta"] as const;
  if (!nums.every((k) => typeof r[k] === "number" && Number.isFinite(r[k]))) return null;
  return { id: r.id, served: r.served as number, left: r.left as number, sales: r.sales as number, tips: r.tips as number, happy: r.happy as number, repDelta: r.repDelta as number };
}

// The upgrades that went with hands-on cooking (restaurant v2) and what each of their levels cost.
const RETIRED_UPGRADES: Record<string, { base: number; costs: number[] }> = {
  pot: { base: 0, costs: [600] },
  wok: { base: 0, costs: [1500] },
  fryer: { base: 0, costs: [3000] },
  board: { base: 0, costs: [5000] },
  grillQuality: { base: 1, costs: [500, 2000] },
  potQuality: { base: 1, costs: [500, 2000] },
};

// The gold a stored upgrade table spent on retired upgrades (levels past the last one count as the last).
export function refundRetired(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  let gold = 0;
  for (const [id, u] of Object.entries(RETIRED_UPGRADES)) {
    const lv = (raw as Record<string, unknown>)[id];
    if (typeof lv !== "number" || !Number.isInteger(lv)) continue;
    const bought = Math.max(0, Math.min(u.costs.length, lv - u.base));
    gold += u.costs.slice(0, bought).reduce((a, b) => a + b, 0);
  }
  return gold;
}

// A version 2-4 save as version 5 fields (restaurant v2 design 3): found recipes open at level 1, their
// ingredients and the fridge's count as seen, last night's menu stays as one set a dish, the gold spent
// on retired upgrades comes back. An open service is closed: version 4 took the ingredients only when it
// was settled, so nothing is lost, and the day goes back to the kitchen.
function fromV4(r: Record<string, unknown>): Record<string, unknown> {
  const book = r.cookbook && typeof r.cookbook === "object" ? (r.cookbook as Record<string, unknown>) : {};
  const found = Object.keys(book).filter((id): id is DishId => isDishId(id) && !!book[id] && typeof book[id] === "object");
  const items = readItems(r.items);
  const seen = new Set<ItemId>([...Object.keys(items).map((k) => parseItemKey(k)!.id), ...found.flatMap((d) => RECIPES[d].items)]);
  const open = !!r.service && typeof r.service === "object";
  const stage = open ? "kitchen" : r.stage === "hunt" || r.stage === "kitchen" || r.stage === "settle" ? r.stage : "hunt";
  return {
    version: 5,
    day: r.day,
    stage,
    gold: count(r.gold) + refundRetired(r.upgrades),
    items,
    hunt: r.hunt,
    seenItems: [...seen],
    dishes: Object.fromEntries(found.map((d) => [d, 1])),
    menu: readList(r.menu, isDishId)
      .filter((d) => found.includes(d))
      .map((dish) => ({ dish, sets: 1 })),
    reputation: r.reputation,
    upgrades: r.upgrades,
    lunchbox: r.lunchbox,
    service: null,
    lastService: r.lastService,
  };
}

// Whatever is stored (or nothing): a usable save. Version 1 (meat counted by grade only) moves into
// items as pork belly; versions 2-4 move to 5 (fromV4); unknown versions and garbage start over; broken
// fields are repaired, so a bad save never stops the game.
export function readSave(raw: unknown): SaveData {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return newSave();
  if (r.version === 1) {
    const meat = (r.meat ?? {}) as { premium?: unknown; normal?: unknown };
    return readSave({
      version: 2,
      day: r.day,
      gold: r.gold,
      items: { "boar_belly:premium": count(meat.premium), "boar_belly:normal": count(meat.normal) },
      hunt: null,
    });
  }
  if (r.version === 2 || r.version === 3 || r.version === 4) return readSave(fromV4(r));
  if (r.version !== 5) return newSave();
  const dishes = readDishes(r.dishes);
  return {
    version: 5,
    day: count(r.day, 1),
    stage: r.stage === "hunt" || r.stage === "kitchen" || r.stage === "settle" ? r.stage : "hunt",
    gold: count(r.gold),
    items: readItems(r.items),
    hunt: readHunt(r.hunt),
    seenItems: readList(r.seenItems, isItemId),
    dishes,
    menu: readMenu(r.menu, dishes),
    reputation: count(r.reputation),
    upgrades: readUpgrades(r.upgrades),
    // the same dish may be packed twice, so no de-duplication here
    lunchbox: Array.isArray(r.lunchbox) ? r.lunchbox.filter(isDishId) : [],
    service: readService(r.service),
    lastService: readSummary(r.lastService),
  };
}
```

`src/net/transport.ts`의 `asSave` 안 `r.version !== 4` → `r.version !== 5`.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run shared/save.test.ts shared/growth.test.ts`
Expected: PASS. (`growth.test.ts`의 `buyUpgrade` 테스트가 `tools`를 기대하던 부분은 Step 1에서 지웠다. 그 파일이 아직 `actions.ts`의 옛 `TOOL_UPGRADES` import 때문에 깨지면 Task 3 Step 4 이후 다시 돌린다.)

- [ ] **Step 6: 커밋**

```bash
git add shared/save.ts shared/save.test.ts shared/content/upgrades.ts shared/balance.ts shared/growth.ts shared/growth.test.ts src/net/transport.ts
git commit -m "feat(save): version 5 with dish levels, seen items and menu sets; cooking tools refunded"
```

---

### Task 3: 연구·요리 강화·가게 열기 규칙

**Files:**
- Modify: `shared/actions.ts`
- Create: `shared/kitchen/actions.test.ts`
- Modify: `shared/actions.test.ts`, `shared/lunch.test.ts`, `shared/stage.test.ts`, `shared/growth.test.ts`
- Delete: `shared/kitchen/cook.ts`, `shared/kitchen/cook.test.ts`, `shared/cooking/` (폴더 전체)

**Interfaces:**
- Consumes: `RECIPES` (Task 1), `levelCost`, `takeSets`, `planShop`, `MAX_SETS`, `MenuLine` (Task 1), `SaveData` v5 (Task 2)
- Produces:
  - `Action` 유니온: `startHunt`, `finishHunt`, `{ type: "research"; dish: string }`, `{ type: "upgradeDish"; dish: string }`, `{ type: "openShop"; menu: { dish: string; sets: number }[] }`, `{ type: "finishService"; serviceId: string; served: { customer: string; dish: string }[]; left: string[] }`, `buyUpgrade`, `packLunch`, `sellAll`, `endDay`
  - `ActionContext = { now: number; random: () => number }` (recipes 없음)
  - 오류 코드: `research` → `bad_action` | `wrong_stage` | `known` | `unseen` | `no_gold` | `no_ingredients`; `upgradeDish` → `bad_action` | `wrong_stage` | `unknown_dish` | `max_level` | `no_gold` | `no_ingredients`; `openShop` → `wrong_stage` | `no_menu` | `bad_menu` | `no_ingredients`

- [ ] **Step 1: 실패하는 테스트 쓰기**

`shared/kitchen/actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "../actions";
import { newSave, type SaveData } from "../save";

const ctx = (now = 1_000_000): ActionContext => ({ now, random: () => 0.25 });
const kitchen = (extra: Partial<SaveData> = {}): SaveData => ({ ...newSave(), stage: "kitchen", ...extra });

describe("research", () => {
  const ready = kitchen({ gold: 1000, seenItems: ["boar_belly"], items: { "boar_belly:normal": 2 } });
  it("opens a dish at level 1 for its gold and one set of its ingredients", () => {
    const r = applyAction(ready, { type: "research", dish: "grilled_belly" }, ctx());
    expect(r.error).toBeUndefined();
    expect(r.save.dishes).toEqual({ grilled_belly: 1 });
    expect(r.save.gold).toBe(800);
    expect(r.save.items).toEqual({ "boar_belly:normal": 1 });
  });
  it("refuses a second research of the same dish (a double click pays once)", () => {
    const once = applyAction(ready, { type: "research", dish: "grilled_belly" }, ctx()).save;
    const twice = applyAction(once, { type: "research", dish: "grilled_belly" }, ctx());
    expect(twice.error).toBe("known");
    expect(twice.save).toBe(once);
  });
  it("needs every ingredient seen, the gold and a set in the fridge", () => {
    expect(applyAction(kitchen({ gold: 1000, items: { "boar_belly:normal": 1 } }), { type: "research", dish: "grilled_belly" }, ctx()).error).toBe("unseen");
    expect(applyAction({ ...ready, gold: 199 }, { type: "research", dish: "grilled_belly" }, ctx()).error).toBe("no_gold");
    expect(applyAction({ ...ready, items: {} }, { type: "research", dish: "grilled_belly" }, ctx()).error).toBe("no_ingredients");
  });
  it("refuses unknown dishes and research outside the kitchen", () => {
    expect(applyAction(ready, { type: "research", dish: "moon_cake" }, ctx()).error).toBe("bad_action");
    expect(applyAction({ ...ready, stage: "hunt" }, { type: "research", dish: "grilled_belly" }, ctx()).error).toBe("wrong_stage");
  });
});

describe("upgradeDish", () => {
  const owned = kitchen({ gold: 5000, dishes: { grilled_belly: 1 }, items: { "boar_belly:normal": 5 } });
  it("raises a researched dish one level for gold and sets", () => {
    const r = applyAction(owned, { type: "upgradeDish", dish: "grilled_belly" }, ctx());
    expect(r.error).toBeUndefined();
    expect(r.save.dishes).toEqual({ grilled_belly: 2 });
    expect(r.save.gold).toBe(4400);
    expect(r.save.items).toEqual({ "boar_belly:normal": 4 });
  });
  it("charges the next level again on a second press (never the same level twice)", () => {
    const once = applyAction(owned, { type: "upgradeDish", dish: "grilled_belly" }, ctx()).save;
    const twice = applyAction(once, { type: "upgradeDish", dish: "grilled_belly" }, ctx());
    expect(twice.save.dishes).toEqual({ grilled_belly: 3 });
    expect(twice.save.gold).toBe(4400 - 1200);
  });
  it("refuses dishes not researched, the top level, no gold and no ingredients", () => {
    expect(applyAction(owned, { type: "upgradeDish", dish: "baeksuk" }, ctx()).error).toBe("unknown_dish");
    expect(applyAction({ ...owned, dishes: { grilled_belly: 5 } }, { type: "upgradeDish", dish: "grilled_belly" }, ctx()).error).toBe("max_level");
    expect(applyAction({ ...owned, gold: 10 }, { type: "upgradeDish", dish: "grilled_belly" }, ctx()).error).toBe("no_gold");
    expect(applyAction({ ...owned, items: {} }, { type: "upgradeDish", dish: "grilled_belly" }, ctx()).error).toBe("no_ingredients");
  });
});

describe("openShop", () => {
  const stocked = kitchen({
    dishes: { grilled_belly: 2, belly_ssam: 1 },
    items: { "boar_belly:normal": 2, "boar_belly:premium": 1, perilla: 1, wild_garlic: 1 },
  });
  const menu = [{ dish: "grilled_belly", sets: 2 }, { dish: "belly_ssam", sets: 1 }];
  it("takes the sets out of the fridge, keeps the menu and opens tonight with its plates and prices", () => {
    const r = applyAction(stocked, { type: "openShop", menu }, ctx(5000));
    expect(r.error).toBeUndefined();
    expect(r.save.items).toEqual({});
    expect(r.save.menu).toEqual(menu);
    expect(r.save.service).toMatchObject({
      startedAt: 5000,
      dishes: [
        { dish: "grilled_belly", plates: 8, price: 46 },
        { dish: "belly_ssam", plates: 3, price: 78 },
      ],
    });
    expect(typeof r.save.service!.id).toBe("string");
  });
  it("refuses more sets than the fridge holds across dishes that share an ingredient", () => {
    const r = applyAction(stocked, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 3 }, { dish: "belly_ssam", sets: 1 }] }, ctx());
    expect(r.error).toBe("no_ingredients");
    expect(r.save).toBe(stocked);
  });
  it("refuses an empty menu, too many lines, a dish twice, unknown or unresearched dishes and bad set counts", () => {
    expect(applyAction(stocked, { type: "openShop", menu: [] }, ctx()).error).toBe("no_menu");
    const three = [{ dish: "grilled_belly", sets: 1 }, { dish: "belly_ssam", sets: 1 }, { dish: "shiitake_grill", sets: 1 }];
    expect(applyAction(stocked, { type: "openShop", menu: three }, ctx()).error).toBe("bad_menu");
    expect(applyAction(stocked, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }, { dish: "grilled_belly", sets: 1 }] }, ctx()).error).toBe("bad_menu");
    expect(applyAction(stocked, { type: "openShop", menu: [{ dish: "baeksuk", sets: 1 }] }, ctx()).error).toBe("bad_menu");
    for (const sets of [0, 1.5, 100, "2"]) expect(applyAction(stocked, { type: "openShop", menu: [{ dish: "grilled_belly", sets }] }, ctx()).error).toBe("bad_menu");
  });
  it("opens only from the kitchen and only once", () => {
    expect(applyAction({ ...stocked, stage: "settle" }, { type: "openShop", menu }, ctx()).error).toBe("wrong_stage");
    const open = applyAction(stocked, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }] }, ctx()).save;
    expect(applyAction(open, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }] }, ctx()).error).toBe("wrong_stage");
  });
});

describe("finishHunt sees what came home", () => {
  it("adds the ingredients brought home to seenItems once", () => {
    const s = applyAction(newSave(), { type: "startHunt", zone: "forest" }, ctx()).save;
    const plain = { ...s, seenItems: ["boar_belly" as const] };
    // an empty report brings nothing new
    expect(applyAction(plain, { type: "finishHunt", huntId: s.hunt!.id, events: [], ko: false }, ctx()).save.seenItems).toEqual(["boar_belly"]);
  });
});
```

`shared/actions.test.ts`의 `finishHunt` describe 안 "adds the server-decided drops and gathered items, and closes the hunt" 테스트 끝(같은 `r`)에 한 줄 추가:

```ts
    expect([...r.save.seenItems].sort()).toEqual([...new Set(Object.keys(r.save.items).map((k) => k.split(":")[0]))].sort());
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run shared/kitchen/actions.test.ts`
Expected: FAIL — `research` 등이 `bad_action`

- [ ] **Step 3: 규칙 고치기**

`shared/actions.ts`:

1. import 정리 — 맨 위 import 블록을 아래로 바꾼다:

```ts
import { BALANCE } from "./balance";
import { isDishId, type DishId } from "./content/dishes";
import { isUpgradeId } from "./content/upgrades";
import { RECIPES } from "./content/recipes";
import { bagSlots, isLocked, level, lunchSlots, menuSlots, nextCost } from "./growth";
import { itemKey, parseItemKey, type ItemId } from "./content/items";
import { addToBag } from "./hunt/bag";
import { dropFor } from "./hunt/drops";
import { planHunt } from "./hunt/plan";
import { levelCost, MAX_SETS, planShop, takeSets, type MenuLine } from "./kitchen/dish";
import type { SaveData, Zone } from "./save";
```

(`settleService`는 Task 4에서 만들고 import도 그때 넣는다. 이 작업에서는 `finishService` case를 `return { save, error: "bad_service" };`로 잠시 막아 둔다.)

2. `Action` 유니온을 바꾼다:

```ts
export type Action =
  | { type: "startHunt"; zone: Zone }
  | { type: "finishHunt"; huntId: string; events: HuntEvent[]; ko: boolean }
  | { type: "research"; dish: string }
  | { type: "upgradeDish"; dish: string }
  | { type: "openShop"; menu: { dish: string; sets: number }[] }
  | { type: "finishService"; serviceId: string; served: { customer: string; dish: string }[]; left: string[] }
  | { type: "buyUpgrade"; id: string }
  | { type: "packLunch"; dishes: string[] }
  | { type: "sellAll" }
  | { type: "endDay" };

// What only the server may decide: its clock and its dice.
export interface ActionContext {
  now: number;
  random: () => number;
}
```

3. `cook` 함수와 그 위 주석, `MAX_SERVED` 위의 `finishService` 함수 전체(Task 4에서 `shared/service/settle.ts`로 옮겨 다시 쓴다)를 지운다. `const MAX_SERVED = 60;`도 지운다.

4. `packLunch` 아래에 새 함수 세 개를 넣는다:

```ts
// Pays for a dish's next level (1 = research): gold and sets of its own ingredients (regular first).
function payLevel(save: SaveData, dish: DishId, target: number): { save: SaveData; error?: string } {
  const cost = levelCost(dish, target);
  if (!cost) return { save, error: "max_level" };
  if (save.gold < cost.gold) return { save, error: "no_gold" };
  const took = takeSets(save.items, dish, cost.sets);
  if (!took) return { save, error: "no_ingredients" };
  return { save: { ...save, gold: save.gold - cost.gold, items: took.items, dishes: { ...save.dishes, [dish]: target } } };
}

// Research (restaurant v2 design 3): a dish opens once every ingredient of it has been brought home.
// A second press finds it known and changes nothing.
function research(save: SaveData, a: Record<string, unknown>): { save: SaveData; error?: string } {
  if (!isDishId(a.dish)) return { save, error: "bad_action" };
  if (save.stage !== "kitchen") return { save, error: "wrong_stage" };
  if (save.dishes[a.dish]) return { save, error: "known" };
  if (!RECIPES[a.dish].items.every((id) => save.seenItems.includes(id))) return { save, error: "unseen" };
  return payLevel(save, a.dish, 1);
}

function upgradeDish(save: SaveData, a: Record<string, unknown>): { save: SaveData; error?: string } {
  if (!isDishId(a.dish)) return { save, error: "bad_action" };
  if (save.stage !== "kitchen") return { save, error: "wrong_stage" };
  const lv = save.dishes[a.dish];
  if (!lv) return { save, error: "unknown_dish" };
  return payLevel(save, a.dish, lv + 1);
}

// Tonight's menu board (restaurant v2 design 3): researched dishes, each once, up to the menu slots,
// 1..MAX_SETS sets each. The sets come out of the fridge now and become tonight's plates; what is left
// at closing is thrown away. The server's seed brings the customers.
function openShop(save: SaveData, a: Record<string, unknown>, ctx: ActionContext): { save: SaveData; error?: string } {
  if (save.stage !== "kitchen" || save.service) return { save, error: "wrong_stage" };
  const m = a.menu;
  if (!Array.isArray(m) || m.length === 0) return { save, error: "no_menu" };
  const bad = { save, error: "bad_menu" };
  if (m.length > menuSlots(save)) return bad;
  const lines: MenuLine[] = [];
  for (const raw of m as { dish?: unknown; sets?: unknown }[]) {
    if (!raw || typeof raw !== "object" || !isDishId(raw.dish) || !save.dishes[raw.dish] || lines.some((l) => l.dish === raw.dish)) return bad;
    if (typeof raw.sets !== "number" || !Number.isInteger(raw.sets) || raw.sets < 1 || raw.sets > MAX_SETS) return bad;
    lines.push({ dish: raw.dish, sets: raw.sets });
  }
  const plan = planShop(save.items, save.dishes, lines);
  if (!plan) return { save, error: "no_ingredients" };
  const seed = Math.floor(ctx.random() * 2 ** 31);
  const id = `s${ctx.now.toString(36)}${Math.floor(ctx.random() * 1e9).toString(36)}`;
  return { save: { ...save, items: plan.items, menu: lines, service: { id, seed, startedAt: ctx.now, dishes: plan.dishes } } };
}
```

5. `packLunch` 본문을 바꾼다(주석은 그대로):

```ts
function packLunch(save: SaveData, a: Record<string, unknown>): { save: SaveData; error?: string } {
  const bad = { save, error: "bad_lunch" };
  const d = a.dishes;
  if (save.hunt || !Array.isArray(d) || d.length === 0 || save.lunchbox.length + d.length > lunchSlots(save)) return bad;
  let items = save.items;
  for (const dish of d as unknown[]) {
    if (!isDishId(dish) || !save.dishes[dish]) return bad;
    const took = takeSets(items, dish, 1);
    if (!took) return bad;
    items = took.items;
  }
  return { save: { ...save, items, lunchbox: [...save.lunchbox, ...(d as DishId[])] } };
}
```

6. `applyAction`의 `switch`:
- `finishHunt` case를 바꾼다:

```ts
    case "finishHunt": {
      const gained = settleHunt(save, a, ctx.now);
      if (!gained) return { save, error: "bad_hunt" };
      const items = { ...save.items };
      for (const [k, n] of Object.entries(gained)) items[k] = (items[k] ?? 0) + n;
      // what came home shows on the cookbook's silhouettes from now on (restaurant v2 design 3)
      const ids = Object.keys(gained).map((k) => parseItemKey(k)!.id);
      const seenItems = [...new Set<ItemId>([...save.seenItems, ...ids])];
      return { save: { ...save, items, hunt: null, seenItems, stage: "kitchen", lunchbox: [] } };
    }
```

- `cook`, `setMenu`, `startService` case를 지우고 그 자리에:

```ts
    case "research":
      return research(save, a);
    case "upgradeDish":
      return upgradeDish(save, a);
    case "openShop":
      return openShop(save, a, ctx);
```

- `finishService` case는 이 작업 동안 `return { save, error: "bad_service" };`.
- `buyUpgrade` case에서 `const method = ...`, `const tools = ...` 두 줄을 지우고 반환을 `return { save: { ...save, gold: save.gold - cost, upgrades: { ...save.upgrades, [a.id]: level(save, a.id) + 1 } } };`로.
- 맨 아래 주석 `// The server's rules for every change to a save ...`는 그대로.

7. 지운다: `shared/kitchen/cook.ts`, `shared/kitchen/cook.test.ts`, `shared/cooking/` 폴더.

```bash
git rm -r shared/cooking shared/kitchen/cook.ts shared/kitchen/cook.test.ts
```

- [ ] **Step 4: 기존 테스트 맞추기**

- `shared/actions.test.ts`:
  - `import type { Recipe } from "./kitchen/cook";`, `TABLE`, `ctx`의 `recipes` 인자를 지우고 `const ctx = (now: number): ActionContext => ({ now, random: () => 0.25 });`.
  - `cook`, `setMenu`를 다루는 `describe` 블록을 통째로 지운다(`grep -n "describe(" shared/actions.test.ts`로 찾는다: "cook", "setMenu" 이름의 블록).
  - `buyUpgrade` 테스트 중 `tools`를 기대하는 줄을 지운다.
- `shared/lunch.test.ts`:
  - `Recipe` import와 `cookbook` 상수를 지운다. `ctx`를 `({ now, random: () => 0.3 })`로.
  - `kitchen`의 `cookbook`을 `dishes: { grilled_belly: 1, garlic_neck: 1 }`로 바꾼다.
  - "found dish"가 아닌 경우를 확인하던 테스트의 기대 오류는 그대로 `bad_lunch`.
- `shared/stage.test.ts`:
  - `TABLE`, `Recipe` import를 지우고 `ctx = (now = 1_000_000): ActionContext => ({ now, random: () => 0.4 })`.
  - `startService`를 쓰는 곳을 `openShop`으로: `{ type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }] }`, 세이브 쪽은 `{ ...hunted(), dishes: { grilled_belly: 1 }, items: { "boar_belly:normal": 1 } }`. `menu`/`cookbook` 필드는 지운다.
  - `finishService`를 쓰는 테스트는 Task 4에서 고친다. 이 작업에서는 그 `it`에 `.skip`을 붙이고 Task 4 Step 4에서 푼다.
- `shared/growth.test.ts`: `ctx`에서 `recipes`를 지운다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run shared/kitchen shared/actions.test.ts shared/lunch.test.ts shared/stage.test.ts shared/growth.test.ts shared/save.test.ts`
Expected: PASS (stage의 skip 1개)

- [ ] **Step 6: 커밋**

```bash
git add -A shared
git commit -m "feat(kitchen): research, dish upgrades and the menu board's sets on the server; hands-on cooking rules removed"
```

---

### Task 4: 임시 장사 정산

**Files:**
- Modify: `shared/service/settle.ts` (전체 재작성)
- Modify: `shared/service/actions.test.ts` (전체 재작성)
- Modify: `shared/service/service.test.ts` (dishScore/serveValue 테스트 삭제)
- Modify: `shared/actions.ts` (`finishService` case)
- Modify: `shared/balance.ts` (`service`에서 `dishPrice`, `premiumBonus`, `tipRate`, `happyAt` 삭제)
- Modify: `shared/stage.test.ts` (Task 3의 skip 풀기)

**Interfaces:**
- Consumes: `SaveData.service.dishes: TonightDish[]` (Task 2), `planService(seed, { day, reputation, menu: DishId[], seats })` (그대로)
- Produces: `settleService(save: SaveData, a: Record<string, unknown>, now: number): { save: SaveData; error?: string }`

- [ ] **Step 1: 실패하는 테스트 쓰기**

`shared/service/actions.test.ts` 전체:

```ts
import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "../actions";
import { BALANCE } from "../balance";
import { newSave, type SaveData } from "../save";
import { planService } from "./plan";

const SV = BALANCE.service;
const ctx = (now: number): ActionContext => ({ now, random: () => 0.37 });

const kitchen: SaveData = {
  ...newSave(),
  stage: "kitchen",
  day: 3,
  reputation: 20,
  dishes: { grilled_belly: 1, garlic_neck: 1 },
  items: { "boar_belly:normal": 1, "boar_neck:normal": 1, wild_garlic: 1 },
};

// tonight: 3 plates of pork belly at 40, 3 of garlic neck at 50
function opened(now = 1_000_000) {
  const r = applyAction(kitchen, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }, { dish: "garlic_neck", sets: 1 }] }, ctx(now));
  if (r.error) throw new Error(r.error);
  return r.save;
}

describe("finishService (stage 1: plates go out when an order is tapped)", () => {
  const s0 = opened();
  const svc = s0.service!;
  const customers = planService(svc.seed, { day: kitchen.day, reputation: kitchen.reputation, menu: ["grilled_belly", "garlic_neck"] });
  const after = (ms: number) => ctx(svc.startedAt + ms);
  const report = (served: unknown[], left: unknown[] = [], extra: object = {}) => ({ type: "finishService", serviceId: svc.id, served, left, ...extra });
  const c = customers;
  const late = Math.max(...c.map((x) => x.arriveMs)) + 60_000;

  it("pays tonight's price per plate, moves reputation and keeps a summary", () => {
    const r = applyAction(s0, report([{ customer: c[0].id, dish: "grilled_belly" }, { customer: c[1].id, dish: "garlic_neck" }]), after(late));
    expect(r.error).toBeUndefined();
    expect(r.save.gold).toBe(90);
    expect(r.save.stage).toBe("settle");
    expect(r.save.service).toBeNull();
    // 6 plates, so every customer up to 6 who went without counts as gone
    const gone = Math.min(c.length, 6) - 2;
    expect(r.save.lastService).toEqual({ id: svc.id, served: 2, left: gone, sales: 90, tips: 0, happy: 2, repDelta: 2 * SV.rep.happy + gone * SV.rep.left });
    expect(r.save.reputation).toBe(Math.max(0, 20 + 2 * SV.rep.happy + gone * SV.rep.left));
  });
  it("does not count customers who came after every plate was sold as gone", () => {
    const served = c.slice(0, 6).map((x, i) => ({ customer: x.id, dish: i < 3 ? "grilled_belly" : "garlic_neck" }));
    const r = applyAction(s0, report(served), after(late));
    expect(r.error).toBeUndefined();
    expect(r.save.lastService!.left).toBe(0);
  });
  it("refuses more plates of a dish than were made, a dish not cooked tonight, unknown or repeated customers", () => {
    const four = c.slice(0, 4).map((x) => ({ customer: x.id, dish: "grilled_belly" }));
    expect(applyAction(s0, report(four), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report([{ customer: c[0].id, dish: "baeksuk" }]), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report([{ customer: "c999", dish: "grilled_belly" }]), after(late)).error).toBe("bad_service");
    const twice = [{ customer: c[0].id, dish: "grilled_belly" }, { customer: c[0].id, dish: "grilled_belly" }];
    expect(applyAction(s0, report(twice), after(late)).error).toBe("bad_service");
  });
  it("refuses a report faster than the customers could come or the plates could go out", () => {
    const last = c[c.length - 1];
    expect(applyAction(s0, report([{ customer: last.id, dish: "grilled_belly" }]), after(last.arriveMs - 1)).error).toBe("bad_service");
    // the first customer arrives at firstArriveMs (3 s), one plate needs minMsPerServe (4 s)
    expect(applyAction(s0, report([{ customer: c[0].id, dish: "grilled_belly" }]), after(SV.minMsPerServe - 1)).error).toBe("bad_service");
  });
  it("refuses a left list naming served, unknown or repeated customers", () => {
    const one = [{ customer: c[0].id, dish: "grilled_belly" }];
    expect(applyAction(s0, report(one, [c[0].id]), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report(one, ["c999"]), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report(one, [c[1].id, c[1].id]), after(late)).error).toBe("bad_service");
  });
  it("changes nothing when the settled report is sent again", () => {
    const done = applyAction(s0, report([{ customer: c[0].id, dish: "grilled_belly" }]), after(late)).save;
    const again = applyAction(done, report([{ customer: c[0].id, dish: "grilled_belly" }]), after(late));
    expect(again.error).toBeUndefined();
    expect(again.save).toBe(done);
  });
  it("refuses a report with no service going on", () => {
    expect(applyAction(kitchen, report([]), after(late)).error).toBe("bad_service");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run shared/service/actions.test.ts`
Expected: FAIL — `bad_service` (Task 3에서 막아 둔 case)

- [ ] **Step 3: 정산 쓰기**

`shared/service/settle.ts` 전체:

```ts
import { BALANCE } from "../balance";
import { isDishId, type DishId } from "../content/dishes";
import { seatBonus } from "../growth";
import type { SaveData } from "../save";
import { planService } from "./plan";

const SV = BALANCE.service;
const MAX_SERVED = 60;

// The night's report checked against the customers the seed brought (restaurant v2, stage 1: a plate
// goes out the moment its order is tapped). Each served customer real, once, already arrived, given a
// dish cooked tonight, no more plates of a dish than were made; not faster than minMsPerServe a plate.
// Pays tonight's price per plate (no tips until the waiter serves by hand, stage 2). Every plate served
// is a happy customer; customers who went without while there were plates to give count as gone (those
// after the last plate do not). The same report sent again after it was settled changes nothing.
export function settleService(save: SaveData, a: Record<string, unknown>, now: number): { save: SaveData; error?: string } {
  if (typeof a.serviceId === "string" && a.serviceId === save.lastService?.id) return { save };
  const svc = save.service;
  const bad = { save, error: "bad_service" };
  if (!svc || a.serviceId !== svc.id || !Array.isArray(a.served) || !Array.isArray(a.left) || a.served.length > MAX_SERVED || a.left.length > MAX_SERVED) return bad;
  const menu = svc.dishes.map((d) => d.dish);
  const customers = new Map(planService(svc.seed, { day: save.day, reputation: save.reputation, menu, seats: seatBonus(save) }).map((c) => [c.id, c]));
  const plates = new Map(svc.dishes.map((d) => [d.dish, d.plates]));
  const price = new Map(svc.dishes.map((d) => [d.dish, d.price]));
  const seen = new Set<string>();
  let sales = 0;
  let latest = 0;
  for (const raw of a.served as unknown[]) {
    const e = raw as { customer?: unknown; dish?: unknown } | null;
    if (!e || typeof e !== "object" || typeof e.customer !== "string" || seen.has(e.customer) || !isDishId(e.dish)) return bad;
    const c = customers.get(e.customer);
    const left = plates.get(e.dish as DishId) ?? 0;
    if (!c || left < 1) return bad;
    plates.set(e.dish, left - 1);
    seen.add(e.customer);
    latest = Math.max(latest, c.arriveMs);
    sales += price.get(e.dish)!;
  }
  for (const id of a.left as unknown[]) {
    if (typeof id !== "string" || !customers.has(id) || seen.has(id)) return bad;
  }
  if (new Set(a.left as string[]).size !== (a.left as string[]).length) return bad;
  const elapsed = now - svc.startedAt;
  if (elapsed < latest || elapsed < seen.size * SV.minMsPerServe) return bad;
  const made = svc.dishes.reduce((n, d) => n + d.plates, 0);
  const gone = Math.max(0, Math.min(customers.size, made) - seen.size);
  const happy = seen.size;
  const reputation = Math.max(0, save.reputation + happy * SV.rep.happy + gone * SV.rep.left);
  return {
    save: {
      ...save,
      gold: save.gold + sales,
      reputation,
      stage: "settle",
      service: null,
      lastService: { id: svc.id, served: seen.size, left: gone, sales, tips: 0, happy, repDelta: reputation - save.reputation },
    },
  };
}
```

`shared/actions.ts`: import에 `import { settleService } from "./service/settle";`를 넣고 `finishService` case를 `return settleService(save, a, ctx.now);`로.

`shared/balance.ts`: 타입과 값의 `service`에서 `dishPrice`, `premiumBonus`, `tipRate`, `happyAt`를 지운다(`rep`, `minMsPerServe`, 손님 수·간격·인내심은 그대로).

`shared/service/service.test.ts`: `dishScore`·`serveValue` import와 그 `describe`를 지운다(`planService` 테스트만 남긴다).

`shared/stage.test.ts`: Task 3에서 붙인 `.skip`을 풀고 그 테스트의 보고를 `served: [], left: []`로 바꾼다(`keys`/`accuracy` 제거).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run shared`
Expected: PASS (skip 없음)

- [ ] **Step 5: 커밋**

```bash
git add -A shared
git commit -m "feat(service): stage-1 settle pays tonight's plates; customers after the last plate are not counted as gone"
```

---

### Task 5: 서버·전송·개발 모드에서 비밀 표 걷어내기

**Files:**
- Modify: `server/src/server.ts`
- Delete: `server/src/recipes.ts`, `scripts/check-bundle.ts`
- Modify: `server/test/server.test.ts`
- Modify: `src/App.tsx`, `src/net/transport.ts`, `src/net/transport.test.ts`
- Modify: `package.json` (`check:bundle` 스크립트 삭제)
- Modify: `CLAUDE.md`, `docs/VERSE8.md`

**Interfaces:**
- Consumes: `ActionContext = { now; random }` (Task 3)

- [ ] **Step 1: 서버**

`server/src/server.ts`: `import { RECIPES } from "./recipes";` 줄을 지우고 `act`의 주석과 호출을 바꾼다:

```ts
      // the server alone decides the clock and the dice (hunt and service seeds, timing checks)
      const result = applyAction(readSave(state?.[SAVE_KEY]), action, { now: Date.now(), random: Math.random });
```

```bash
git rm server/src/recipes.ts scripts/check-bundle.ts
```

`server/test/server.test.ts`: "starts with only the grill", "refuses cooking with ingredients the player does not have", "refuses a menu of dishes not found yet", "refuses to open a service without a menu", "refuses a service report with no service going on" 다섯 테스트를 아래 셋으로 바꾼다:

```ts
  test("refuses research of a dish whose ingredients were never brought home", async (server) => {
    server.connect({ account: "kitchen-a" });
    let refused = false;
    try {
      await server.act({ type: "research", dish: "grilled_belly" });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });

  test("refuses to open the shop with a dish not researched", async (server) => {
    server.connect({ account: "kitchen-b" });
    let refused = false;
    try {
      await server.act({ type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }] });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });

  test("refuses a service report with no service going on", async (server) => {
    server.connect({ account: "svc-b" });
    let refused = false;
    try {
      await server.act({ type: "finishService", serviceId: "forged", served: [{ customer: "c0", dish: "grilled_belly" }], left: [] });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });
```

- [ ] **Step 2: 전송과 앱**

`src/net/transport.ts`: `LocalTransport` 생성자의 `context` 주석과 기본값을 바꾼다:

```ts
    // the server's clock and dice, played by the page
    private readonly context: () => ActionContext = () => ({ now: Date.now(), random: Math.random }),
```

`act`의 `await this.context()` → `this.context()`.

`src/App.tsx`: `localRecipes` 주석 두 줄과 상수를 지우고 `LocalApp`을:

```tsx
function LocalApp() {
  const transport = useMemo(() => new LocalTransport(window.localStorage), []);
  return <DayFlow transport={transport} />;
}
```

`src/net/transport.test.ts`: "waits for a context that arrives later ... and cooks with it", "refuses cooking without the recipe table and keeps the ingredients" 두 테스트를 지우고 하나를 넣는다:

```ts
  it("runs the server's rules in the page and keeps the result", async () => {
    const store = memory();
    store.setItem("monster-bbq:save", JSON.stringify({ ...newSave(), stage: "kitchen", gold: 500, seenItems: ["shiitake"], items: { shiitake: 2 } }));
    const t = new LocalTransport(store, undefined, () => ({ now: 0, random: Math.random }));
    const s = await t.act({ type: "research", dish: "shiitake_grill" });
    expect(s.dishes).toEqual({ shiitake_grill: 1 });
    expect((await t.load()).dishes).toEqual({ shiitake_grill: 1 });
  });
```

같은 파일의 "refuses a reply from a server still on an old save version" 테스트에서 `version: 3` → `version: 4`.

- [ ] **Step 3: 문서와 스크립트**

- `package.json`: `"check:bundle": ...` 줄을 지운다.
- `CLAUDE.md`: "레시피 정답 표는 `server/src/recipes.ts`에만 둔다…`npm run check:bundle`로 정답이 번들에 없는지 확인한다." 줄을 지우고 그 자리에 `- 레시피 표는 공개 파일 `shared/content/recipes.ts` 하나(고깃집 개편, 2026-10-15). 맞히기가 없어져 숨기지 않는다.`
- `docs/VERSE8.md` 점검표 2번을 `2. `npm run build` 후 `dist/index.html`에 `GAME_SIZE_RESPONSE`가 있는지`로.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/net server` 그리고 `npm --prefix server run typecheck`
Expected: PASS / 오류 없음. (`npm run test:server`는 Task 9에서 사용자에게 알린 뒤 돌린다.)

- [ ] **Step 5: 커밋**

```bash
git add -A server src/App.tsx src/net package.json CLAUDE.md docs/VERSE8.md scripts
git commit -m "chore: the recipe table is public; no server-only answers, no bundle check"
```

---

### Task 5b: 픽셀 UI 키트로 바꾸기

사용자 결정(2026-10-15): 옛 UI 키트 그림(`art/test/ui`의 창·버튼·탭·게이지·말풍선·막대·대화 막대)은 없애고, React 화면과 Phaser 화면(사냥 HUD, 장사) 모두 새 픽셀 키트로 바꾼다.

**Files:**
- Modify: `src/index.css` (키트 부분 — `ui-panel`부터 `ui-bar`까지, 스크롤바)
- Modify: `src/game/ui.ts`, `src/game/scenes/HuntScene.ts:219`, `src/game/service/ServiceScene.ts:105,216`
- Modify: `src/screens/dialogue/dialogue.css` (대화 막대)
- Modify: `art-src/pixel-pass/convert.py` (UI 아이콘 묶음 추가)
- Delete: `art/test/ui/{panel,btn_normal,btn_pressed,btn_disabled,tab_on,tab_off,gauge_empty,gauge_full,bubble,topbar,ribbon,dialogue_bar}.png`
- 그림: `art/test/ui2/*.png` (이미 들어가 있음, 2026-10-15 사용자 승인. 원본 `art-src/codex/raw/ui_kit_pixel.png`, 자르기 `art-src/ui-kit-pixel/cut.py`)

**Interfaces:**
- Produces: CSS 클래스 `ui-panel`(종이 창·카드), `ui-box`(작은 종이 칸, 같은 그림), `ui-frame`(진한 나무 창, 글자 크림색), `ui-btn`(+ `:active`, `:disabled`), `ui-tab`(이미 바뀜), `ui-bar`(위쪽 막대), `ui-bubble`(꼬리 없는 말풍선), `ui-slot`(아이템 칸), `ui-plate`(놋쇠 이름판), `ui-ribbon`(빨간 리본), `ui-sq`(작은 놋쇠 버튼). 길이 단위 `--k` = 그림 1픽셀 = 게임 2픽셀.

- [ ] **Step 1: 키트 CSS 바꾸기**

`src/index.css`에서 `/* ---- UI kit A pieces ...` 주석부터 `.ui-bar { ... }` 끝까지(`.ui-tab` 블록과 그 위 버튼 포커스 규칙은 그대로 둔다)를 아래로 바꾼다. `.ui-tab` 블록은 이 묶음 안의 `ui-btn` 뒤로 옮겨도 된다.

```css
/* ---- pixel UI kit (art/test/ui2, approved 2026-10-15; cut to real size by art-src/ui-kit-pixel/cut.py).
   One art pixel is two game pixels (--k), and the edge widths are whole art pixels, so every pixel stays
   square. Frames whose edges have grain repeat them (round); flat ones stretch. ---- */
:root { --k: calc(2px * var(--s)); }
/* paper: windows, cards, popups (ink text) */
.ui-panel, .ui-box {
  border: calc(5 * var(--k)) solid transparent;
  border-image: url("../art/test/ui2/card.png") 5 fill / calc(5 * var(--k)) round;
  image-rendering: pixelated;
  color: var(--ink);
}
/* dark walnut: the big frame a screen sits in (cream text) */
.ui-frame {
  border: calc(5 * var(--k)) solid transparent;
  border-image: url("../art/test/ui2/panel.png") 5 fill / calc(5 * var(--k)) stretch;
  image-rendering: pixelated;
  color: var(--cream);
}
.ui-btn {
  font: 700 var(--fs) / 1 "Galmuri11", monospace;
  color: var(--cream);
  text-shadow: var(--s) var(--s) 0 #4a1408;
  padding: 0 var(--k);
  min-height: calc(10 * var(--k));
  background: none;
  border: calc(3 * var(--k)) calc(4 * var(--k)) solid transparent;
  border-image: url("../art/test/ui2/btn_normal.png") 3 4 fill / calc(3 * var(--k)) calc(4 * var(--k)) stretch;
  image-rendering: pixelated;
  white-space: nowrap;
  cursor: pointer;
}
.ui-btn:active:not(:disabled) { border-image-source: url("../art/test/ui2/btn_pressed.png"); transform: translateY(var(--s)); }
.ui-btn:disabled { border-image-source: url("../art/test/ui2/btn_disabled.png"); color: #e0dcd4; text-shadow: var(--s) var(--s) 0 #3a3a3a; cursor: default; }
/* small square brass button (+, -, x) */
.ui-sq {
  font: 700 var(--fs) / 1 "Galmuri11", monospace;
  color: #4a2a12;
  width: calc(11 * var(--k)); height: calc(11 * var(--k)); padding: 0;
  background: none;
  border: calc(3 * var(--k)) solid transparent;
  border-image: url("../art/test/ui2/btn_small.png") 3 fill / calc(3 * var(--k)) stretch;
  image-rendering: pixelated;
  cursor: pointer;
}
.ui-sq:disabled { filter: grayscale(1) brightness(0.8); cursor: default; }
.ui-bubble {
  border: calc(3 * var(--k)) solid transparent;
  border-image: url("../art/test/ui2/bubble_plain.png") 3 fill / calc(3 * var(--k)) stretch;
  image-rendering: pixelated;
  color: var(--ink);
}
.ui-bar {
  border: calc(3 * var(--k)) calc(5 * var(--k)) solid transparent;
  border-image: url("../art/test/ui2/topbar.png") 3 5 fill / calc(3 * var(--k)) calc(5 * var(--k)) stretch;
  image-rendering: pixelated;
  color: var(--cream);
}
.ui-slot {
  display: inline-flex; align-items: center; justify-content: center;
  border: calc(3 * var(--k)) solid transparent;
  border-image: url("../art/test/ui2/slot.png") 3 fill / calc(3 * var(--k)) stretch;
  image-rendering: pixelated;
  color: #b89a74; font-weight: 700;
}
.ui-plate {
  border: calc(4 * var(--k)) solid transparent;
  border-image: url("../art/test/ui2/plate.png") 4 fill / calc(4 * var(--k)) stretch;
  image-rendering: pixelated;
  color: #4a2a12; font-weight: 700;
}
.ui-ribbon {
  border: calc(3 * var(--k)) calc(6 * var(--k)) solid transparent;
  border-image: url("../art/test/ui2/ribbon.png") 3 6 fill / calc(3 * var(--k)) calc(6 * var(--k)) stretch;
  image-rendering: pixelated;
  color: var(--cream); font-weight: 700;
}
```

스크롤바(`::-webkit-scrollbar-thumb`, `:active`)의 `art/test/ui/btn_normal.png` 13 → `art/test/ui2/btn_normal.png` `3 4 fill / calc(3 * var(--k)) calc(4 * var(--k)) stretch`, `btn_pressed.png`도 `ui2`로. 위쪽 `.ui-bar` 말고 스크롤바 트랙의 `topbar.png`도 `ui2`의 `3 5` 조각으로.

대화 막대(`src/screens/dialogue/dialogue.css`의 `.dialogue-box::before`)를 진한 나무 창 조각으로:

```css
  border: calc(5 * var(--k)) solid transparent;
  border-image: url("../../../art/test/ui2/panel.png") 5 fill / calc(5 * var(--k)) stretch;
```

- [ ] **Step 2: Phaser 화면도 새 키트로**

`src/game/ui.ts`의 `PIECES`/`loadUiArt`를 바꾸고 조각을 2배로 그리는 도우미를 둔다:

```ts
// the pixel UI kit (art/test/ui2) inside Phaser scenes; each art pixel is KIT game pixels
const PIECES = ["btn_normal", "btn_pressed", "btn_disabled", "tab_on", "tab_off", "gauge_empty", "gauge_full", "bubble_plain", "topbar", "btn_small"];
const ICONS = ["icon_gold", "icon_day", "icon_charcoal"];
export const KIT = 2;

export function loadUiArt(scene: Phaser.Scene) {
  for (const p of PIECES) if (!scene.textures.exists(`ui_${p}`)) scene.load.image(`ui_${p}`, artUrl(`test/ui2/${p}.png`));
  for (const p of ICONS) if (!scene.textures.exists(`ui_${p}`)) scene.load.image(`ui_${p}`, artUrl(`test/ui/${p}.png`));
}

// A kit piece as a 9-slice `w` x `h` game pixels big: built at art size, drawn KIT times bigger, so its
// edges stay whole art pixels. l/r/t/b are the piece's edge widths in art pixels.
export function kitSlice(scene: Phaser.Scene, x: number, y: number, piece: string, w: number, h: number, l: number, r: number, t: number, b: number) {
  return scene.add.nineslice(x, y, `ui_${piece}`, undefined, Math.round(w / KIT), Math.round(h / KIT), l, r, t, b).setScale(KIT);
}
```

- `addButton`: `const bg = kitSlice(scene, 0, 0, "btn_normal", w, 24, 4, 4, 3, 3);`, `setSize(w, 24)` (`26` 두 군데를 `24`로). 나머지(`setTexture`로 눌림·꺼짐)는 그대로.
- `addTab`: `const bg = kitSlice(scene, 0, 0, "tab_off", 72, 28, 4, 4, 4, 4);`, `label` y를 `0`으로, `setSize(72, 28)`.
- `addGauge`: `empty`/`full`에 `.setScale(KIT)`, 위치는 `x - empty.displayWidth / 2`, `set`의 놋쇠 끝은 3 그림픽셀: `const inner = Math.round(3 + (w - 6) * Math.max(0, Math.min(1, f)));` (`w`는 `full.width`, 그림 픽셀).
- `HuntScene.ts:219` 도시락 말풍선: `const bubble = kitSlice(this, 0, 0, "bubble_plain", 50, 48, 3, 3, 3, 3);` (`kitSlice`를 `../ui`에서 import)
- `ServiceScene.ts:105` 위쪽 막대: `kitSlice(this, 112, 16, "topbar", 212, 20, 5, 5, 3, 3).setDepth(999);`
- `ServiceScene.ts:216` 주문 말풍선: `const bubble = kitSlice(this, 0, 0, "bubble_plain", 56, 50, 3, 3, 3, 3);`

머리 주석 `// UI kit A inside Phaser scenes (walnut, hanji, brass; chosen 2026-10-14)` → `// The pixel UI kit inside Phaser scenes (approved 2026-10-15)`.

- [ ] **Step 3: UI 아이콘 픽셀 변환 (사용자 승인 필요)**

`art-src/pixel-pass/convert.py`의 `GROUPS`에 넣는다(원본은 먼저 `cp art/test/ui/icon_*.png art/test/ui/upg_*.png art-src/pixel-pass/src/ui/`):

```python
    "ui": ([f"ui/{f}.png" for f in ["icon_gold", "icon_day", "icon_charcoal", "icon_notebook", "icon_pot", "upg_melee", "upg_ranged", "upg_armor"]], 1, 16, None),
```

Run: `python -I art-src/pixel-pass/convert.py`
비교 그림(`art-src/preview/pixel_pass_compare.png`의 마지막 줄)을 사용자에게 보여 주고 **승인받은 뒤에만** `cp art-src/pixel-pass/out/ui/*.png art/test/ui/`. 승인 전에는 다음 단계로 가되 아이콘은 옛것 그대로 둔다.

- [ ] **Step 4: 옛 키트 그림 지우기**

```bash
grep -rn "test/ui/\(panel\|btn_\|tab_\|gauge_\|bubble\|topbar\|ribbon\|dialogue_bar\)" src
```

Expected: 결과 없음. 그다음:

```bash
cd art/test/ui && git rm panel.png btn_normal.png btn_pressed.png btn_disabled.png tab_on.png tab_off.png gauge_empty.png gauge_full.png bubble.png topbar.png ribbon.png dialogue_bar.png
```

- [ ] **Step 5: 화면 확인**

Run: `npm run typecheck` (CSS만 바뀌므로 그대로 통과해야 한다)
브라우저(`?local`, 1280×720)에서 정산 화면·업그레이드 창·주방이 새 키트로 보이고 글자가 틀 밖으로 나가지 않는지 본다. 버튼 높이가 40 → 20 게임 픽셀로 줄어서 글자가 잘리면 `.ui-btn`의 `min-height`를 `calc(12 * var(--k))`로 올린다.

사냥 화면(돌아가기 버튼, 도시락 말풍선, 가방 표시)과 장사 화면(위쪽 막대, 주문 말풍선, 인내심 게이지, 마감 버튼)도 새 키트로 보이는지 본다. 대화창(뚜껑이 힌트)이 진한 나무 막대로 보이는지 본다.

- [ ] **Step 6: 커밋**

```bash
git add -A src/index.css src/game src/screens/dialogue art art-src/pixel-pass
git commit -m "feat(ui): every screen wears the pixel UI kit; the old kit pictures are gone"
```

---

### Task 6: 주방 화면 (도감·메뉴판·강화·도시락)

**Files:**
- Modify: `src/screens/kitchen/Kitchen.tsx` (전체 재작성)
- Modify: `src/screens/kitchen/Cookbook.tsx` (전체 재작성)
- Modify: `src/screens/kitchen/MenuPick.tsx` (전체 재작성)
- Create: `src/screens/kitchen/DishUpgrade.tsx`, `src/screens/kitchen/ResearchWindow.tsx`
- Create: `art/test/shop/bg.png` (승인된 가게 배경 복사)
- Modify: `src/screens/kitchen/LunchPick.tsx`
- Modify: `src/screens/kitchen/kitchen.css`
- Modify: `src/screens/Upgrades.tsx`
- Modify: `src/screens/DayFlow.tsx` (`openShop`)
- Modify: `src/i18n/ko.ts`, `src/i18n/en.ts`
- Delete: `src/screens/kitchen/Research.tsx`

**Interfaces:**
- Consumes: Task 5b의 키트 클래스(`ui-frame`, `ui-box`, `ui-slot`, `ui-plate`, `ui-ribbon`, `ui-sq`, `ui-btn`, `ui-bar`, `ui-bubble`); `RECIPES`, `dishPrice`, `platesPerSet`, `levelCost`, `setsAvailable`, `planShop`, `fitMenu`, `MAX_DISH_LEVEL`, `MAX_SETS`, `MenuLine` (Task 1); actions `research`, `upgradeDish`, `openShop` (Task 3)
- Produces: `Kitchen({ save, busy, act, onReady: (menu: MenuLine[]) => void })`; `ResearchCutIn`은 Task 8에서 `Cookbook`이 쓴다(이 작업에서는 `Cookbook`이 연구 성공 시 `onResearched(dish)`만 부른다).

- [ ] **Step 1: 문구**

`src/i18n/ko.ts`에서 **지울 키**: `kitchen.tab.research`, `kitchen.fridge`, `kitchen.fridgeEmpty`, `kitchen.pot`, `kitchen.potEmpty`, `kitchen.method`, `kitchen.cook`, `kitchen.new`, `kitchen.known`, `kitchen.hint.*`(5개), `kitchen.fail.*`(5개), `kitchen.failLine`, `kitchen.servings`, `kitchen.needTool`, `kitchen.again`, `tool.*`(5개), `cook.*`(전부), `dish.*.hint`(8개), `upgrade.pot`, `upgrade.grillQuality`, `upgrade.potQuality`, `upgrade.wok`, `upgrade.fryer`, `upgrade.board`, `upgrade.fx.quality`, `upgrade.fx.pot`, `upgrade.fx.wok`, `upgrade.fx.fryer`, `upgrade.fx.board`, `service.toShop`, `service.wrongDish`, `service.title`, `service.body`, `service.sell`. `kitchen.newLine`은 컷인에서 쓰므로 남긴다. `en.ts`에서도 같은 키를 지운다.

**넣을 키** (ko / en):

```ts
  "kitchen.tab.upgrade": "강화",                       // "Upgrade"
  "kitchen.title": "할매 돌판집 · 저녁 주방",          // "Granny's Grill · Evening Kitchen"
  "kitchen.shape": "재료 {n}개 · {method}",            // "{n} ingredients · {method}"
  "kitchen.lv": "Lv {lv}",                              // "Lv {lv}"
  "kitchen.canResearch": "연구 가능!",                  // "Ready!"
  "kitchen.basePrice": "기본 가격 {price}골드",         // "Base price {price}g"
  "kitchen.have": "가진 것 {n}",                        // "{n} in the fridge"
  "kitchen.unseen": "아직 못 본 재료",                  // "Not found yet"
  "kitchen.needAll": "재료를 다 보면 연구할 수 있어요", // "Find every ingredient to research it"
  "kitchen.researchCost": "{gold}골드 + 재료 1세트",    // "{gold}g + 1 set"
  "kitchen.doResearch": "연구하기",                     // "Research"
  "kitchen.needSet": "재료 1세트 필요",                // "Needs 1 set of ingredients"
  "kitchen.close": "닫기",                              // "Close"
  "kitchen.nameLv": "{name} · Lv {lv}",                 // "{name} · Lv {lv}"
  "kitchen.rowInfo": "{price}골드 · {plates}그릇 · 재료 {sets}세트", // "{price}g · {plates} plates · {sets} set(s)"
  "kitchen.put": "올리기",                              // "Add"
  "kitchen.putDone": "올림",                            // "On"
  "kitchen.take": "빼기",                               // "Remove"
  "kitchen.board": "오늘 메뉴판 {n}/{max}",            // "Tonight's menu {n}/{max}"
  "kitchen.lineMade": "그릇 {plates}개 · {price}골드",  // "{plates} plates · {price}g"
  "kitchen.lineMore": "{n}세트 더 가능",                // "{n} more set(s)"
  "kitchen.premiumMix": "특급 섞임 +{pct}%",            // "premium +{pct}%"
  "kitchen.emptySlot": "빈 칸 · 왼쪽에서 요리를 올려 주세요", // "Empty · add a dish from the left"
  "kitchen.lockedSlot": "잠김 · 메뉴판 업그레이드로 열림",   // "Locked · upgrade the menu board"
  "kitchen.total": "오늘 밤 그릇 {plates}개",           // "{plates} plates tonight"
  "kitchen.totalGold": "다 팔면 {gold}골드",            // "{gold}g if all sell"
  "kitchen.priceUp": "가격 {a} → {b}",                  // "Price {a} → {b}"
  "kitchen.platesUp": "세트당 {a} → {b}그릇",           // "{a} → {b} plates a set"
  "kitchen.costGold": "{gold}골드 +",                   // "{gold}g +"
  "kitchen.upgradeBuy": "강화",                          // "Upgrade"
  "kitchen.noSets": "재료 부족",                         // "Not enough"
  "kitchen.noDishes": "아직 연구한 요리가 없다. 도감에서 연구해 보자.", // "No dishes researched yet. Research one in the cookbook."
  "service.platesLeft": "남은 그릇 {n}",                 // "{n} plates left"
```

`kitchen.menuEmpty`의 ko 값을 `"아직 연구한 요리가 없다. 도감에서 연구해 보자."`로(en: `"No dishes researched yet. Research one in the cookbook."`), `kitchen.found`는 `"연 요리 {n}/{max}"`(en `"Dishes {n}/{max}"`), `kitchen.ready`는 `"장사 시작"`(en `"Open the shop"`).

**뚜껑이 힌트(재료를 어디서 구하나) — 사용자 확인 2026-10-15(깻잎 줄은 모바일에도 맞게 고침).** 키 `where.<item>`:

| 키 | ko (후보) | en |
|---|---|---|
| `where.boar_belly` | 삼겹살은 멧돼지 배에 붙어 있껑. 숲에 널렸껑. | Pork belly comes off a boar. The forest is full of them. |
| `where.boar_neck` | 목살도 멧돼지껑. 돌진은 피하고 뒤를 노리껑. | Neck's a boar too. Dodge the charge, hit it from behind. |
| `where.boar_rib` | 갈비는 멧돼지 옆구리껑. 잘 안 나오니 여러 마리 잡껑. | Ribs are a boar's side. They're rare, so hunt a few. |
| `where.rabbit_leg` | 토끼 다리는 토끼한테 있지 어디 있껑. 도망가니 작살로 잡껑. | Rabbit legs are on rabbits. They run, so harpoon them. |
| `where.honeycomb` | 벌집꿀은 벌한테서 나오껑. 침 쏘는 거 조심하껑. | Honeycomb comes from the bees. Mind the stingers. |
| `where.chicken_thigh` | 닭다리살은 숲 닭이껑. 떼로 다니니 조심하껑. | Chicken thigh: forest chickens. They come in flocks. |
| `where.chicken_breast` | 닭가슴살도 숲 닭이껑. 한 마리씩 떼어 내 잡껑. | Chicken breast too. Pick them off one at a time. |
| `where.shiitake` | 표고는 숲 바닥에서 줍껑. 나무 밑을 잘 보껑. | Shiitake grows on the forest floor. Look under the trees. |
| `where.wild_garlic` | 산마늘은 풀숲에 숨어 있껑. 냄새로 찾껑. | Wild garlic hides in the grass. Follow your nose. |
| `where.perilla` | 깻잎은 숲 가장자리에서 줍껑. 반짝이는 풀을 잘 보껑. | Perilla grows at the forest's edge. Look for the shining leaves. |

- [ ] **Step 2: 도감과 연구 창 (시안 `art-src/mockups/kitchen-cookbook*.html`, 사용자 승인 2026-10-15)**

카드에는 버튼을 넣지 않는다. 모든 카드가 같은 모양(실루엣, "재료 N개 · 조리법", 재료 칸)이고, 재료를 다 본 카드는 금색으로 빛나며 모서리에 "연구 가능!" 이름판이 붙는다. 못 연 카드를 누르면 연구 창이 열린다: 재료를 다 봤으면 비용과 [연구하기], 아니면 "재료를 다 보면 연구할 수 있어요"와 뚜껑이의 재료 힌트(꼬리 없는 말풍선).

`src/screens/kitchen/Cookbook.tsx` 전체:

```tsx
import { useState } from "react";
import type { Action } from "../../../shared/actions";
import { DISHES, type DishId } from "../../../shared/content/dishes";
import { RECIPES } from "../../../shared/content/recipes";
import type { SaveData } from "../../../shared/save";
import { t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";
import { ItemIcon } from "./ItemIcon";
import { ResearchWindow } from "./ResearchWindow";

// The cookbook (restaurant v2 design 5, mock-up approved 2026-10-15): every dish as a card. Researched:
// its level ribbon, picture, name and ingredients. Not yet: its silhouette, "N ingredients · method" and
// the ingredients already brought home ("?" for the rest); a card whose ingredients have all been seen
// glows and carries a "ready to research" plate. Tapping a card not researched opens the research window.
export function Cookbook({ save, busy, act, onResearch }: { save: SaveData; busy: boolean; act: (a: Action) => void; onResearch: (dish: DishId) => void }) {
  const ids = Object.keys(DISHES) as DishId[];
  const opened = ids.filter((id) => save.dishes[id]).length;
  const [open, setOpen] = useState<DishId | null>(null);

  const slots = (id: DishId, showAll: boolean) => (
    <div className="dish-slots">
      {RECIPES[id].items.map((item) => (
        <span key={item} className="ui-slot dish-slot">
          {showAll || save.seenItems.includes(item) ? <ItemIcon itemKey={item} /> : "?"}
        </span>
      ))}
    </div>
  );

  return (
    <div className="cookbook">
      <h3 className="cookbook-count">{t("kitchen.found", { n: opened, max: ids.length })}</h3>
      <div className="cookbook-grid">
        {ids.map((id) => {
          const lv = save.dishes[id];
          if (lv)
            return (
              <div key={id} className="ui-box dish-card">
                <span className="ui-ribbon dish-lv">{t("kitchen.lv", { lv })}</span>
                <DishIcon dish={id} />
                <div className="dish-name">{t(`dish.${id}` as StringKey)}</div>
                {slots(id, true)}
              </div>
            );
          const r = RECIPES[id];
          const can = r.items.every((item) => save.seenItems.includes(item));
          return (
            <button key={id} className={`ui-box dish-card closed${can ? " can" : ""}`} onClick={() => setOpen(id)}>
              {can && <span className="ui-plate dish-can">{t("kitchen.canResearch")}</span>}
              <DishIcon dish={id} silhouette />
              <div className="dish-shape">{t("kitchen.shape", { n: r.items.length, method: t(`method.${r.method}` as StringKey) })}</div>
              {slots(id, false)}
            </button>
          );
        })}
      </div>
      {open && (
        <ResearchWindow
          dish={open}
          save={save}
          busy={busy}
          onClose={() => setOpen(null)}
          onResearch={() => {
            onResearch(open);
            act({ type: "research", dish: open });
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}
```

`src/screens/kitchen/ResearchWindow.tsx`:

```tsx
import type { DishId } from "../../../shared/content/dishes";
import { parseItemKey, type ItemId } from "../../../shared/content/items";
import { RECIPES } from "../../../shared/content/recipes";
import { levelCost, setsAvailable } from "../../../shared/kitchen/dish";
import type { SaveData } from "../../../shared/save";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";
import { ItemIcon } from "./ItemIcon";

// The research window over the cookbook (mock-up approved 2026-10-15): the dish's silhouette, how it is
// made and its base price, each ingredient with how many the fridge holds. Every ingredient seen: the cost
// (gold and one set) and the research button. Not yet: the lid says where the first missing one is found.
export function ResearchWindow({ dish, save, busy, onClose, onResearch }: { dish: DishId; save: SaveData; busy: boolean; onClose: () => void; onResearch: () => void }) {
  const r = RECIPES[dish];
  const missing = r.items.find((id) => !save.seenItems.includes(id));
  const cost = levelCost(dish, 1)!;
  const why = save.gold < cost.gold ? t("upgrade.noGold") : setsAvailable(save.items, dish) < cost.sets ? t("kitchen.needSet") : null;
  const have = (id: ItemId) => Object.entries(save.items).reduce((n, [k, c]) => (parseItemKey(k)?.id === id ? n + c : n), 0);
  return (
    <>
      <div className="research-shade" onClick={onClose} />
      <div className="ui-panel research-win" role="dialog">
        <button className="ui-sq research-x" onClick={onClose} aria-label={t("kitchen.close")}>
          ×
        </button>
        <div className="research-head">
          <DishIcon dish={dish} silhouette scale={2} />
          <div>
            <h2 className="research-name">???</h2>
            <p className="dish-shape">
              {t("kitchen.shape", { n: r.items.length, method: t(`method.${r.method}` as StringKey) })} · {t("kitchen.basePrice", { price: r.price })}
            </p>
          </div>
        </div>
        <ul className="research-need">
          {r.items.map((id) => {
            const seen = save.seenItems.includes(id);
            return (
              <li key={id}>
                <span className="ui-slot research-slot">{seen ? <ItemIcon itemKey={id} /> : "?"}</span>
                {seen ? (
                  <span>
                    {t(`item.${id}` as StringKey)} <span className="soft">· {t("kitchen.have", { n: have(id) })}</span>
                  </span>
                ) : (
                  <span className="soft">{t("kitchen.unseen")}</span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="research-foot">
          {missing ? (
            <span className="research-cost soft">{t("kitchen.needAll")}</span>
          ) : (
            <>
              <span className="research-cost">{t("kitchen.researchCost", { gold: cost.gold })}</span>
              <button className="ui-btn research-go" disabled={busy || why !== null} onClick={onResearch}>
                {why ?? t("kitchen.doResearch")}
              </button>
            </>
          )}
        </div>
        {missing && (
          <div className="research-lid">
            <p className="ui-bubble research-say">{t(`where.${missing}` as StringKey)}</p>
            <img src={artUrl("test/lid/smug.png")} alt="" />
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 3: 메뉴판 (시안 `art-src/mockups/kitchen-menu.html`)**

왼쪽은 연 요리 목록(올리기), 오른쪽은 오늘 메뉴판(칸마다 −/+ 세트, 그릇 수·가격, 특급 섞임, 더 넣을 수 있는 세트), 빈 칸, 아직 못 연 칸 하나, 아래에 오늘 밤 합계.

`src/screens/kitchen/MenuPick.tsx` 전체:

```tsx
import { DISHES, type DishId } from "../../../shared/content/dishes";
import { level, maxLevel, menuSlots } from "../../../shared/growth";
import { dishPrice, MAX_SETS, planShop, platesPerSet, setsAvailable, type MenuLine } from "../../../shared/kitchen/dish";
import type { SaveData } from "../../../shared/save";
import { t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";

// Tonight's menu board (restaurant v2 design 5, mock-up approved 2026-10-15). Left: researched dishes to
// put on the board. Right: the board's slots, each line with its sets (-/+), the plates and price it
// makes (a premium part in a set raises the price) and how many more sets the fridge still has for it;
// empty slots, one locked slot while the menu-slot upgrade has more to give, and tonight's totals. The
// server takes the sets when the shop opens.
export function MenuPick({ save, menu, setMenu }: { save: SaveData; menu: MenuLine[]; setMenu: (m: MenuLine[]) => void }) {
  const known = (Object.keys(DISHES) as DishId[]).filter((id) => save.dishes[id]);
  const slots = menuSlots(save);
  const plan = planShop(save.items, save.dishes, menu);
  const left = plan?.items ?? {};
  const on = (id: DishId) => menu.some((l) => l.dish === id);
  const setSets = (id: DishId, sets: number) => setMenu(menu.map((l) => (l.dish === id ? { ...l, sets } : l)));
  const plates = plan?.dishes.reduce((n, d) => n + d.plates, 0) ?? 0;
  const gold = plan?.dishes.reduce((n, d) => n + d.plates * d.price, 0) ?? 0;

  return (
    <div className="menu-pick">
      <div className="menu-list">
        {known.length === 0 && <p className="kitchen-empty">{t("kitchen.menuEmpty")}</p>}
        {known.map((id) => {
          const lv = save.dishes[id]!;
          const can = !on(id) && menu.length < slots && setsAvailable(left, id) > 0;
          return (
            <div key={id} className={`ui-box menu-row${on(id) ? " on" : ""}`}>
              <DishIcon dish={id} />
              <span className="menu-info">
                <span className="dish-name">{t("kitchen.nameLv", { name: t(`dish.${id}` as StringKey), lv })}</span>
                <span className="dish-shape">{t("kitchen.rowInfo", { price: dishPrice(id, lv), plates: platesPerSet(lv), sets: setsAvailable(save.items, id) })}</span>
              </span>
              <button className="ui-btn menu-put" disabled={!can} onClick={() => setMenu([...menu, { dish: id, sets: 1 }])}>
                {on(id) ? t("kitchen.putDone") : t("kitchen.put")}
              </button>
            </div>
          );
        })}
      </div>
      <div className="menu-board">
        <h3 className="menu-title">{t("kitchen.board", { n: menu.length, max: slots })}</h3>
        {menu.map((l) => {
          const d = plan?.dishes.find((x) => x.dish === l.dish);
          const base = dishPrice(l.dish, save.dishes[l.dish] ?? 1);
          const more = setsAvailable(left, l.dish);
          return (
            <div key={l.dish} className="ui-box menu-line">
              <DishIcon dish={l.dish} />
              <span className="menu-info">
                <span className="dish-name">{t(`dish.${l.dish}` as StringKey)}</span>
                {d && <span className="menu-made">{t("kitchen.lineMade", { plates: d.plates, price: d.price })}</span>}
                <span className="dish-shape">
                  {t("kitchen.lineMore", { n: more })}
                  {d && d.price > base ? ` · ${t("kitchen.premiumMix", { pct: Math.round((d.price / base - 1) * 100) })}` : ""}
                </span>
              </span>
              <span className="menu-sets">
                <button className="ui-sq" disabled={l.sets <= 1} onClick={() => setSets(l.dish, l.sets - 1)}>−</button>
                <span className="menu-count">{l.sets}</span>
                <button className="ui-sq" disabled={more < 1 || l.sets >= MAX_SETS} onClick={() => setSets(l.dish, l.sets + 1)}>+</button>
                <button className="ui-sq" onClick={() => setMenu(menu.filter((x) => x.dish !== l.dish))} aria-label={t("kitchen.take")}>×</button>
              </span>
            </div>
          );
        })}
        {Array.from({ length: slots - menu.length }, (_, i) => (
          <div key={`e${i}`} className="ui-box menu-empty">{t("kitchen.emptySlot")}</div>
        ))}
        {level(save, "menu") < maxLevel("menu") && <div className="ui-box menu-empty">{t("kitchen.lockedSlot")}</div>}
        <div className="menu-sum">
          <span>{t("kitchen.total", { plates })}</span>
          <span>{t("kitchen.totalGold", { gold })}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 강화 탭 (시안 `art-src/mockups/kitchen-upgrade.html`)**

`src/screens/kitchen/DishUpgrade.tsx`:

```tsx
import type { Action } from "../../../shared/actions";
import { DISHES, type DishId } from "../../../shared/content/dishes";
import { RECIPES } from "../../../shared/content/recipes";
import { dishPrice, levelCost, MAX_DISH_LEVEL, platesPerSet, setsAvailable } from "../../../shared/kitchen/dish";
import type { SaveData } from "../../../shared/save";
import { t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";
import { ItemIcon } from "./ItemIcon";

// Dish upgrades (restaurant v2 design 3, Q6; mock-up approved 2026-10-15): one row a researched dish —
// its level as brass pips, what the next level brings, what it costs (gold and sets of its own
// ingredients, shown as their icons) and the button. The server checks and charges (upgradeDish).
export function DishUpgrade({ save, busy, act }: { save: SaveData; busy: boolean; act: (a: Action) => void }) {
  const known = (Object.keys(DISHES) as DishId[]).filter((id) => save.dishes[id]);
  return (
    <div className="dish-upgrade">
      {known.length === 0 && <p className="kitchen-empty">{t("kitchen.noDishes")}</p>}
      {known.map((id) => {
        const lv = save.dishes[id]!;
        const cost = levelCost(id, lv + 1);
        const why = !cost ? t("upgrade.max") : save.gold < cost.gold ? t("upgrade.noGold") : setsAvailable(save.items, id) < cost.sets ? t("kitchen.noSets") : null;
        return (
          <div key={id} className="ui-box upgrade-dish">
            <DishIcon dish={id} />
            <span className="upgrade-who">
              <span className="dish-name">{t(`dish.${id}` as StringKey)}</span>
              <span className="pips">
                {Array.from({ length: MAX_DISH_LEVEL }, (_, i) => (
                  <i key={i} className={i < lv ? "on" : ""} />
                ))}
              </span>
            </span>
            {cost ? (
              <>
                <span className="upgrade-next">
                  <span>{t("kitchen.priceUp", { a: dishPrice(id, lv), b: dishPrice(id, lv + 1) })}</span>
                  <span>{t("kitchen.platesUp", { a: platesPerSet(lv), b: platesPerSet(lv + 1) })}</span>
                </span>
                <span className="upgrade-cost">
                  {t("kitchen.costGold", { gold: cost.gold })}
                  {RECIPES[id].items.map((item) => (
                    <span key={item} className="ui-slot cost-slot">
                      <ItemIcon itemKey={item} />
                    </span>
                  ))}
                  ×{cost.sets}
                </span>
              </>
            ) : (
              <span className="upgrade-max">{t("upgrade.max")}</span>
            )}
            <button className="ui-btn" disabled={busy || why !== null} onClick={() => act({ type: "upgradeDish", dish: id })}>
              {why ?? t("kitchen.upgradeBuy")}
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: 도시락**

`src/screens/kitchen/LunchPick.tsx`:
- import에서 `BALANCE` 아래 줄 `import { servings } from "../../../shared/kitchen/cook";`를 지우고 `import { dishPrice, setsAvailable } from "../../../shared/kitchen/dish";`를 넣는다.
- `const known = ... .filter((id) => save.cookbook[id]);` → `.filter((id) => save.dishes[id]);`
- `servings(save.cookbook[id]!, save.items)` → `setsAvailable(save.items, id)`
- `BALANCE.service.dishPrice[id]` → `dishPrice(id, save.dishes[id]!)`
- 맨 위 주석 "found dishes" → "researched dishes", "for health" 앞에 "(by the dish's level price)"를 넣는다.

- [ ] **Step 6: 주방 틀, 하루 흐름, 스타일**

가게 배경(승인됨)을 주방 뒤에 깐다:

```bash
mkdir -p art/test/shop && cp art-src/pixellab/shop2/bg_320_faithful.png art/test/shop/bg.png
```

`src/screens/kitchen/Kitchen.tsx` 전체:

```tsx
import { useState } from "react";
import type { Action } from "../../../shared/actions";
import type { DishId } from "../../../shared/content/dishes";
import { fitMenu, type MenuLine } from "../../../shared/kitchen/dish";
import type { SaveData } from "../../../shared/save";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { Cookbook } from "./Cookbook";
import { DishUpgrade } from "./DishUpgrade";
import { LunchPick } from "./LunchPick";
import { MenuPick } from "./MenuPick";
import "./kitchen.css";

// The evening kitchen (restaurant v2 design 5, mock-ups approved 2026-10-15): the shop behind, dimmed; the
// shop's name plate at the top left, day and gold at the top right, four tabs, the walnut frame with the
// cookbook / menu board / dish upgrades / lunchbox, and the open button at the bottom centre. Every change
// goes through `act` (the server's rules); the screen shows what the save says.
type Tab = "cookbook" | "menu" | "upgrade" | "lunch";
const TABS: Tab[] = ["cookbook", "menu", "upgrade", "lunch"];

export function Kitchen({
  save,
  busy,
  act,
  onReady,
}: {
  save: SaveData;
  busy: boolean;
  act: (a: Action) => void;
  onReady: (menu: MenuLine[]) => void;
}) {
  const [tab, setTab] = useState<Tab>("cookbook");
  // starts from last night's menu, cut to what the fridge makes now
  const [menu, setMenu] = useState<MenuLine[]>(() => fitMenu(save.items, save.dishes, save.menu));
  // the dish whose research was just asked for: the cut-in plays once the save has it (Task 8)
  const [asked, setAsked] = useState<DishId | null>(null);
  void asked;
  return (
    <div className="kitchen" style={{ backgroundImage: `url(${artUrl("test/shop/bg.png")})` }}>
      <div className="kitchen-dim" />
      <div className="ui-plate kitchen-title">{t("kitchen.title")}</div>
      <div className="ui-bar kitchen-res">
        <span>
          <img className="ui-icon" src={artUrl("test/ui/icon_day.png")} alt="" />
          {t("hud.day", { day: save.day })}
        </span>
        <span>
          <img className="ui-icon" src={artUrl("test/ui/icon_gold.png")} alt="" />
          {t("hud.gold", { gold: save.gold })}
        </span>
      </div>
      <div className="kitchen-tabs">
        {TABS.map((k) => (
          <button key={k} className={`ui-tab${k === tab ? " on" : ""}`} onClick={() => setTab(k)}>
            {t(`kitchen.tab.${k}` as StringKey)}
          </button>
        ))}
      </div>
      <div className="ui-frame kitchen-body">
        {tab === "cookbook" && <Cookbook save={save} busy={busy} act={act} onResearch={setAsked} />}
        {tab === "menu" && <MenuPick save={save} menu={menu} setMenu={setMenu} />}
        {tab === "upgrade" && <DishUpgrade save={save} busy={busy} act={act} />}
        {tab === "lunch" && <LunchPick save={save} busy={busy} act={act} />}
      </div>
      <button className="ui-btn kitchen-ready" disabled={busy || menu.length === 0} onClick={() => onReady(menu)}>
        {t("kitchen.ready")}
      </button>
    </div>
  );
}
```

`src/screens/DayFlow.tsx`:
- import에 `import type { MenuLine } from "../../shared/kitchen/dish";`. `DishId, Method` import와 `toolQuality` import를 지운다.
- `openShop`을:

```tsx
  // "Open the shop": the menu board goes to the server, which takes the sets and opens the service
  async function openShop(menu: MenuLine[]) {
    await act({ type: "openShop", menu }, "service");
  }
```

(`Night`는 Task 7에서 고친다.)

`src/screens/Upgrades.tsx`:
- `GROUPS`의 주방 줄을 `{ title: "upgrade.group.kitchen", ids: ["menu"] },`로.
- `ICON`에서 `pot`, `grillQuality`, `potQuality`, `wok`, `fryer`, `board` 줄을 지운다.
- `effect`의 `case "grillQuality": case "potQuality": return pair(G.quality, ...)` 세 줄을 지운다.

`src/screens/kitchen/kitchen.css` 전체(크기는 게임 픽셀, `--s`배; 시안 `art-src/mockups`의 CSS 픽셀 ÷ 2):

```css
/* The evening kitchen (restaurant v2 design 5, mock-ups approved 2026-10-15). Sizes in game pixels times
   --s; the kit frames come from index.css (ui-frame, ui-box, ui-btn, ui-slot, ui-plate, ui-ribbon, ui-sq). */
.kitchen { position: absolute; inset: 0; background: center / 100% 100% no-repeat; image-rendering: pixelated; font-size: var(--fs); color: var(--cream); }
.kitchen-dim { position: absolute; inset: 0; background: rgb(14 8 5 / 0.55); }
.kitchen-title { position: absolute; left: calc(12px * var(--s)); top: calc(10px * var(--s)); padding: 0 calc(6px * var(--s)); line-height: calc(10px * var(--s)); }
.kitchen-res { position: absolute; right: calc(12px * var(--s)); top: calc(13px * var(--s)); display: flex; gap: calc(12px * var(--s)); align-items: center; white-space: nowrap; }
.kitchen-res span { display: inline-flex; align-items: center; gap: calc(4px * var(--s)); }
.kitchen-tabs { position: absolute; left: calc(20px * var(--s)); top: calc(44px * var(--s)); display: flex; gap: calc(4px * var(--s)); z-index: 2; }
.kitchen-body { position: absolute; left: calc(12px * var(--s)); right: calc(12px * var(--s)); top: calc(68px * var(--s)); bottom: calc(42px * var(--s)); overflow: auto; padding: calc(4px * var(--s)); }
.kitchen-ready { position: absolute; left: 50%; bottom: calc(7px * var(--s)); transform: translateX(-50%); width: calc(160px * var(--s)); z-index: 2; }
.kitchen-ready:active:not(:disabled) { transform: translate(-50%, var(--s)); }
.kitchen-empty { margin: calc(4px * var(--s)); font: var(--fs-small) "Galmuri9", monospace; color: #d8c4a4; }
.soft { color: var(--paper-ink-soft); }

/* pictures */
.dish-icon { display: block; height: auto; image-rendering: pixelated; }
.dish-icon.silhouette { filter: brightness(0); opacity: 0.32; }
.item-icon { position: relative; display: inline-flex; }
.item-icon img { width: calc(21px * var(--s)); height: auto; image-rendering: pixelated; }
.item-star { position: absolute; right: calc(-2px * var(--s)); top: calc(-4px * var(--s)); font-size: var(--fs-small); color: var(--brass); }

/* cookbook */
.cookbook-count { position: absolute; right: calc(14px * var(--s)); top: calc(-1px * var(--s)); margin: 0; font: 700 var(--fs) "Galmuri11", monospace; color: var(--brass); }
.cookbook-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: calc(8px * var(--s)); margin-top: calc(10px * var(--s)); }
.dish-card { position: relative; height: calc(101px * var(--s)); display: flex; flex-direction: column; align-items: center; padding: 0; font: inherit; background: none; color: var(--ink); }
.dish-card.closed { cursor: pointer; }
.dish-card.can { filter: drop-shadow(0 0 0 #ffd65a) drop-shadow(var(--k) 0 0 #ffd65a) drop-shadow(calc(-1 * var(--k)) 0 0 #ffd65a) drop-shadow(0 var(--k) 0 #ffd65a) drop-shadow(0 calc(-1 * var(--k)) 0 #ffd65a); }
.dish-card .dish-icon { margin-top: calc(-2px * var(--s)); }
.dish-name { font-weight: 700; color: var(--ink); }
.dish-shape { font: var(--fs-small) "Galmuri9", monospace; color: var(--paper-ink-soft); margin: 0; }
.dish-slots { display: flex; gap: calc(3px * var(--s)); margin-top: calc(2px * var(--s)); }
.dish-slot { width: calc(28px * var(--s)); height: calc(28px * var(--s)); }
.dish-slot .item-icon img { margin: calc(-6px * var(--s)); }
.dish-lv { position: absolute; right: calc(-4px * var(--s)); top: calc(-4px * var(--s)); padding: 0 calc(4px * var(--s)); line-height: calc(10px * var(--s)); }
.dish-can { position: absolute; right: calc(-5px * var(--s)); top: calc(-5px * var(--s)); padding: 0 calc(5px * var(--s)); line-height: calc(10px * var(--s)); font-size: var(--fs-small); white-space: nowrap; }

/* research window */
.research-shade { position: fixed; inset: 0; z-index: 20; background: rgb(10 6 4 / 0.7); }
.research-win { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: calc(400px * var(--s)); height: calc(250px * var(--s)); z-index: 21; padding: calc(4px * var(--s)) calc(8px * var(--s)); }
.research-x { position: absolute; right: calc(-4px * var(--s)); top: calc(-4px * var(--s)); }
.research-head { display: flex; gap: calc(12px * var(--s)); align-items: center; }
.research-name { margin: 0; font: 700 calc(18px * var(--s)) "Galmuri11", monospace; }
.research-need { list-style: none; margin: calc(9px * var(--s)) 0 0; padding: 0; display: flex; flex-direction: column; gap: calc(5px * var(--s)); }
.research-need li { display: flex; align-items: center; gap: calc(8px * var(--s)); }
.research-slot { width: calc(32px * var(--s)); height: calc(32px * var(--s)); }
.research-slot .item-icon img { margin: calc(-6px * var(--s)); }
.research-foot { position: absolute; left: calc(12px * var(--s)); right: calc(12px * var(--s)); bottom: calc(10px * var(--s)); display: flex; align-items: center; justify-content: space-between; }
.research-cost { font-weight: 700; }
.research-go { width: calc(130px * var(--s)); }
.research-lid { position: absolute; right: calc(-20px * var(--s)); bottom: calc(10px * var(--s)); width: calc(220px * var(--s)); display: flex; flex-direction: column; align-items: flex-end; }
.research-say { margin: 0 0 calc(4px * var(--s)); padding: calc(2px * var(--s)) calc(8px * var(--s)); line-height: 1.6; }
.research-lid img { width: calc(100px * var(--s)); image-rendering: pixelated; }

/* menu board */
.menu-pick { display: grid; grid-template-columns: calc(260px * var(--s)) 1fr; gap: calc(10px * var(--s)); margin-top: calc(10px * var(--s)); }
.menu-list { display: flex; flex-direction: column; gap: calc(5px * var(--s)); }
.menu-row, .menu-line { display: flex; align-items: center; gap: calc(6px * var(--s)); color: var(--ink); }
.menu-row { height: calc(52px * var(--s)); }
.menu-row.on { opacity: 0.45; }
.menu-info { flex: 1; display: flex; flex-direction: column; gap: var(--s); min-width: 0; }
.menu-put { width: calc(54px * var(--s)); }
.menu-title { margin: 0 0 calc(4px * var(--s)) calc(4px * var(--s)); font: 700 var(--fs) "Galmuri11", monospace; color: var(--brass); }
.menu-board { display: flex; flex-direction: column; gap: calc(6px * var(--s)); }
.menu-line { height: calc(66px * var(--s)); }
.menu-made { color: var(--good); font-weight: 700; }
.menu-sets { display: flex; align-items: center; gap: calc(4px * var(--s)); }
.menu-count { min-width: calc(16px * var(--s)); text-align: center; font-weight: 700; }
.menu-empty { height: calc(36px * var(--s)); display: flex; align-items: center; justify-content: center; color: var(--paper-ink-soft); }
.menu-sum { display: flex; justify-content: space-between; margin: 0 calc(4px * var(--s)); }

/* dish upgrades */
.dish-upgrade { display: flex; flex-direction: column; gap: calc(6px * var(--s)); margin-top: calc(10px * var(--s)); }
.upgrade-dish { height: calc(66px * var(--s)); display: grid; grid-template-columns: calc(48px * var(--s)) calc(140px * var(--s)) 1fr calc(150px * var(--s)) calc(84px * var(--s)); align-items: center; gap: calc(6px * var(--s)); color: var(--ink); }
.upgrade-who, .upgrade-next { display: flex; flex-direction: column; gap: calc(2px * var(--s)); }
.upgrade-next { color: var(--good); font-weight: 700; }
.upgrade-cost { display: flex; align-items: center; gap: calc(3px * var(--s)); font: var(--fs-small) "Galmuri9", monospace; }
.cost-slot { width: calc(26px * var(--s)); height: calc(26px * var(--s)); }
.cost-slot .item-icon img { margin: calc(-6px * var(--s)); }
.upgrade-max { color: var(--brass); font-weight: 700; text-align: center; grid-column: 3 / 5; }
.pips { display: flex; gap: calc(2px * var(--s)); }
.pips i { width: calc(10px * var(--s)); height: calc(10px * var(--s)); border: calc(3px * var(--s)) solid transparent; border-image: url("../../../art/test/ui2/btn_small.png") 3 fill / calc(3px * var(--s)) stretch; image-rendering: pixelated; filter: grayscale(1) brightness(0.55); }
.pips i.on { filter: none; }

/* lunchbox (kept from before, on the new frame) */
.lunch-pick { display: flex; flex-direction: column; gap: calc(4px * var(--s)); height: 100%; margin-top: calc(10px * var(--s)); }
.lunch-box { display: flex; gap: calc(4px * var(--s)); min-height: calc(50px * var(--s)); }
.lunch-slot { display: inline-flex; padding: 0; background: none; cursor: pointer; }
.lunch-slot.packed { cursor: default; filter: saturate(0.6); }
.lunch-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: calc(4px * var(--s)); flex: 1; min-height: 0; overflow: auto; align-content: start; }
.lunch-pick > .ui-btn { align-self: flex-start; }
```

(`.upgrade-row`, `.upgrade-name`, `.upgrade-fx`는 업그레이드 창에서 계속 쓰므로 그 파일의 CSS는 그대로 둔다.)

`git rm src/screens/kitchen/Research.tsx`

화면 확인: 브라우저 `?local` 1280×720에서 네 탭이 시안(`art-src/preview/mock_kitchen_*.png`)과 같은 배치인지, 글자가 틀 밖으로 나가지 않는지 본다. 어긋나면 이 CSS의 크기만 고친다.

- [ ] **Step 7: 커밋**

이 작업 끝에서는 `src/game/cook`이 아직 남아 있어 `npm run typecheck`가 깨질 수 있다(Task 7에서 지움). i18n 테스트만 돌린다.

Run: `npx vitest run src/i18n`
Expected: PASS

```bash
git add -A src/screens src/i18n
git commit -m "feat(kitchen): cookbook silhouettes with research, menu board with sets, dish upgrades"
```

---

### Task 7: 임시 밤 장사와 사냥 도시락

**Files:**
- Modify: `src/game/service/ServiceScene.ts`
- Modify: `src/game/service/ServiceGame.tsx` (전체 재작성)
- Modify: `src/screens/DayFlow.tsx` (`Night`)
- Modify: `src/game/scenes/HuntScene.ts` (도시락 회복량)
- Delete: `src/game/cook/` (폴더 전체)

**Interfaces:**
- Consumes: `SaveData.service.dishes` (Task 2), `finishService` 보고 `{ served: { customer: string; dish: string }[]; left: string[] }` (Task 4), `dishPrice` (Task 1)
- Produces: `ServiceData = { serviceId: string; customers: Customer[]; dishes: TonightDish[] }`; `ServedReport = { customer: string; dish: DishId }`; `HuntData.lunchbox: { dish: DishId; heal: number }[]`

- [ ] **Step 1: 장사 장면에서 조리 화면 떼기**

`src/game/service/ServiceScene.ts`:

1. 맨 위 import에서 `Method`, `dishScore, serveValue`, `CookStage, Order` 줄을 지우고 넣는다:

```ts
import { DISHES, type DishId } from "../../../shared/content/dishes";
import type { TonightDish } from "../../../shared/kitchen/dish";
import { artUrl } from "../art";
```

2. 머리 주석의 "Tap an order: the view zooms into the cooking stage ... (the stage keeps cooking either way)." 문장을 "Tap an order: the plate goes out at once (restaurant v2 stage 1, until the waiter serves by hand). When the last plate is gone the doors close by themselves." 로 바꾸고, "Art: until ..." 문단은 그대로.

3. 타입:

```ts
export interface ServiceData {
  // the service's id: the shop clock is kept per service so a reload resumes the night where it was
  serviceId: string;
  customers: Customer[];
  // tonight's plates and prices (openShop)
  dishes: TonightDish[];
}

export interface ServedReport {
  customer: string;
  dish: DishId;
}
```

4. 필드: `private methods ...`, `private inCook = false;` 를 지우고 `private plates = new Map<DishId, number>();`, `private prices = new Map<DishId, number>();`를 넣는다.

5. `init`: `this.methods = data.methods;`, `this.inCook = false;`를 지우고:

```ts
    this.plates = new Map(data.dishes.map((d) => [d.dish, d.plates]));
    this.prices = new Map(data.dishes.map((d) => [d.dish, d.price]));
```

6. `preload` 주석과 본문:

```ts
  preload() {
    loadCharacterArt(this);
    loadUiArt(this);
    // tables: the grill stands in until the new shop art goes in (stage 2)
    this.load.image("grill", artUrl("test/cooking/grill.png"));
    for (const id of Object.keys(DISHES)) this.load.image(`dish_${id}`, artUrl(`test/dishes/${id}.png`));
  }
```

7. `create`: `this.game.events.on("service:serve", ...)`, `this.game.events.on("service:shop", ...)`와 `shutdown`의 `off` 두 줄을 지운다(`events.once("shutdown", ...)` 블록 통째로).

8. `togglePause`: `if (this.paused) this.scene.pause("cook"); else this.scene.resume("cook");`와 그 주석을 지운다.

9. `update`: `const orders: Order[] = ...`와 `this.registry.set("orders", orders);`(그 주석 포함)를 지운다. `tally` 줄을:

```ts
    const left = [...this.plates.values()].reduce((a, b) => a + b, 0);
    this.tally.setText(`${t("service.tally", { served: this.served.length, total: this.customers.length, gold: this.earned })} · ${t("service.platesLeft", { n: left })}`);
    // the last plate is gone: no one else comes in (the ones inside still wait for theirs)
    if (left === 0 && !this.ordersClosed) this.close();
```

10. `makeBubble`의 탭 동작: `.on("pointerdown", () => this.openOrder(g))` → `.on("pointerdown", () => this.serve(g))`. 주석 "Tap to cook." → "Tap to serve.".

11. `stepGuest`의 `walking` → `seated`로 바뀌는 곳(`g.phase = "seated";` 바로 위)에서 고를 요리를 정한다:

```ts
          // tonight's dish if plates are left, else any dish that still has some; none left: home, unbothered
          const dish = (this.plates.get(g.c.dish) ?? 0) > 0 ? g.c.dish : [...this.plates.entries()].find(([, n]) => n > 0)?.[0];
          if (!dish) {
            g.phase = "leaving";
            s.setFlipX(true).play(`${who}_walk_side`);
            g.angry = true;
            break;
          }
          if (dish !== g.c.dish) {
            g.c = { ...g.c, dish };
            this.makeBubble(g);
          }
```

(`angry = true`는 문 쪽으로 걸어 나가게만 하는 플래그다 — `left`에 넣지 않고 평판 팝업도 없다.)

12. `onServed`, `openOrder`, `toShop` 세 메서드를 지우고 `serve`를 넣는다:

```ts
  // A tapped order goes out at once if a plate of it is left: the customer eats, pays and leaves.
  private serve(g: Guest) {
    if (this.paused || g.phase !== "seated") return;
    const n = this.plates.get(g.c.dish) ?? 0;
    if (n < 1) return;
    this.plates.set(g.c.dish, n - 1);
    this.served.push({ customer: g.c.id, dish: g.c.dish });
    g.phase = "eating";
    g.bubble.setVisible(false);
    const gold = this.prices.get(g.c.dish) ?? 0;
    this.earned += gold;
    // a happy little bounce while eating, then the coins, then out
    this.tweens.add({ targets: g.sprite, y: SEAT_Y - 4, duration: 180, yoyo: true, repeat: 5 });
    this.time.delayedCall(2200, () => {
      this.pop(g.sprite.x, SEAT_Y - 70, `+${gold}`, "#ffd166");
      g.phase = "leaving";
      g.sprite.play(`${STAND_IN[g.c.kind]}_walk_side`);
    });
  }
```

13. `Guest.c`를 바꿀 수 있게 `interface Guest`의 `c: Customer;`는 그대로(객체 교체).

`src/game/service/ServiceGame.tsx` 전체:

```tsx
import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { ServiceScene, type ServedReport, type ServiceData } from "./ServiceScene";

// The night service in a page: one Phaser game per mount. "service:end" reaches onEnd with what was
// served and who left.
export function ServiceGame({ shop, onEnd }: { shop: ServiceData; onEnd: (r: { served: ServedReport[]; left: string[] }) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const start = useRef(shop);

  useEffect(() => {
    const g = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      pixelArt: true,
      backgroundColor: "#2b211c",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    g.scene.add("shop", ServiceScene, true, start.current);
    g.events.on("service:end", (r: { served: ServedReport[]; left: string[] }) => onEndRef.current(r));
    return () => g.destroy(true);
  }, []);

  return <div ref={host} className="service-stage" />;
}
```

`src/screens/DayFlow.tsx`의 `Night` 전체와 호출부:

```tsx
// Tonight's service: the customers the server's seed brings (same plan as the server checks) and the
// plates the menu board made.
function Night({ save, onEnd }: { save: SaveData; onEnd: (r: { served: { customer: string; dish: string }[]; left: string[] }) => void }) {
  const svc = save.service!;
  const customers = planService(svc.seed, { day: save.day, reputation: save.reputation, menu: svc.dishes.map((d) => d.dish), seats: seatBonus(save) });
  return <ServiceGame key={svc.id} shop={{ serviceId: svc.id, customers, dishes: svc.dishes }} onEnd={onEnd} />;
}
```

(호출부 `act({ type: "finishService", serviceId: save.service!.id, ...r }, "settle")`는 그대로.)

- [ ] **Step 2: 도시락 회복량을 요리 레벨로**

`src/game/scenes/HuntScene.ts`:
- `HuntData`의 `lunchbox: DishId[];` → `lunchbox: { dish: DishId; heal: number }[];` (주석: `// dishes packed for this hunt and the health each gives back (its level price, shared/kitchen/dish): eat one with its button (or keys 1-3)`)
- `private lunch: { dish: DishId; ...; eaten: boolean }[]` → `{ dish: DishId; heal: number; button: ...; eaten: boolean }[]`
- 173줄 근처 `for (const id of new Set(this.huntData.lunchbox))` → `for (const id of new Set(this.huntData.lunchbox.map((l) => l.dish)))`
- 218줄 근처 `this.huntData.lunchbox.forEach((dish, i) => {` → `this.huntData.lunchbox.forEach(({ dish, heal }, i) => {` 그리고 그 안 `this.lunch.push({ dish, button, eaten: false });` → `this.lunch.push({ dish, heal, button, eaten: false });`
- `eat`의 `const heal = Math.round(BALANCE.service.dishPrice[l.dish] * BALANCE.lunch.healPerGold);` → `const heal = l.heal;`

`src/screens/DayFlow.tsx`의 `PhaserGame` 호출에서 `lunchbox: save.lunchbox` →

```tsx
lunchbox: save.lunchbox.map((dish) => ({ dish, heal: Math.round(dishPrice(dish, save.dishes[dish] ?? 1) * BALANCE.lunch.healPerGold) })),
```

DayFlow import에 `import { BALANCE } from "../../shared/balance";`, `import { dishPrice, type MenuLine } from "../../shared/kitchen/dish";`.

- [ ] **Step 3: 직접 조리 화면 지우기**

```bash
git rm -r src/game/cook
```

`grep -rn "game/cook\|CookStage\|cook:ready" src` 결과가 없어야 한다.

직접 조리 그림도 지운다(사용자 결정 2026-10-15: 옛 화면은 모두 없앤다). 임시 장사 식탁과 업그레이드 창의 좌석 아이콘이 쓰는 `grill.png` 하나만 남긴다:

```bash
cd art/test/cooking && git rm $(ls | grep -v '^grill\.png$') && cd ../../..
git rm art-src/codex/raw/cook_grill.png art-src/codex/raw/cook_pieces.png art-src/codex/raw/cook_pieces2.png art-src/codex/raw/cook_salt_rest.png art-src/codex/raw/cook_tools.png
grep -rn "test/cooking/" src
```

Expected: 마지막 grep에 `grill.png`만 나온다.

- [ ] **Step 4: 전체 테스트와 타입 검사**

Run: `npm test` 그리고 `npm run typecheck` 그리고 `npm --prefix server run typecheck`
Expected: 모두 통과. 실패하면 남은 옛 이름(`cookbook`, `tools`, `servings`, `dishPrice[`, `toolQuality`)을 `grep -rn`으로 찾아 이 계획의 새 이름으로 바꾼다.

- [ ] **Step 5: 커밋**

```bash
git add -A src
git commit -m "feat(service): stage-1 night serves a tapped order at once from tonight's plates; lunch heals by dish level; cooking stage removed"
```

---

### Task 8: 반달이 그림 넣기와 연구 성공 컷인

**Files:**
- Create: `art-src/pixellab/shop2/slice_bandal.py`
- Create: `art/test/bandal/{idle,breathe,grill,turn,serve,smile,startled,wipe}.png` (스크립트 출력)
- Create: `src/screens/kitchen/cutIn.ts`, `src/screens/kitchen/cutIn.test.ts`
- Create: `src/screens/kitchen/ResearchCutIn.tsx`, `src/screens/kitchen/cutIn.css`
- Modify: `src/screens/kitchen/Kitchen.tsx`
- Modify: `src/i18n/ko.ts`, `src/i18n/en.ts`

**Interfaces:**
- Consumes: `Kitchen`의 `asked` 상태 (Task 6)
- Produces: `cutInStep(ms: number): { frame: BandalFrame; stamp: boolean; line: boolean; done: boolean }`, `type BandalFrame = "grill" | "turn" | "serve" | "smile"`, `CUT_IN_MS = 4000`, `ResearchCutIn({ dish, onDone })`

- [ ] **Step 1: 반달이 자르기 (승인된 변환본, 코드로 그리지 않음)**

`art-src/pixellab/shop2/slice_bandal.py`:

```python
"""Cut the approved Bandal sheet (PixelLab pixel conversion, 4 x 2 poses) into one PNG per pose.

    python art-src/pixellab/shop2/slice_bandal.py

Only cuts, keys the magenta background to transparent and trims; nothing is drawn.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SHEET = ROOT / "art-src/pixellab/shop2/bandal_200_faithful.png"
OUT = ROOT / "art/test/bandal"
NAMES = [["idle", "breathe", "grill", "turn"], ["serve", "smile", "startled", "wipe"]]


def key(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            if r > 150 and b > 150 and g < 120:
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = key(Image.open(SHEET))
    w, h = sheet.width / 4, sheet.height / 2
    for r, row in enumerate(NAMES):
        for c, name in enumerate(row):
            cell = sheet.crop((round(c * w), round(r * h), round((c + 1) * w), round((r + 1) * h)))
            cell.crop(cell.getbbox()).save(OUT / f"{name}.png")
            print(name, cell.getbbox())


if __name__ == "__main__":
    main()
```

Run: `python -I art-src/pixellab/shop2/slice_bandal.py`
Expected: 8줄 출력, `art/test/bandal/`에 PNG 8개. `art-src/preview/`에 8장을 4배로 붙인 확인 그림을 만들어 눈으로 본다(마젠타 테두리가 남으면 `key`의 문턱을 `g < 130`으로).

- [ ] **Step 2: 컷인 순서 테스트**

`src/screens/kitchen/cutIn.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CUT_IN_MS, cutInStep } from "./cutIn";

describe("cutInStep", () => {
  it("runs the Bandal cut-in in order: grill, flip, the plate with the stamp, the secret smile with the lid's line", () => {
    expect(cutInStep(0)).toEqual({ frame: "grill", stamp: false, line: false, done: false });
    expect(cutInStep(1000)).toEqual({ frame: "turn", stamp: false, line: false, done: false });
    expect(cutInStep(2000)).toEqual({ frame: "serve", stamp: true, line: false, done: false });
    expect(cutInStep(3000)).toEqual({ frame: "smile", stamp: true, line: true, done: false });
    expect(cutInStep(CUT_IN_MS)).toEqual({ frame: "smile", stamp: true, line: true, done: true });
  });
});
```

Run: `npx vitest run src/screens/kitchen/cutIn.test.ts`
Expected: FAIL — `./cutIn` 없음

- [ ] **Step 3: 컷인 순서**

`src/screens/kitchen/cutIn.ts`:

```ts
// The research cut-in (restaurant v2 design 6, user-chosen): bars close in, Bandal grills, flips, holds
// out the plate while the dish name stamps down, then smiles to himself while the lid has its say.
// About four seconds; a tap skips it.
export type BandalFrame = "grill" | "turn" | "serve" | "smile";
export const CUT_IN_MS = 4000;

export function cutInStep(ms: number): { frame: BandalFrame; stamp: boolean; line: boolean; done: boolean } {
  const frame: BandalFrame = ms < 900 ? "grill" : ms < 1800 ? "turn" : ms < 2800 ? "serve" : "smile";
  return { frame, stamp: ms >= 1800, line: ms >= 2800, done: ms >= CUT_IN_MS };
}
```

Run: `npx vitest run src/screens/kitchen/cutIn.test.ts`
Expected: PASS

- [ ] **Step 4: 컷인 화면**

문구 추가(ko / en): `"cutin.new": "새 요리!"` / `"New dish!"`. 뚜껑이 대사는 기존 `kitchen.newLine` ("나쁘지 않껑. 할미의 반의반은 되껑. 칭찬 아니껑!")을 쓴다.

`src/screens/kitchen/ResearchCutIn.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DishId } from "../../../shared/content/dishes";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { cutInStep } from "./cutIn";
import { DishIcon } from "./DishIcon";
import "./cutIn.css";

// The research cut-in over the whole frame (Bandal art approved 2026-10-15; the close-up, flames and
// stamp art come later, these are the stand-ins). A click, tap, Space or Enter skips it.
export function ResearchCutIn({ dish, onDone }: { dish: DishId; onDone: () => void }) {
  const [ms, setMs] = useState(0);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const t0 = performance.now();
    let id = requestAnimationFrame(function loop(now) {
      const elapsed = now - t0;
      setMs(elapsed);
      if (cutInStep(elapsed).done) finishRef.current();
      else id = requestAnimationFrame(loop);
    });
    const key = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") finishRef.current();
    };
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", key);
    };
  }, []);

  const step = cutInStep(ms);
  const frame = document.querySelector(".game-frame") ?? document.body;
  return createPortal(
    <div className="cutin" onPointerDown={finish}>
      <div className="cutin-bar top" />
      <div className="cutin-bar bottom" />
      <img className="cutin-bandal" src={artUrl(`test/bandal/${step.frame}.png`)} alt="" />
      {step.stamp && (
        <div className="cutin-stamp">
          <DishIcon dish={dish} scale={2} />
          <span className="cutin-new">{t("cutin.new")}</span>
          <span className="cutin-name">{t(`dish.${dish}` as StringKey)}</span>
        </div>
      )}
      {step.line && <p className="cutin-line">{t("kitchen.newLine")}</p>}
    </div>,
    frame,
  );
}
```

(`.game-frame`은 `Dialogue`가 포털로 붙는 곳과 같은 요소다 — `grep -n "createPortal" src/screens/dialogue/Dialogue.tsx`로 실제 대상 선택자를 확인하고 같은 것을 쓴다.)

`src/screens/kitchen/cutIn.css`:

```css
.cutin { position: absolute; inset: 0; z-index: 50; background: rgb(10 6 4 / 0.82); display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: hidden; }
.cutin-bar { position: absolute; left: 0; right: 0; height: 16%; background: #000; animation: cutin-bar 0.3s ease-out both; }
.cutin-bar.top { top: 0; transform-origin: top; }
.cutin-bar.bottom { bottom: 0; transform-origin: bottom; }
@keyframes cutin-bar { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.cutin-bandal { width: calc(150px * var(--s)); image-rendering: pixelated; animation: cutin-in 0.25s ease-out; }
@keyframes cutin-in { from { transform: translateX(-30%); opacity: 0; } to { transform: none; opacity: 1; } }
.cutin-stamp { position: absolute; right: 12%; top: 26%; display: flex; flex-direction: column; align-items: center; gap: calc(2px * var(--s)); animation: cutin-stamp 0.22s steps(3) both; }
@keyframes cutin-stamp { from { transform: scale(2.2); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.cutin-stamp .dish-icon { image-rendering: pixelated; }
.cutin-new { font: 700 var(--fs) "Galmuri11", monospace; color: var(--brass); }
.cutin-name { font: 700 calc(var(--fs) * 1.3) "Galmuri11", monospace; color: #fff3d8; text-shadow: 0 calc(1px * var(--s)) 0 #2b1408; }
.cutin-line { position: absolute; left: 0; right: 0; bottom: 18%; margin: 0; text-align: center; font: var(--fs) "Galmuri11", monospace; color: #fff3d8; }
```

`src/screens/kitchen/Kitchen.tsx`:
- import에 `import { ResearchCutIn } from "./ResearchCutIn";`
- `void asked;` 줄을 지우고, `return (` 바로 위에:

```tsx
  // the cut-in plays once the server has opened the dish that was asked for
  const landed = asked && save.dishes[asked] ? asked : null;
```

- `</div>`(가장 바깥 `kitchen` div 닫기) 바로 앞에:

```tsx
      {landed && <ResearchCutIn key={landed} dish={landed} onDone={() => setAsked(null)} />}
```

연구가 거부되면(`no_gold` 등) `save.dishes[asked]`가 생기지 않으므로 컷인은 뜨지 않고, 다음 연구 요청이 `asked`를 덮어쓴다.

- [ ] **Step 5: 확인과 커밋**

Run: `npx vitest run src` 그리고 `npm run typecheck`
Expected: PASS

```bash
git add art-src/pixellab/shop2/slice_bandal.py art/test/bandal src/screens/kitchen src/i18n
git commit -m "feat(kitchen): Bandal's research cut-in (approved pixel art, stand-in close-up)"
```

---

### Task 9: 직접 플레이 확인과 배포

**Files:** 없음(확인만). 고칠 것이 나오면 그 파일을 고치고 같은 작업 안에서 커밋한다.

- [ ] **Step 1: 전체 검사**

Run: `npm test`, `npm run typecheck`, `npm --prefix server run typecheck`, `npm run build`
Expected: 모두 통과, `dist/index.html`에 `GAME_SIZE_RESPONSE`가 있다(`grep -c GAME_SIZE_RESPONSE dist/index.html` ≥ 1).

- [ ] **Step 2: 서버 하네스 (사용자에게 먼저 알림)**

사용자에게 "서버 테스트를 돌립니다. Windows에서 isolated-vm 오류 창이 뜰 수 있어요."라고 알린 뒤:
Run: `npm run test:server`
Expected: PASS

- [ ] **Step 3: 브라우저로 하루 돌려 보기 (개발 서버 5190, `?local`)**

미리보기(`.claude/launch.json`의 `dev-running` 또는 `dev`)로 연다. 개발자 도구 콘솔에서 `localStorage.removeItem("monster-bbq:save")` 후 새로고침하고 확인한다:
1. 사냥에서 멧돼지를 잡고 돌아오면 도감의 삼겹살 구이 카드에 삼겹살 아이콘이 보이고 카드가 금색으로 빛나며 "연구 가능!"이 붙는다. 누르면 연구 창에 비용(200골드 + 재료 1세트)과 [연구하기](골드가 모자라면 "골드 부족").
2. 골드가 있는 세이브로(콘솔에서 세이브의 `gold`를 올려 저장) 연구 → 반달이 컷인 → 카드가 Lv 1/5로 바뀐다. 컷인은 클릭으로 건너뛰어진다.
3. 아직 못 본 재료가 있는 카드를 누르면 연구 창에 "재료를 다 보면 연구할 수 있어요"와 뚜껑이의 힌트(꼬리 없는 말풍선)가 나온다.
4. 메뉴판에서 요리를 넣고 세트 −/+ → 그릇 수·가격·"재료 N세트 더"가 바뀐다. 재료보다 더 올릴 수 없다.
5. 강화 탭에서 강화 → 가격·세트당 그릇이 오른다.
6. 장사 시작 → 손님 말풍선을 누르면 바로 먹고 돈을 낸다. 상단에 남은 그릇. 그릇이 다 떨어지면 주문 마감.
7. 정산 화면 → 다음 날. 새로고침해도 단계와 세이브가 유지된다.
8. 옛 v4 세이브(Task 2 테스트의 `v4` 객체를 JSON으로)를 `localStorage`의 `monster-bbq:save`에 넣고 새로고침 → 주방에서 찾았던 요리가 Lv 1, 골드 환불, 오류 없음.

콘솔 오류가 없어야 한다(`read_console_messages`).

- [ ] **Step 4: 점검표와 푸시**

docs/VERSE8.md 점검표를 돌리고:

```bash
git push gitlab develop
git push github develop:main
```

Verse8 에디터 미리보기에서 콘솔 오류와 서버 저장(새로고침 후 유지)을 확인한다.
