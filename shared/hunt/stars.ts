import { BALANCE } from "../balance";
import { itemKey, ITEMS, type ItemId } from "../content/items";

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

// The bag lines one take brings: the dropped item by stars (count, grade); a deep-floor material has no
// grade and comes as one whatever the stars (it is not meat).
export function takeParts(drop: ItemId, how: TakeHow, boss: boolean): { key: string; count: number } {
  if (ITEMS[drop].kind === "material") return { key: itemKey(drop), count: 1 };
  const y = takeYield(how, boss);
  return { key: itemKey(drop, y.grade), count: y.count };
}
