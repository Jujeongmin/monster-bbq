import { describe, expect, it } from "vitest";
import { isPortraitTouch } from "./portrait";

describe("a phone held upright (mobile pass, user 2026-10-21)", () => {
  it("asks to turn a touch screen taller than wide", () => {
    expect(isPortraitTouch(390, 844, true)).toBe(true);
    expect(isPortraitTouch(844, 390, true)).toBe(false);
  });
  it("leaves a mouse-driven window alone whatever its shape", () => {
    expect(isPortraitTouch(600, 900, false)).toBe(false);
  });
});
