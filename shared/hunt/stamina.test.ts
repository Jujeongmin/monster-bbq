import { describe, expect, it } from "vitest";
import { FLOORS } from "../content/floors";
import { drainStamina } from "./stamina";

describe("drainStamina", () => {
  it("drains by the floor's rate per second", () => {
    expect(drainStamina(100, 1000, 1)).toBeCloseTo(100 - FLOORS[1].drainPerSec);
    expect(drainStamina(100, 2000, 2)).toBeCloseTo(100 - 2 * FLOORS[2].drainPerSec);
  });
  it("never goes below zero", () => {
    expect(drainStamina(0.1, 60_000, 2)).toBe(0);
  });
  it("lasts about six and a half minutes on floor 1 from 100 (user-approved draft)", () => {
    expect(100 / FLOORS[1].drainPerSec / 60).toBeCloseTo(6.67, 1);
  });
});
