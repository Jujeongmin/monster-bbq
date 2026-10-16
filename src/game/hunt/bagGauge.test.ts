import { describe, expect, it } from "vitest";
import { bagLevel } from "./bagGauge";

describe("the bag gauge in the hunt HUD", () => {
  it("is calm, then heavy from four fifths, then full (Dave's weight warning)", () => {
    expect(bagLevel(0, 12)).toEqual({ fill: 0, state: "ok" });
    expect(bagLevel(9, 12)).toEqual({ fill: 0.75, state: "ok" });
    expect(bagLevel(10, 12).state).toBe("heavy");
    expect(bagLevel(12, 12)).toEqual({ fill: 1, state: "full" });
    expect(bagLevel(14, 12)).toEqual({ fill: 1, state: "full" }); // materials can overshoot by one slot
  });
});
