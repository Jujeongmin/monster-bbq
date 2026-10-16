import { BALANCE } from "../balance";
import type { DishId } from "../content/dishes";
import { itemKey, ITEMS, type ItemId } from "../content/items";
import { RECIPES } from "../content/recipes";
import { starMul } from "../awaken";

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
// ingredients). A dish's price is its level price, times its awakening (06b-1), raised by premiumBonus for
// the share of its sets that used a premium part. null when the items do not cover the whole menu.
export function planShop(
  items: Record<string, number>,
  levels: Partial<Record<DishId, number>>,
  menu: MenuLine[],
  stars: Partial<Record<DishId, number>> = {},
): { items: Record<string, number>; dishes: TonightDish[] } | null {
  let left = items;
  const dishes: TonightDish[] = [];
  for (const line of menu) {
    const level = levels[line.dish] ?? 1;
    const took = takeSets(left, line.dish, line.sets);
    if (!took) return null;
    left = took.items;
    const price = Math.round(dishPrice(line.dish, level) * starMul(stars[line.dish] ?? 0) * (1 + (D.premiumBonus * took.premium) / line.sets));
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

// Whether the shop can open with this menu: at least one line, and the fridge still covers all of it.
export function canOpen(items: Record<string, number>, levels: Partial<Record<DishId, number>>, menu: MenuLine[]): boolean {
  return menu.length > 0 && planShop(items, levels, menu) !== null;
}

// The sets a dish still makes once the dishes already picked (a lunchbox being packed) took one set each,
// in order: dishes that share an ingredient count against each other.
export function setsAfter(items: Record<string, number>, picked: DishId[], dish: DishId): number {
  let rest = items;
  for (const p of picked) rest = takeSets(rest, p, 1)?.items ?? rest;
  return setsAvailable(rest, dish);
}
