import { describe, expect, it } from "vitest";
import { floatStick, joystickVector, padLayout } from "./joystick";

const base = { x: 50, y: 150 };

describe("joystickVector", () => {
  it("is still inside the dead zone", () => {
    expect(joystickVector(base, { x: 53, y: 151 }, 30, 0.2)).toEqual({ x: 0, y: 0 });
  });
  it("is a full push at the rim, pointing where the thumb is", () => {
    expect(joystickVector(base, { x: 80, y: 150 }, 30, 0.2)).toEqual({ x: 1, y: 0 });
  });
  it("caps at a full push when the thumb slides past the rim", () => {
    const v = joystickVector(base, { x: 50, y: 50 }, 30, 0.2);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(-1);
  });
  it("is a partial push between the dead zone and the rim", () => {
    const v = joystickVector(base, { x: 65, y: 150 }, 30, 0.2);
    expect(v.x).toBeCloseTo(0.5);
    expect(v.y).toBeCloseTo(0);
  });
});

describe("padLayout", () => {
  it("puts the normal pad where the art was approved (640x360)", () => {
    const p = padLayout(1, 640, 360);
    expect(p.stick).toEqual({ x: 77, y: 281, radius: 36 });
    expect(p.slash).toEqual({ x: 578, y: 298, radius: 40 });
    expect(p.harpoon).toEqual({ x: 492, y: 312, radius: 40 });
    expect(p.side).toEqual({ x: 494, y: 228, radius: 40 });
    expect(p.use).toEqual({ x: 412, y: 318, radius: 34 });
  });
  it("keeps every piece on the screen and apart at every size", () => {
    for (const s of [0.75, 1, 1.25]) {
      const p = padLayout(s, 640, 360);
      const pieces = [p.slash, p.harpoon, p.side, p.use];
      for (const b of pieces) {
        expect(b.x - b.radius).toBeGreaterThanOrEqual(0);
        expect(b.x + b.radius).toBeLessThanOrEqual(640);
        expect(b.y + b.radius).toBeLessThanOrEqual(360);
      }
      for (const a of pieces) for (const b of pieces) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radius + b.radius);
      // clear of the lunchbox column (x from 580, down to y 203)
      for (const b of pieces) expect(b.x + b.radius <= 580 || b.y - b.radius > 203).toBe(true);
    }
  });
});

describe("floatStick", () => {
  it("appears under the thumb", () => {
    expect(floatStick({ x: 150, y: 250 }, 48, 640, 360, 90)).toEqual({ x: 150, y: 250 });
  });
  it("is pulled in at the edges and below the HUD", () => {
    expect(floatStick({ x: 5, y: 358 }, 48, 640, 360, 90)).toEqual({ x: 48, y: 312 });
    expect(floatStick({ x: 100, y: 20 }, 48, 640, 360, 90)).toEqual({ x: 100, y: 138 });
  });
});
