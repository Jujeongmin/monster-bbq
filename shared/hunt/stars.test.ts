import { describe, expect, it } from "vitest";
import { starsOf, takeYield } from "./stars";

describe("stars: how a monster was taken is what it gives (hunt v3 design 4.2)", () => {
  it("gives one star for a knock-down, two for a capture, three for sleep or the net", () => {
    expect([starsOf("down"), starsOf("capture"), starsOf("sleep"), starsOf("net")]).toEqual([1, 2, 3, 3]);
  });
  it("turns stars into parts: 1 regular, 2 regular, 2 premium; the boss twice that", () => {
    expect(takeYield("down", false)).toEqual({ count: 1, grade: "normal" });
    expect(takeYield("capture", false)).toEqual({ count: 2, grade: "normal" });
    expect(takeYield("sleep", false)).toEqual({ count: 2, grade: "premium" });
    expect(takeYield("net", true)).toEqual({ count: 4, grade: "premium" });
  });
});
