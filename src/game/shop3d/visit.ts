import { BALANCE } from "../../../shared/balance";
import { RARITIES, STAFF, type StaffId } from "../../../shared/content/staff";
import { LAYOUT } from "../service/shift";

// Old friends coming to the shop for the postcards (postcard reveal A, user 2026-10-21): the notebook shuts
// and they walk in one by one through the shop's door at the aisle's left end, each to a place along the
// aisle, the best last; once all stand there in a row, that row is the summary. x in the rules' 960-wide
// game pixels, like the day shop.
export interface Visitor {
  id: StaffId;
  isNew: boolean;
  shards: number;
}

export const VISIT_DOOR_X = LAYOUT.aisle[0];
const FIRST = 190; // the first place, a little in from the door
const CLEAR = 40; // kept clear either side of the grandchild

// The rarer ones last (a stable sort, so equals keep the order they came in).
export function visitOrder(visitors: Visitor[]): Visitor[] {
  return [...visitors].sort((a, b) => RARITIES.indexOf(STAFF[a.id].rarity) - RARITIES.indexOf(STAFF[b.id].rarity));
}

// n places along the aisle from the door end, as far apart as fits, none beside the grandchild.
export function visitSlots(n: number, boyX: number): number[] {
  const end = LAYOUT.aisle[1] - 20;
  for (let gap = 72; gap >= 24; gap -= 8) {
    const xs: number[] = [];
    for (let x = FIRST; x <= end && xs.length < n; x += gap) if (Math.abs(x - boyX) >= CLEAR) xs.push(x);
    if (xs.length === n) return xs;
  }
  return Array.from({ length: n }, (_, i) => Math.round(FIRST + ((end - FIRST) * i) / Math.max(1, n - 1)));
}

// Where one walking in from the door is `ms` after setting off toward `to`, at the night's walking pace.
export function walkIn(to: number, ms: number): { x: number; arrived: boolean } {
  const x = VISIT_DOOR_X + (BALANCE.service.walk.speed * ms) / 1000;
  return x >= to ? { x: to, arrived: true } : { x, arrived: false };
}
