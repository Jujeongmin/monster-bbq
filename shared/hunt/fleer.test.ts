import { describe, expect, it } from "vitest";
import { fleerHit, isFleerVulnerable, newFleer, updateFleer, type FleerTuning } from "./fleer";

const field = { minX: 0, maxX: 1000, minY: 0, maxY: 800 };
const t: FleerTuning = { wanderSpeed: 20, fleeSpeed: 110, fleeRange: 90, fleeMs: 1200, restMs: 1500 };
const half = () => 0.5;

describe("fleer (horned rabbit)", () => {
  it("bolts away once the hunter comes close", () => {
    const s = updateFleer(newFleer({ x: 300, y: 300 }), { x: 250, y: 300 }, 16, t, field, half);
    expect(s.phase).toBe("flee");
  });
  it("runs directly away from the hunter at flee speed", () => {
    const s = updateFleer({ ...newFleer({ x: 300, y: 300 }), phase: "flee" }, { x: 250, y: 300 }, 100, t, field, half);
    expect(s.pos.x).toBeCloseTo(311);
    expect(s.pos.y).toBeCloseTo(300);
  });
  it("stops to rest after fleeing for a while, and only then is easy to catch", () => {
    const fleeing = { ...newFleer({ x: 300, y: 300 }), phase: "flee" as const, phaseMs: 1150 };
    expect(isFleerVulnerable(fleeing)).toBe(false);
    const resting = updateFleer(fleeing, { x: 900, y: 700 }, 100, t, field, half);
    expect(resting.phase).toBe("rest");
    expect(isFleerVulnerable(resting)).toBe(true);
  });
  it("keeps resting even if the hunter walks up, then goes back to wandering", () => {
    const resting = { ...newFleer({ x: 300, y: 300 }), phase: "rest" as const, phaseMs: 100 };
    expect(updateFleer(resting, { x: 290, y: 300 }, 100, t, field, half).phase).toBe("rest");
    expect(updateFleer({ ...resting, phaseMs: 1450 }, { x: 900, y: 700 }, 100, t, field, half).phase).toBe("wander");
  });
  it("flees at once when hit, even while resting", () => {
    expect(fleerHit({ ...newFleer({ x: 300, y: 300 }), phase: "rest", phaseMs: 400 }).phase).toBe("flee");
  });
  it("never leaves the hunting ground", () => {
    const s = updateFleer({ ...newFleer({ x: 990, y: 300 }), phase: "flee" }, { x: 900, y: 300 }, 10_000, t, field, half);
    expect(s.pos.x).toBeLessThanOrEqual(field.maxX);
  });
});
