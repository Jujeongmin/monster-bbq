import { describe, expect, it } from "vitest";
import { LAYOUT } from "../service/shift";
import { cameraX, COUNTER, displayScale, HUNTER_FEET, leanZ, PASS, snap, toWorldX, Z } from "./layout";

describe("the 3D shop's room", () => {
  it("maps the 960-wide shop rules onto the 480-unit room", () => {
    expect([toWorldX(0), toWorldX(480), toWorldX(960)]).toEqual([-240, 0, 240]);
  });
  it("snaps positions to half units so no pixel straddles two screen pixels", () => {
    expect([snap(1.2), snap(1.26), snap(-0.74)]).toEqual([1, 1.5, -0.5]);
  });
  it("follows the grandchild gently and never more than 25 units", () => {
    expect(cameraX(0, 200, 10)).toBe(25);
    const a = cameraX(0, 20, 0.05);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(20);
  });
  it("shows the 960x540 picture at a whole scale, shrinking only when it does not fit", () => {
    expect(displayScale(1280, 720)).toBe(1);
    expect(displayScale(1920, 1080)).toBe(2);
    expect(displayScale(1366, 768)).toBe(1);
    expect(displayScale(900, 600)).toBeCloseTo(900 / 960);
  });
  it("keeps the grandchild whole in front of the pass and Bandal's waist behind it", () => {
    // his picture, leaning back from his feet, is still in front of the pass's front at the pass's top
    expect(leanZ(Z.waiter, PASS.h + HUNTER_FEET)).toBeGreaterThan(Z.pass + PASS.d / 2);
    // Bandal stands behind the pass's back
    expect(Z.bandal).toBeLessThan(Z.pass - PASS.d / 2);
  });
  it("stands the drink cart and charcoal box between the grandchild and the counter, never on his depth", () => {
    expect(Z.station).toBeGreaterThan(Z.waiter);
    expect(Z.station).toBeLessThan(Z.counter - COUNTER.d / 2);
  });
  it("ends the counter before the drink cart (40 wide) so the cart is not cut off", () => {
    expect(COUNTER.x1).toBeLessThan(toWorldX(LAYOUT.drinkCart) - 20);
  });
});
