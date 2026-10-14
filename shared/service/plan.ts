import { BALANCE } from "../balance";
import type { DishId } from "../content/dishes";
import { seededRandom } from "../hunt/scatter";

// Tonight's customers (cooking-service design 5): who comes when, what they order from the menu, how
// long they wait. Decided by the server's seed, so the server can check the service report the same way.
const SV = BALANCE.service;

export interface Customer {
  id: string;
  // which forest resident (art; names and personalities come with the story, plan 07)
  kind: 0 | 1 | 2 | 3;
  arriveMs: number;
  dish: DishId;
  patienceMs: number;
  seat: number;
}

export function planService(seed: number, opts: { day: number; reputation: number; menu: DishId[] }): Customer[] {
  if (opts.menu.length === 0) return [];
  const rand = seededRandom(seed);
  const count = Math.max(SV.minCustomers, Math.min(SV.maxCustomers, SV.baseCustomers + Math.floor(opts.reputation / SV.perReputation)));
  const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
  const out: Customer[] = [];
  let at = SV.firstArriveMs;
  for (let i = 0; i < count; i++) {
    if (i > 0) at += between(SV.gapMs[0], SV.gapMs[1]);
    out.push({
      id: `c${i}`,
      kind: Math.floor(rand() * 4) as Customer["kind"],
      arriveMs: at,
      dish: opts.menu[Math.floor(rand() * opts.menu.length)],
      patienceMs: between(SV.patienceMs[0], SV.patienceMs[1]),
      seat: i % SV.seats,
    });
  }
  return out;
}
