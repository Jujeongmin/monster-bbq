import { describe, expect, it } from "vitest";
import { canUse3D, moveFrom } from "./input";

describe("the 3D shop's controls", () => {
  it("walks with the keys and the stick together, running on Shift or a stick pushed to the edge", () => {
    expect(moveFrom({ left: false, right: true, run: false }, 0.5)).toEqual({ x: 1, run: false });
    expect(moveFrom({ left: true, right: false, run: false }, 0)).toEqual({ x: -1, run: false });
    expect(moveFrom({ left: false, right: false, run: false }, -0.95)).toEqual({ x: -0.95, run: true });
    expect(moveFrom({ left: false, right: true, run: true }, 0)).toEqual({ x: 1, run: true });
  });
  it("uses the 3D shop only where WebGL works and ?shop2d is not asked for", () => {
    const gl = () => ({ getContext: (k: string) => (k === "webgl2" ? {} : null) });
    const none = () => ({ getContext: () => null });
    expect(canUse3D(gl, "")).toBe(true);
    expect(canUse3D(none, "")).toBe(false);
    expect(canUse3D(gl, "?local&shop2d")).toBe(false);
  });
});
