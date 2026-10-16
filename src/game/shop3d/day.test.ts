import { describe, expect, it } from "vitest";
import { BALANCE } from "../../../shared/balance";
import { LAYOUT } from "../service/shift";
import { daySpots, nearSpot, walk, DAY_START } from "./day";

describe("the shop by day", () => {
  it("lets the grandchild out by the door in the morning and at lunch, and to Bandal's kitchen at lunch and in the evening", () => {
    const at = (s: "prep" | "lunch" | "kitchen") => Object.fromEntries(daySpots(s).map((p) => [p.id, p.open]));
    expect(at("prep")).toEqual({ door: true, bandal: false });
    expect(at("lunch")).toEqual({ door: true, bandal: true });
    expect(at("kitchen")).toEqual({ door: false, bandal: true });
    expect(daySpots("prep").find((p) => p.id === "door")!.label).toBe("day.door.hunt");
    expect(daySpots("lunch").find((p) => p.id === "door")!.label).toBe("day.door.afternoon");
    expect(daySpots("kitchen").find((p) => p.id === "bandal")!.label).toBe("day.bandal.kitchen");
  });
  it("finds the spot within reach, the nearest when two are", () => {
    const spots = daySpots("lunch");
    expect(nearSpot(LAYOUT.pass + 10, spots)?.id).toBe("bandal");
    expect(nearSpot(spots.find((p) => p.id === "door")!.x, spots)?.id).toBe("door");
    expect(nearSpot(480, spots)).toBeNull();
  });
  it("walks the aisle at the night's pace, faster on the run, never past its ends", () => {
    const sp = BALANCE.service.walk.speed;
    expect(walk(500, { x: 1, run: false }, 1000)).toBe(Math.min(LAYOUT.aisle[1], 500 + sp));
    expect(walk(500, { x: -1, run: true }, 100)).toBeCloseTo(500 - sp * BALANCE.service.walk.runMul * 0.1);
    expect(walk(LAYOUT.aisle[0], { x: -1, run: true }, 1000)).toBe(LAYOUT.aisle[0]);
    expect(DAY_START).toBeGreaterThan(LAYOUT.aisle[0]);
  });
});
