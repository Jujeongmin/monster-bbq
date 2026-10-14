import type { DishId, Method } from "../content/dishes";
import { ITEMS, parseItemKey, type ItemId, type Taste } from "../content/items";

// What a dish is made of. The full table is the server's (server/src/recipes.ts); a save's cookbook
// holds the ones that player has found.
export interface Recipe {
  method: Method;
  items: ItemId[];
}

// How a try in the research kitchen went (spec 4): a dish, a near miss with a hint, or a flop.
export type CookOutcome =
  | { kind: "new" | "known"; dish: DishId }
  | { kind: "near"; hint: "method" | "extra" }
  | { kind: "near"; hint: "missing"; taste: Taste }
  | { kind: "fail"; method: Method };

// The last try, kept in the save so a resent try (same attemptId) is not cooked twice.
export interface CookResult {
  attemptId: string;
  outcome: CookOutcome;
}

type Table = Record<DishId, Recipe>;
type Cookbook = Partial<Record<DishId, Recipe>>;

const sameSet = (a: ItemId[], b: ItemId[]) => a.length === b.length && a.every((x) => b.includes(x));
// `small` is `big` with exactly one item taken out
const oneShort = (small: ItemId[], big: ItemId[]) => small.length === big.length - 1 && small.every((x) => big.includes(x));

// Judges one try against the server's table (items are distinct item ids). The closest recipe in table
// order gives the hint: right items with the wrong method, then one item short, then one item over.
export function judgeCook(items: ItemId[], method: Method, recipes: Table, cookbook: Cookbook): CookOutcome {
  const entries = Object.entries(recipes) as [DishId, Recipe][];
  const hit = entries.find(([, r]) => r.method === method && sameSet(items, r.items));
  if (hit) return { kind: cookbook[hit[0]] ? "known" : "new", dish: hit[0] };
  if (entries.some(([, r]) => sameSet(items, r.items))) return { kind: "near", hint: "method" };
  const short = entries.find(([, r]) => r.method === method && oneShort(items, r.items));
  if (short) {
    const missing = short[1].items.find((x) => !items.includes(x))!;
    return { kind: "near", hint: "missing", taste: ITEMS[missing].taste };
  }
  if (entries.some(([, r]) => r.method === method && oneShort(r.items, items))) return { kind: "near", hint: "extra" };
  return { kind: "fail", method };
}

// Cookbook hint lines to open after gaining these items: every dish not found yet that uses one of
// them, plus those already open, once each, in table order.
export function hintsFor(itemIds: ItemId[], recipes: Table, cookbook: Cookbook, open: DishId[]): DishId[] {
  return (Object.keys(recipes) as DishId[]).filter((id) => !cookbook[id] && (open.includes(id) || recipes[id].items.some((x) => itemIds.includes(x))));
}

// How many plates of a recipe the fridge makes: per item both grades count, the scarcest item decides.
export function servings(recipe: Recipe, items: Record<string, number>): number {
  const have = (id: ItemId) => Object.entries(items).reduce((n, [key, c]) => (parseItemKey(key)?.id === id ? n + c : n), 0);
  return Math.min(...recipe.items.map(have));
}
