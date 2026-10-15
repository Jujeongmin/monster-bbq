import { describe, expect, it } from "vitest";
import { isVulnerable, newCharger, updateCharger, type ChargerState, type ChargerTuning } from "./charger";

const field = { minX: 0, maxX: 1000, minY: 0, maxY: 800 };
const t: ChargerTuning = {
  wanderSpeed: 25,
  chargeSpeed: 200,
  aggroRange: 150,
  telegraphMs: 700,
  chargeMs: 600,
  recoverMs: 900,
  hitRadius: 18,
};
const half = () => 0.5;

function at(phase: ChargerState["phase"], x: number, y: number, chargeDir = { x: 1, y: 0 }): ChargerState {
  return { ...newCharger({ x, y }), phase, chargeDir, facing: chargeDir };
}

describe("wander", () => {
  it("strolls toward a random spot when the player is far away", () => {
    const r = updateCharger(newCharger({ x: 100, y: 400 }), { x: 900, y: 400 }, 1000, t, field, half);
    expect(r.state.phase).toBe("wander");
    // half() puts the spot at the field centre (500, 400): 25 px closer after 1 s
    expect(r.state.pos.x).toBeCloseTo(125);
    expect(r.hit).toBe(false);
  });
  it("winds up, aiming at the player, once the player comes within aggro range", () => {
    const r = updateCharger(newCharger({ x: 300, y: 300 }), { x: 300, y: 200 }, 16, t, field, half);
    expect(r.state.phase).toBe("telegraph");
    expect(r.state.chargeDir.x).toBeCloseTo(0);
    expect(r.state.chargeDir.y).toBeCloseTo(-1);
  });
});

describe("telegraph -> charge -> recover -> wander", () => {
  it("charges after the wind-up time", () => {
    const s = at("telegraph", 300, 300);
    expect(updateCharger(s, { x: 900, y: 700 }, 600, t, field, half).state.phase).toBe("telegraph");
    expect(updateCharger({ ...s, phaseMs: 600 }, { x: 900, y: 700 }, 100, t, field, half).state.phase).toBe("charge");
  });
  it("runs straight the way it aimed, even if the player moved", () => {
    const s = at("charge", 300, 300, { x: 0.6, y: 0.8 });
    const mid = updateCharger(s, { x: 0, y: 0 }, 100, t, field, half).state;
    expect(mid.pos.x).toBeCloseTo(312);
    expect(mid.pos.y).toBeCloseTo(316);
  });
  it("stops to catch its breath when the charge ends, open for counters", () => {
    const s = { ...at("charge", 300, 300), phaseMs: 550 };
    const end = updateCharger(s, { x: 0, y: 0 }, 100, t, field, half).state;
    expect(end.phase).toBe("recover");
    expect(isVulnerable(end)).toBe(true);
  });
  it("goes back to wandering after recovering", () => {
    const s = { ...at("recover", 300, 300), phaseMs: 850 };
    const r = updateCharger(s, { x: 900, y: 700 }, 100, t, field, half);
    expect(r.state.phase).toBe("wander");
    expect(isVulnerable(r.state)).toBe(false);
  });
});

describe("charge hits", () => {
  it("hits a player in its path only once per charge", () => {
    let s = at("charge", 300, 300);
    const player = { x: 312, y: 305 };
    const first = updateCharger(s, player, 16, t, field, half);
    expect(first.hit).toBe(true);
    s = first.state;
    expect(updateCharger(s, player, 16, t, field, half).hit).toBe(false);
  });
  it("misses a player who stepped aside", () => {
    expect(updateCharger(at("charge", 300, 300), { x: 315, y: 330 }, 16, t, field, half).hit).toBe(false);
  });
  it("starts every new charge able to hit again", () => {
    const s = { ...at("telegraph", 300, 300), phaseMs: 700, hitThisCharge: true };
    expect(updateCharger(s, { x: 900, y: 700 }, 16, t, field, half).state.hitThisCharge).toBe(false);
  });
});

describe("huge frame gaps", () => {
  it("never leaves the hunting ground, even after a 10 second frame", () => {
    const r = updateCharger(at("charge", 950, 300), { x: 0, y: 0 }, 10_000, t, field, half);
    expect(r.state.pos.x).toBeLessThanOrEqual(field.maxX);
    const w = updateCharger(newCharger({ x: 10, y: 10 }), { x: 900, y: 700 }, 10_000, t, field, () => 0);
    expect(w.state.pos.x).toBeGreaterThanOrEqual(field.minX);
    expect(w.state.pos.y).toBeGreaterThanOrEqual(field.minY);
  });
});
