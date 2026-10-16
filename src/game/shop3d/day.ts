import { BALANCE } from "../../../shared/balance";
import type { StringKey } from "../../i18n";
import { LAYOUT } from "../service/shift";

// The shop by day (user, 2026-10-16: like Dave, walk the shop and choose to go out, not a button): the night
// room in daylight, the grandchild walking the aisle behind the counter. Two spots: the door at the aisle's
// left end (out to the hunt in the morning and at lunch) and Bandal at the pass (the lunchbox at lunch, the
// kitchen in the evening). x is in the rules' 960-wide game pixels, like the night.

export type DayScene = "prep" | "lunch" | "kitchen";
export type SpotId = "door" | "bandal";
export interface Spot {
  id: SpotId;
  x: number;
  open: boolean;
  label: StringKey; // what the action key does there (or, closed, why not)
}

const DOOR_X = LAYOUT.aisle[0] + 15;
export const DAY_START = 480; // the grandchild starts the day mid-counter
const REACH = 40;

export function daySpots(scene: DayScene): Spot[] {
  return [
    { id: "door", x: DOOR_X, open: scene !== "kitchen", label: scene === "prep" ? "day.door.hunt" : scene === "lunch" ? "day.door.afternoon" : "day.door.night" },
    { id: "bandal", x: LAYOUT.pass, open: scene !== "prep", label: scene === "prep" ? "day.bandal.morning" : scene === "lunch" ? "day.bandal.lunch" : "day.bandal.kitchen" },
  ];
}

// The spot the grandchild stands at (the nearest within reach), open or not: a closed one says why.
export function nearSpot(x: number, spots: Spot[]): Spot | null {
  let best: Spot | null = null;
  for (const s of spots) if (Math.abs(s.x - x) <= REACH && (!best || Math.abs(s.x - x) < Math.abs(best.x - x))) best = s;
  return best;
}

// One step along the aisle at the night's walking pace (no tray by day).
export function walk(x: number, move: { x: number; run: boolean }, dtMs: number): number {
  const w = BALANCE.service.walk;
  const v = w.speed * (move.run ? w.runMul : 1);
  return Math.max(LAYOUT.aisle[0], Math.min(LAYOUT.aisle[1], x + (move.x * v * dtMs) / 1000));
}
