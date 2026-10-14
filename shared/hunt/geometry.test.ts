import { describe, expect, it } from "vitest";
import { clampToField, mirroredTileRects, moveByInput, pushOutOfRects, stepToward, unit } from "./geometry";

const field = { minX: 0, maxX: 100, minY: 50, maxY: 80 };

describe("clampToField", () => {
  it("keeps points that are already on the field", () => {
    expect(clampToField({ x: 10, y: 60 }, field)).toEqual({ x: 10, y: 60 });
  });
  it("pulls points past the edges back in", () => {
    expect(clampToField({ x: -9, y: 99 }, field)).toEqual({ x: 0, y: 80 });
    expect(clampToField({ x: 40, y: 5 }, field)).toEqual({ x: 40, y: 50 });
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

describe("unit", () => {
  it("scales a vector to length 1", () => {
    const u = unit({ x: 3, y: 4 });
    expect(u.x).toBeCloseTo(0.6);
    expect(u.y).toBeCloseTo(0.8);
  });
  it("falls back to the given direction for a zero vector", () => {
    expect(unit({ x: 0, y: 0 }, { x: -1, y: 0 })).toEqual({ x: -1, y: 0 });
  });
});

describe("moveByInput", () => {
  it("walks in the held direction at full speed", () => {
    expect(moveByInput({ x: 10, y: 60 }, { x: 1, y: 0 }, 80, 500, field, 1)).toEqual({ x: 50, y: 60 });
  });
  it("scales vertical speed by depthSpeedRatio", () => {
    expect(moveByInput({ x: 10, y: 60 }, { x: 0, y: 1 }, 80, 250, field, 0.6)).toEqual({ x: 10, y: 72 });
  });
  it("does not move faster diagonally than straight", () => {
    const p = moveByInput({ x: 10, y: 60 }, { x: 1, y: 1 }, 100, 100, field, 1);
    expect(Math.hypot(p.x - 10, p.y - 60)).toBeCloseTo(10);
  });
  it("keeps a half-pushed stick slower than a full push", () => {
    expect(moveByInput({ x: 10, y: 60 }, { x: 0.5, y: 0 }, 80, 500, field, 1)).toEqual({ x: 30, y: 60 });
  });
  it("stops at the edges of the field", () => {
    expect(moveByInput({ x: 98, y: 79 }, { x: 1, y: 1 }, 80, 1000, field, 1)).toEqual({ x: 100, y: 80 });
  });
});

describe("pushOutOfRects", () => {
  const tree = { x0: 40, x1: 60, y0: 40, y1: 80 };
  it("leaves a point clear of every rectangle alone", () => {
    expect(pushOutOfRects({ x: 70, y: 50 }, [tree], 4)).toEqual({ x: 70, y: 50 });
  });
  it("pushes a point out through the nearest side, keeping the radius clear", () => {
    expect(pushOutOfRects({ x: 58, y: 60 }, [tree], 4)).toEqual({ x: 64, y: 60 });
    expect(pushOutOfRects({ x: 50, y: 42 }, [tree], 4)).toEqual({ x: 50, y: 36 });
  });
  it("blocks a point that only touches the rectangle with its radius", () => {
    expect(pushOutOfRects({ x: 62, y: 60 }, [tree], 4)).toEqual({ x: 64, y: 60 });
  });
});

describe("mirroredTileRects", () => {
  it("repeats tile-local rectangles over the world, mirroring every other tile", () => {
    const rects = mirroredTileRects([{ x0: 0, x1: 10, y0: 0, y1: 20 }], 100, 200, 100);
    expect(rects).toEqual([
      { x0: 0, x1: 10, y0: 0, y1: 20 },
      { x0: 190, x1: 200, y0: 0, y1: 20 },
    ]);
  });
  it("mirrors vertically on odd rows", () => {
    const rects = mirroredTileRects([{ x0: 0, x1: 10, y0: 0, y1: 20 }], 100, 100, 200);
    expect(rects).toEqual([
      { x0: 0, x1: 10, y0: 0, y1: 20 },
      { x0: 0, x1: 10, y0: 180, y1: 200 },
    ]);
  });
});
