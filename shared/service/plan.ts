import { BALANCE } from "../balance";
import type { DishId } from "../content/dishes";
import { seededRandom } from "../hunt/scatter";

// Tonight's customers (restaurant v2 design 4, Dave's rules 2026-10-16): who comes when over the night's
// clock, what they order from the menu, how long they wait, what they want to drink, whether they leave
// a mess on the grill. Decided by the server's seed, so the server can check the service report the same
// way. Which stool they take is the page's business.
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
  messy: boolean;
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
  // spread over the open hours: even slots, each arrival moved a little inside its slot
  const gap = (SV.lastArrivalMs - SV.firstArriveMs) / Math.max(1, count - 1);
  const out: Customer[] = [];
  for (let i = 0; i < count; i++) {
    const jitter = i === 0 ? 0 : (rand() - 0.5) * gap * SV.gapJitter;
    const arriveMs = Math.round(Math.min(SV.lastArrivalMs, SV.firstArriveMs + i * gap + jitter));
    const kind = Math.floor(rand() * 4) as Customer["kind"];
    const dish = opts.menu[Math.floor(rand() * opts.menu.length)];
    const patienceMs = between(SV.patienceMs[0], SV.patienceMs[1]);
    const r = rand();
    const drink: Drink = r < D.tea ? "tea" : r < D.tea + D.after / 2 ? "cider" : r < D.tea + D.after ? "sikhye" : "none";
    const messy = rand() < SV.messy;
    out.push({ id: `c${i}`, kind, arriveMs, dish, patienceMs, drink, messy });
  }
  return out;
}
