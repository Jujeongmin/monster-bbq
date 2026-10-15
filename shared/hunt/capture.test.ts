import { describe, expect, it } from "vitest";
import { BALANCE } from "../balance";
import { startCapture, stepCapture, tapCapture } from "./capture";

const C = BALANCE.hunt.capture;

describe("the capture gauge (hunt v3 design 4.2)", () => {
  it("starts part full and fills with each tap, more with a better harpoon", () => {
    const c = startCapture();
    expect(c.fill).toBe(C.start);
    expect(tapCapture(c, 1).fill).toBeCloseTo(C.start + C.tap[0]);
    expect(tapCapture(c, 3).fill).toBeCloseTo(C.start + C.tap[2]);
  });
  it("drains faster the more health the monster has left", () => {
    const healthy = stepCapture(startCapture(), 1000, 1).c.fill;
    const weak = stepCapture(startCapture(), 1000, 0.1).c.fill;
    expect(healthy).toBeLessThan(weak);
  });
  it("breaks the rope when it runs dry", () => {
    expect(stepCapture({ fill: 0.01, ms: 500 }, 1000, 1).result).toBe("broke");
  });
  it("catches when full, but never before minMs", () => {
    expect(stepCapture({ fill: 1, ms: 100 }, 16, 0).result).toBe("going");
    expect(stepCapture({ fill: 1, ms: C.minMs }, 16, 0).result).toBe("caught");
  });
});
