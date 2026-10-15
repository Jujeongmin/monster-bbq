import { describe, expect, it } from "vitest";
import { addToBag, bagCount } from "./bag";

describe("bagCount", () => {
  it("adds up every stack", () => {
    expect(bagCount({ "boar_belly:premium": 2, shiitake: 3 })).toBe(5);
    expect(bagCount({})).toBe(0);
  });
});

describe("addToBag", () => {
  it("stacks an item while there is room", () => {
    expect(addToBag({ shiitake: 1 }, "shiitake", 3)).toEqual({ bag: { shiitake: 2 }, added: true });
    expect(addToBag({ shiitake: 1 }, "perilla", 3)).toEqual({ bag: { shiitake: 1, perilla: 1 }, added: true });
  });
  it("refuses when the bag is full and leaves it as it was", () => {
    const full = { shiitake: 2, perilla: 1 };
    expect(addToBag(full, "perilla", 3)).toEqual({ bag: full, added: false });
  });
});

describe("deep-floor materials weigh two slots (hunt v3 design 3)", () => {
  it("counts a material as two slots", () => {
    expect(bagCount({ frog_skin: 2, shiitake: 1 })).toBe(5);
  });
  it("fills a 12-slot bag with six materials", () => {
    let bag: Record<string, number> = {};
    for (let i = 0; i < 6; i++) bag = addToBag(bag, "iron_ore", 12).bag;
    expect(bagCount(bag)).toBe(12);
    expect(addToBag(bag, "iron_ore", 12).added).toBe(false);
  });
  it("takes a one-slot part into the last slot but not a two-slot material", () => {
    const eleven = { frog_skin: 5, shiitake: 1 };
    expect(addToBag(eleven, "frog_leg:normal", 12).added).toBe(true);
    expect(addToBag(eleven, "crab_shell", 12).added).toBe(false);
  });
});
