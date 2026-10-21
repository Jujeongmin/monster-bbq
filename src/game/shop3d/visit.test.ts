import { describe, expect, it } from "vitest";
import { BALANCE } from "../../../shared/balance";
import { LAYOUT } from "../service/shift";
import { VISIT_DOOR_X, visitOrder, visitSlots, walkIn } from "./visit";

describe("old friends coming to the shop (postcard reveal A, user 2026-10-21)", () => {
  it("lets the rarer ones in last, the best at the end", () => {
    const order = visitOrder([
      { id: "baekdu", isNew: true, shards: 0 },
      { id: "park", isNew: false, shards: 1 },
      { id: "hongmae", isNew: true, shards: 0 },
    ]);
    expect(order.map((v) => v.id)).toEqual(["park", "hongmae", "baekdu"]);
  });
  it("gives each a place along the aisle, apart, clear of the grandchild", () => {
    for (const boy of [120, 480, 900]) {
      const xs = visitSlots(10, boy);
      expect(xs).toHaveLength(10);
      expect(new Set(xs).size).toBe(10);
      for (const x of xs) {
        expect(Math.abs(x - boy)).toBeGreaterThanOrEqual(40);
        expect(x).toBeGreaterThanOrEqual(LAYOUT.aisle[0]);
        expect(x).toBeLessThanOrEqual(LAYOUT.aisle[1]);
      }
    }
  });
  it("walks in from the door at the night's pace and stops at the place", () => {
    expect(walkIn(500, 0)).toEqual({ x: VISIT_DOOR_X, arrived: false });
    const half = walkIn(500, 500);
    expect(half.x).toBeCloseTo(VISIT_DOOR_X + BALANCE.service.walk.speed * 0.5);
    expect(walkIn(500, 60_000)).toEqual({ x: 500, arrived: true });
  });
});
