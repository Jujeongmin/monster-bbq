import type { ItemId } from "../../shared/content/items";
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

// move, then the rabbit waiting by the cart: the sling wears it down, the harpoon catches it once it is weak
// (user 2026-10-27), then the slash and picking greens
export const HUNT_STEPS = ["move", "sling", "capture", "slash", "gather"] as const;
export type HuntStep = (typeof HUNT_STEPS)[number] | "recipe" | "cart";
// the first lunch came with nothing to pack (user, 2026-10-21): after the controls the first hunt asks for
// the makings of the one dish known, chicken breast and perilla, two each (the lunchbox and the first night)
export const TUT_NEED: readonly (readonly [ItemId, number])[] = [
  ["chicken_breast", 2],
  ["perilla", 2],
];

// what the hunt tells the page: the step due now and the makings in the bag
export interface HuntTut {
  step: HuntStep;
  have: number[];
}

// How many of each of TUT_NEED the bag holds, any grade.
export function tutHave(bag: Record<string, number>): number[] {
  return TUT_NEED.map(([id]) => Object.entries(bag).reduce((a, [k, n]) => a + (k.split(":")[0] === id ? n : 0), 0));
}

// The first not yet done (a later one done early counts), then the makings, then the cart; a full bag
// sends them home whatever is left.
export function huntStep(done: ReadonlySet<string>, bag: Record<string, number>, full: boolean): HuntStep {
  if (full) return "cart";
  const left = HUNT_STEPS.find((s) => !done.has(s));
  if (left) return left;
  const have = tutHave(bag);
  return TUT_NEED.every(([, n], i) => have[i] >= n) ? "cart" : "recipe";
}

export function huntGoal(step: HuntStep, touch: boolean, have: number[] = []): { goal: StringKey; tip: TipId | null; vars?: Record<string, number> } {
  if (step === "recipe") return { goal: "goal.recipe", tip: "tutRecipe", vars: { a: have[0] ?? 0, b: have[1] ?? 0 } };
  const tip: TipId | null = step === "move" || step === "sling" ? "tutHunt" : step === "cart" ? "tutCart" : null;
  const goal = step === "cart" ? "goal.cart" : `goal.${step}${touch ? "Touch" : ""}`;
  return { goal: goal as StringKey, tip };
}

// The first evening inside Bandal's kitchen (balance check 2026-10-21: the goal stopped at the door of
// the kitchen): an arrow on the menu board's bookmark, then on a dish to put on the board, then on the red
// button that opens the shop. `canPut`: some dish can still go on (else no arrow: nothing to do there).
export type KitchenGuide = "menuTab" | "dish" | "open";
export function kitchenGuide(tab: string, onBoard: number, canOpen: boolean, canPut = true): KitchenGuide | null {
  if (onBoard > 0 && canOpen) return "open";
  if (!canPut) return null;
  return tab === "menu" ? "dish" : "menuTab";
}

// The first night's goal line (user 2026-10-27: the night's systems one at a time): what to do now, from
// what is going on at the counter, the most pressing first: a pour under way, a plate in hand, a plate
// ready on the pass, leftovers to scrub, charcoal running low, tea wanted, an order cooking, else guests
// to wait for.
export type NightGoal = "pour" | "serve" | "take" | "scrub" | "coal" | "tea" | "wait" | "guests";
export interface NightState {
  pouring: boolean;
  carryingDish: boolean;
  dishReady: boolean;
  dirty: boolean;
  coalLow: boolean;
  teaWanted: boolean;
  cooking: boolean;
}
export function nightGoal(n: NightState): NightGoal {
  if (n.pouring) return "pour";
  if (n.carryingDish) return "serve";
  if (n.dishReady) return "take";
  if (n.dirty) return "scrub";
  if (n.coalLow) return "coal";
  if (n.teaWanted) return "tea";
  return n.cooking ? "wait" : "guests";
}
export const nightGoalKey = (g: NightGoal, touch: boolean): StringKey => `goal.night.${g}${touch && (g === "pour" || g === "take" || g === "serve") ? "Touch" : ""}` as StringKey;
