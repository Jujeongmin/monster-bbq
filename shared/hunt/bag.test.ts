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
