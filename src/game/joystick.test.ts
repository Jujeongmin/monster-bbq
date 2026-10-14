import { describe, expect, it } from "vitest";
import { joystickVector } from "./joystick";

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
