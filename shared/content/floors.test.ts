import { describe, expect, it } from "vitest";
import { FLOORS, isFloorId, nearestExit } from "./floors";

describe("FLOORS", () => {
  it("has floors 1 to 5 (the boss's den at the bottom)", () => {
    expect(Object.keys(FLOORS)).toEqual(["1", "2", "3", "4", "5"]);
    expect([isFloorId(1), isFloorId(5), isFloorId(6), isFloorId("1")]).toEqual([true, true, false, false]);
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
  it("leads down from floors 1 to 4, and the den (5) is the deepest", () => {
    expect([FLOORS[1].down, FLOORS[2].down, FLOORS[3].down, FLOORS[4].down].every((d) => d !== null)).toBe(true);
    expect(FLOORS[5].down).toBeNull();
  });
  it("finds the nearest exit of a floor", () => {
    const e = FLOORS[1].exits[1];
    expect(nearestExit({ x: e.x + 3, y: e.y - 2 }, 1).id).toBe(e.id);
  });
});
