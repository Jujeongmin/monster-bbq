import { BALANCE } from "../balance";
import type { DishId } from "../content/dishes";
import { seededRandom } from "../hunt/scatter";

// Tonight's customers (restaurant v2 design 4): who comes when, what they order from the menu, how long
// they wait, what they want to drink. Decided by the server's seed, so the server can check the service
// report the same way. Which stool they take is the page's business (the first clean, free one).
const SV = BALANCE.service;

// none, barley tea before the meal, cider or sikhye after it
export type Drink = "none" | "tea" | "cider" | "sikhye";
export const isDrink = (v: unknown): v is Drink => v === "none" || v === "tea" || v === "cider" || v === "sikhye";

export interface Customer {
  id: string;
  // which yokai regular (art; names and personalities come with the story, plan 07)
  kind: 0 | 1 | 2 | 3;
  arriveMs: number;
  dish: DishId;
  patienceMs: number;
  drink: Drink;
}

export function customerCount(reputation: number): number {
  return Math.max(SV.minCustomers, Math.min(SV.maxCustomers, SV.baseCustomers + Math.floor(reputation / SV.perReputation)));
}

export function planService(seed: number, opts: { day: number; reputation: number; menu: DishId[] }): Customer[] {
  if (opts.menu.length === 0) return [];
  const rand = seededRandom(seed);
  const count = customerCount(opts.reputation);
  const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
  const D = SV.drinks;
  const out: Customer[] = [];
  let at = SV.firstArriveMs;
  for (let i = 0; i < count; i++) {
    if (i > 0) at += between(SV.gapMs[0], SV.gapMs[1]);
    const kind = Math.floor(rand() * 4) as Customer["kind"];
    const dish = opts.menu[Math.floor(rand() * opts.menu.length)];
    const patienceMs = between(SV.patienceMs[0], SV.patienceMs[1]);
    const r = rand();
    const drink: Drink = r < D.tea ? "tea" : r < D.tea + D.after / 2 ? "cider" : r < D.tea + D.after ? "sikhye" : "none";
    out.push({ id: `c${i}`, kind, arriveMs: at, dish, patienceMs, drink });
  }
  return out;
}
