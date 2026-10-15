import { describe, expect, it } from "vitest";
import { FLOORS, isFloorId, nearestExit } from "./floors";

describe("FLOORS", () => {
  it("has floors 1 and 2 only in stage 1", () => {
    expect(Object.keys(FLOORS)).toEqual(["1", "2"]);
    expect([isFloorId(1), isFloorId(2), isFloorId(3), isFloorId("1")]).toEqual([true, true, false, false]);
  });
  it("keeps the start, every exit and the way down inside the walkable field", () => {
    for (const f of Object.values(FLOORS)) {
      for (const p of [f.start, ...f.exits, ...(f.down ? [f.down] : [])]) {
        expect(p.x).toBeGreaterThanOrEqual(f.field.minX);
        expect(p.x).toBeLessThanOrEqual(f.field.maxX);
        expect(p.y).toBeGreaterThanOrEqual(f.field.minY);
        expect(p.y).toBeLessThanOrEqual(f.field.maxY);
      }
    }
  });
  it("gives every exit an id that names its floor, and fewer exits further down", () => {
    expect(FLOORS[1].exits.map((e) => e.id)).toEqual(["1-e0", "1-e1", "1-e2"]);
    expect(FLOORS[2].exits.map((e) => e.id)).toEqual(["2-e0", "2-e1"]);
  });
  it("drains stamina faster on the deeper floor", () => {
    expect(FLOORS[2].drainPerSec).toBeGreaterThan(FLOORS[1].drainPerSec);
  });
  it("leads down from floor 1 only (floor 3 needs the boots, stage 3)", () => {
    expect(FLOORS[1].down).not.toBeNull();
    expect(FLOORS[2].down).toBeNull();
  });
  it("finds the nearest exit of a floor", () => {
    const e = FLOORS[1].exits[1];
    expect(nearestExit({ x: e.x + 3, y: e.y - 2 }, 1).id).toBe(e.id);
  });
});
