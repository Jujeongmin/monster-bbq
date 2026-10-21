import type { SaveData } from "../../shared/save";
import type { SpotId } from "../game/shop3d/day";
import type { StringKey } from "../i18n";
import type { Phase } from "./hud/hud";
import type { TipId } from "./tips";

// The first day's tutorial (A, user 2026-10-20, like Dave's first dive): one goal line under the date
// saying what to do now, an arrow over where to go, and the lid's one line the first time. Only on day 1,
// after the prologue; gone from the second day. The first hunt teaches its controls one at a time.

export interface DayGoal {
  goal: StringKey;
  point: SpotId | null;
  tip: TipId | null;
}

export function dayGoal(save: Pick<SaveData, "day" | "story" | "hunt">, phase: Phase, ctx: { lunchVisited: boolean }): DayGoal | null {
  if (save.day !== 1 || !save.story.includes("prologue") || save.hunt) return null;
  switch (phase) {
    case "hunt":
      return { goal: "goal.door", point: "door", tip: "tutDoor" };
    case "lunch":
      return ctx.lunchVisited ? { goal: "goal.afternoon", point: "door", tip: null } : { goal: "goal.lunch", point: "bandal", tip: "tutLunch" };
    case "kitchen":
      return { goal: "goal.kitchen", point: "bandal", tip: "tutKitchen" };
    case "service":
      return { goal: "goal.serve", point: null, tip: null };
    default:
      return null;
  }
}

export const HUNT_STEPS = ["move", "harpoon", "slash", "gather"] as const;
export type HuntStep = (typeof HUNT_STEPS)[number] | "cart";
// the bag this full sends them home whatever is left to learn (nothing to gather nearby, say); six makes
// the first night more than three plates (balance check 2026-10-21)
const ENOUGH = 6;

// The first not yet done (a later one done early counts), then the cart.
export function huntStep(done: ReadonlySet<string>, bag: number): HuntStep {
  if (bag >= ENOUGH) return "cart";
  return HUNT_STEPS.find((s) => !done.has(s)) ?? "cart";
}

export function huntGoal(step: HuntStep, touch: boolean): { goal: StringKey; tip: TipId | null } {
  const tip: TipId | null = step === "move" || step === "harpoon" ? "tutHunt" : step === "cart" ? "tutCart" : null;
  const goal = step === "cart" ? "goal.cart" : `goal.${step}${touch ? "Touch" : ""}`;
  return { goal: goal as StringKey, tip };
}
