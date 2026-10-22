import { describe, expect, it } from "vitest";
import { LAYOUT } from "../service/shift";
import { cameraX, COUNTER, layerFit, HUNTER_FEET, leanZ, PASS, snap, toWorldX, Z } from "./layout";

describe("the 3D shop's room", () => {
  it("maps the 960-wide shop rules onto the 480-unit room", () => {
    expect([toWorldX(0), toWorldX(480), toWorldX(960)]).toEqual([-240, 0, 240]);
  });
  it("snaps positions to half units so no pixel straddles two screen pixels", () => {
    expect([snap(1.2), snap(1.26), snap(-0.74)]).toEqual([1, 1.5, -0.5]);
  });
  it("keeps the camera still: the 480-unit room exactly fills the view, so any pan shows past its ends", () => {
    expect(cameraX(0, 200, 10)).toBe(0);
    expect(cameraX(0, -200, 10)).toBe(0);
  });
  it("fills a 16:9 window with the 960x540 picture, as big as fits (user, 2026-10-21: no wide black border)", () => {
    expect(layerFit(1280, 720)).toEqual({ w: 960, scale: 1280 / 960 });
    expect(layerFit(1920, 1080)).toEqual({ w: 960, scale: 2 });
    expect(layerFit(900, 600).w).toBe(960);
    expect(layerFit(900, 600).scale).toBeCloseTo(900 / 960);
  });
  it("widens the picture for a longer phone, up to 19.5:9 (user, 2026-10-22: no black bars)", () => {
    expect(layerFit(844, 390)).toEqual({ w: 1168, scale: 390 / 540 });
    expect(layerFit(2000, 390).w).toBe(1170);
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
