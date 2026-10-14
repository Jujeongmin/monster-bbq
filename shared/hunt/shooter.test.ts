import { describe, expect, it } from "vitest";
import { isShooterVulnerable, newShooter, shotHits, stepShot, updateShooter, type ShooterTuning } from "./shooter";

const field = { minX: 0, maxX: 1000, minY: 0, maxY: 800 };
const t: ShooterTuning = { speed: 50, keepDistance: 110, range: 150, aimMs: 600, cooldownMs: 1200, shotSpeed: 200, shotLifeMs: 1000 };

describe("shooter (stinger bee)", () => {
  it("closes in when far and backs off when too close", () => {
    const far = updateShooter(newShooter({ x: 600, y: 300 }), { x: 300, y: 300 }, 100, t, field).state;
    expect(far.pos.x).toBeLessThan(600);
    const near = updateShooter(newShooter({ x: 340, y: 300 }), { x: 300, y: 300 }, 100, t, field).state;
    expect(near.pos.x).toBeGreaterThan(340);
  });
  it("takes aim once in range, locking the direction at the hunter", () => {
    const s = updateShooter(newShooter({ x: 410, y: 300 }), { x: 300, y: 300 }, 16, t, field).state;
    expect(s.phase).toBe("aim");
    expect(s.aimDir.x).toBeCloseTo(-1);
  });
  it("fires one stinger when the aim time is up, then cools down (open for counters)", () => {
    const aiming = { ...newShooter({ x: 410, y: 300 }), phase: "aim" as const, phaseMs: 580, aimDir: { x: -1, y: 0 } };
    const r = updateShooter(aiming, { x: 300, y: 300 }, 30, t, field);
    expect(r.shot).toEqual({ pos: { x: 410, y: 300 }, dir: { x: -1, y: 0 }, speed: 200, lifeMs: 1000 });
    expect(r.state.phase).toBe("cooldown");
    expect(isShooterVulnerable(r.state)).toBe(true);
    expect(updateShooter(r.state, { x: 300, y: 300 }, 30, t, field).shot).toBeNull();
  });
  it("goes back to hovering after the cooldown", () => {
    const cooling = { ...newShooter({ x: 410, y: 300 }), phase: "cooldown" as const, phaseMs: 1190 };
    expect(updateShooter(cooling, { x: 900, y: 700 }, 30, t, field).state.phase).toBe("hover");
  });
});

describe("stingers", () => {
  const shot = { pos: { x: 100, y: 100 }, dir: { x: 1, y: 0 }, speed: 200, lifeMs: 300 };
  it("fly straight and run out", () => {
    expect(stepShot(shot, 100)).toEqual({ ...shot, pos: { x: 120, y: 100 }, lifeMs: 200 });
    expect(stepShot(shot, 400)).toBeNull();
  });
  it("hit what they touch", () => {
    expect(shotHits(shot, { x: 106, y: 103 }, 8)).toBe(true);
    expect(shotHits(shot, { x: 100, y: 130 }, 8)).toBe(false);
  });
});
