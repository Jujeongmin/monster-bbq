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
