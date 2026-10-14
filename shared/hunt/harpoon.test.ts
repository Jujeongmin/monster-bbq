import { describe, expect, it } from "vitest";
import { fireHarpoon, harpoonDone, harpoonHit, reelStep, stepHarpoon } from "./harpoon";

const field = { minX: 0, maxX: 1000, minY: 100, maxY: 220 };

describe("fireHarpoon / stepHarpoon", () => {
  it("flies from the hand straight toward the aim point", () => {
    const h = stepHarpoon(fireHarpoon({ x: 100, y: 150 }, { x: 100, y: 50 }), 300, 100);
    expect(h.tip.x).toBeCloseTo(100);
    expect(h.tip.y).toBeCloseTo(120);
    expect(h.traveled).toBeCloseTo(30);
  });
  it("goes straight ahead when aimed at the hand itself", () => {
    const h = stepHarpoon(fireHarpoon({ x: 100, y: 150 }, { x: 100, y: 150 }, -1), 300, 100);
    expect(h.tip).toEqual({ x: 70, y: 150 });
  });
  it("is spent once it has flown its range", () => {
    let h = fireHarpoon({ x: 0, y: 150 }, { x: 10, y: 150 });
    h = stepHarpoon(h, 300, 400);
    expect(harpoonDone(h, 150)).toBe(false);
    h = stepHarpoon(h, 300, 200);
    expect(harpoonDone(h, 150)).toBe(true);
  });
});

describe("harpoonHit", () => {
  // body centre = feet position lifted by bodyOffsetY
  const near = { id: "near", pos: { x: 200, y: 170 } };
  const far = { id: "far", pos: { x: 260, y: 170 } };
  it("hits the target whose body the tip touches", () => {
    expect(harpoonHit({ x: 205, y: 152 }, [far, near], 20, 16)?.id).toBe("near");
  });
  it("misses when the tip passes outside every body", () => {
    expect(harpoonHit({ x: 205, y: 110 }, [far, near], 20, 16)).toBeUndefined();
  });
});

describe("reelStep", () => {
  it("drags the target toward the hunter at the pull speed", () => {
    const r = reelStep({ x: 300, y: 170 }, { x: 100, y: 170 }, 200, 100, 22, field);
    expect(r.pos).toEqual({ x: 280, y: 170 });
    expect(r.done).toBe(false);
  });
  it("stops at the stop distance in front of the hunter", () => {
    const r = reelStep({ x: 130, y: 170 }, { x: 100, y: 170 }, 200, 100, 22, field);
    expect(r.pos.x).toBeCloseTo(122);
    expect(r.done).toBe(true);
  });
  it("brings the target onto the hunter's lane as it comes", () => {
    const r = reelStep({ x: 300, y: 200 }, { x: 100, y: 160 }, 2000, 1000, 22, field);
    expect(r.pos.y).toBeCloseTo(160);
    expect(r.done).toBe(true);
  });
});
