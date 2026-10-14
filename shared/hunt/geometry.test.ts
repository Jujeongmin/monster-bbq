import { describe, expect, it } from "vitest";
import { clampToField, frontmost, sameLane, stepToward } from "./geometry";

const field = { minX: 0, maxX: 100, minY: 50, maxY: 80 };

describe("clampToField", () => {
  it("keeps points that are already on the field", () => {
    expect(clampToField({ x: 10, y: 60 }, field)).toEqual({ x: 10, y: 60 });
  });
  it("pulls a tap in the sky down to the top edge of the field at the same x", () => {
    expect(clampToField({ x: 40, y: 5 }, field)).toEqual({ x: 40, y: 50 });
  });
  it("pulls points past the ends and the bottom back in", () => {
    expect(clampToField({ x: -9, y: 99 }, field)).toEqual({ x: 0, y: 80 });
  });
});

describe("sameLane", () => {
  it("is true when the vertical gap is within the tolerance", () => {
    expect(sameLane({ x: 0, y: 60 }, { x: 90, y: 68 }, 8)).toBe(true);
  });
  it("is false when the vertical gap is past the tolerance", () => {
    expect(sameLane({ x: 0, y: 60 }, { x: 0, y: 69 }, 8)).toBe(false);
  });
});

describe("stepToward", () => {
  it("moves at most maxDist along the straight line", () => {
    const r = stepToward({ x: 0, y: 0 }, { x: 30, y: 40 }, 10);
    expect(r.arrived).toBe(false);
    expect(r.pos.x).toBeCloseTo(6);
    expect(r.pos.y).toBeCloseTo(8);
  });
  it("lands exactly on the target when it is within reach", () => {
    expect(stepToward({ x: 0, y: 0 }, { x: 3, y: 4 }, 10)).toEqual({ pos: { x: 3, y: 4 }, arrived: true });
  });
});

describe("frontmost", () => {
  it("picks the item lowest on screen, which is drawn in front", () => {
    const back = { id: "back", pos: { x: 0, y: 55 } };
    const front = { id: "front", pos: { x: 5, y: 75 } };
    expect(frontmost([back, front])?.id).toBe("front");
  });
  it("returns undefined for an empty list", () => {
    expect(frontmost([])).toBeUndefined();
  });
});
