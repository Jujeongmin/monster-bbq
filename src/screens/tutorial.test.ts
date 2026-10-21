import { describe, expect, it } from "vitest";
import { newSave } from "../../shared/save";
import { dayGoal, huntGoal, huntStep } from "./tutorial";

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
  it("goes move, harpoon, slash, gather, then back to the cart", () => {
    expect(huntStep(new Set(), 0)).toBe("move");
    expect(huntStep(new Set(["move"]), 0)).toBe("harpoon");
    expect(huntStep(new Set(["move", "harpoon"]), 0)).toBe("slash");
    expect(huntStep(new Set(["move", "harpoon", "slash"]), 0)).toBe("gather");
    expect(huntStep(new Set(["move", "harpoon", "slash", "gather"]), 0)).toBe("cart");
  });
  it("counts a step done out of order, and sends them home once the bag holds six", () => {
    expect(huntStep(new Set(["slash", "move"]), 0)).toBe("harpoon");
    expect(huntStep(new Set(["move"]), 5)).toBe("harpoon");
    expect(huntStep(new Set(["move"]), 6)).toBe("cart");
  });
  it("words each step for the keyboard or the touch screen, with the lid's line at the start and at the cart", () => {
    expect(huntGoal("move", false)).toEqual({ goal: "goal.move", tip: "tutHunt" });
    expect(huntGoal("harpoon", true)).toEqual({ goal: "goal.harpoonTouch", tip: "tutHunt" });
    expect(huntGoal("gather", false)).toEqual({ goal: "goal.gather", tip: null });
    expect(huntGoal("cart", false)).toEqual({ goal: "goal.cart", tip: "tutCart" });
  });
});
