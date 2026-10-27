import { describe, expect, it } from "vitest";
import { newSave } from "../../shared/save";
import { dayGoal, huntGoal, huntStep, kitchenGuide, tutHave, nightGoal, nightGoalKey } from "./tutorial";

const day1 = { ...newSave(), story: ["prologue" as const] };

describe("the first day's goal line (tutorial A, user 2026-10-20)", () => {
  it("sends the grandchild out of the door on the first morning, the arrow on the door", () => {
    expect(dayGoal(day1, "hunt", { lunchVisited: false })).toEqual({ goal: "goal.door", point: "door", tip: "tutDoor" });
  });
  it("asks for the lunchbox at Bandal, then the afternoon at the door", () => {
    expect(dayGoal(day1, "lunch", { lunchVisited: false })).toEqual({ goal: "goal.lunch", point: "bandal", tip: "tutLunch" });
    expect(dayGoal(day1, "lunch", { lunchVisited: true })).toEqual({ goal: "goal.afternoon", point: "door", tip: null });
  });
  it("sends the grandchild to Bandal's kitchen in the evening, and to the guests at night", () => {
    expect(dayGoal(day1, "kitchen", { lunchVisited: true })).toEqual({ goal: "goal.kitchen", point: "bandal", tip: "tutKitchen" });
    expect(dayGoal(day1, "service", { lunchVisited: true })).toEqual({ goal: "goal.serve", point: null, tip: null });
  });
  it("is gone from the second day, before the prologue, and during a hunt (the hunt has its own)", () => {
    expect(dayGoal({ ...day1, day: 2 }, "hunt", { lunchVisited: false })).toBeNull();
    expect(dayGoal({ ...day1, story: [] }, "hunt", { lunchVisited: false })).toBeNull();
    expect(dayGoal({ ...day1, hunt: { id: "h", seed: 1, startedAt: 0, zone: "forest", period: "morning", side: "sling" } }, "hunt", { lunchVisited: false })).toBeNull();
    expect(dayGoal(day1, "settle", { lunchVisited: false })).toBeNull();
  });
});

describe("the first hunt's controls, one at a time", () => {
  const none = {};
  it("goes move, the sling on the rabbit, catching it with the harpoon, slash, gather, then the lunch's makings, then back to the cart", () => {
    expect(huntStep(new Set(), none, false)).toBe("move");
    expect(huntStep(new Set(["move"]), none, false)).toBe("sling");
    expect(huntStep(new Set(["move", "sling"]), none, false)).toBe("capture");
    expect(huntStep(new Set(["move", "sling", "capture"]), none, false)).toBe("slash");
    expect(huntStep(new Set(["move", "sling", "capture", "slash"]), none, false)).toBe("gather");
    expect(huntStep(new Set(["move", "sling", "capture", "slash", "gather"]), none, false)).toBe("recipe");
  });
  it("sends them home only once the bag holds two chicken breasts and two perilla (any grade)", () => {
    const all = new Set(["move", "sling", "capture", "slash", "gather"]);
    expect(huntStep(all, { "chicken_breast:normal": 1, "perilla:normal": 2, "rabbit_leg:normal": 4 }, false)).toBe("recipe");
    expect(huntStep(all, { "chicken_breast:normal": 1, "chicken_breast:premium": 1, perilla: 2 }, false)).toBe("cart");
  });
  it("counts a step done out of order, and sends them home when the bag is full whatever is left", () => {
    expect(huntStep(new Set(["slash", "move"]), none, false)).toBe("sling");
    expect(huntStep(new Set(["move"]), none, true)).toBe("cart");
  });
  it("counts what the bag holds of the lunch's makings", () => {
    expect(tutHave({ "chicken_breast:normal": 1, "chicken_breast:premium": 2, "perilla:normal": 1, "chicken_thigh:normal": 3 })).toEqual([3, 1]);
  });
  it("words each step for the keyboard or the touch screen, with the lid's line at the start, at the makings and at the cart", () => {
    expect(huntGoal("move", false)).toEqual({ goal: "goal.move", tip: "tutHunt" });
    expect(huntGoal("sling", true)).toEqual({ goal: "goal.slingTouch", tip: "tutHunt" });
    expect(huntGoal("capture", true)).toEqual({ goal: "goal.captureTouch", tip: null });
    expect(huntGoal("gather", false)).toEqual({ goal: "goal.gather", tip: null });
    expect(huntGoal("recipe", false, [1, 0])).toEqual({ goal: "goal.recipe", tip: "tutRecipe", vars: { a: 1, b: 0 } });
    expect(huntGoal("cart", false)).toEqual({ goal: "goal.cart", tip: "tutCart" });
  });
});

describe("the first evening's kitchen, one arrow at a time", () => {
  it("points at the menu board's bookmark, then a dish to put on, then the red open button", () => {
    expect(kitchenGuide("cookbook", 0, false)).toBe("menuTab");
    expect(kitchenGuide("menu", 0, false)).toBe("dish");
    expect(kitchenGuide("menu", 1, true)).toBe("open");
    // a dish on the board shows the open button from any tab
    expect(kitchenGuide("upgrade", 1, true)).toBe("open");
  });
  it("points nowhere when nothing can be put on (no dish made yet)", () => {
    expect(kitchenGuide("menu", 0, false, false)).toBeNull();
  });
});

describe("the first night's goal line, one system at a time (user 2026-10-27)", () => {
  const idle = { pouring: false, carryingDish: false, dishReady: false, dirty: false, coalLow: false, teaWanted: false, cooking: false };
  it("waits for guests, then for the grill, then sends to the pass and to the guest", () => {
    expect(nightGoal(idle)).toBe("guests");
    expect(nightGoal({ ...idle, cooking: true })).toBe("wait");
    expect(nightGoal({ ...idle, cooking: true, dishReady: true })).toBe("take");
    expect(nightGoal({ ...idle, dishReady: true, carryingDish: true })).toBe("serve");
  });
  it("puts a pour under way first, and the chores before the tea", () => {
    expect(nightGoal({ ...idle, pouring: true, carryingDish: true })).toBe("pour");
    expect(nightGoal({ ...idle, dirty: true, coalLow: true, teaWanted: true })).toBe("scrub");
    expect(nightGoal({ ...idle, coalLow: true, teaWanted: true })).toBe("coal");
    expect(nightGoal({ ...idle, teaWanted: true, cooking: true })).toBe("tea");
  });
  it("words the key for the keyboard or the touch screen where a key is pressed", () => {
    expect(nightGoalKey("take", false)).toBe("goal.night.take");
    expect(nightGoalKey("take", true)).toBe("goal.night.takeTouch");
    expect(nightGoalKey("coal", true)).toBe("goal.night.coal");
  });
});
