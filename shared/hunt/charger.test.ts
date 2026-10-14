import { describe, expect, it } from "vitest";
import { isVulnerable, newCharger, updateCharger, type ChargerState, type ChargerTuning } from "./charger";

const field = { minX: 0, maxX: 1000, minY: 160, maxY: 220 };
const t: ChargerTuning = {
  wanderSpeed: 25,
  chargeSpeed: 200,
  aggroRange: 150,
  telegraphMs: 700,
  chargeMs: 600,
  recoverMs: 900,
  hitWidth: 22,
  laneTolerance: 8,
};
const half = () => 0.5;

function at(phase: ChargerState["phase"], x: number, y: number, facing: 1 | -1 = 1): ChargerState {
  return { ...newCharger({ x, y }), phase, facing };
}

describe("wander", () => {
  it("strolls toward a random spot when the player is far away", () => {
    const r = updateCharger(newCharger({ x: 100, y: 190 }), { x: 900, y: 190 }, 1000, t, field, half);
    expect(r.state.phase).toBe("wander");
    // half() puts the spot at the field centre (500, 190): 25 px closer after 1 s
    expect(r.state.pos.x).toBeCloseTo(125);
    expect(r.hit).toBe(false);
  });
  it("starts winding up, facing the player, once the player is near on its lane", () => {
    const r = updateCharger(newCharger({ x: 300, y: 190 }), { x: 200, y: 194 }, 16, t, field, half);
    expect(r.state.phase).toBe("telegraph");
    expect(r.state.facing).toBe(-1);
  });
  it("lines up with the player's lane before winding up", () => {
    const r = updateCharger(newCharger({ x: 300, y: 170 }), { x: 200, y: 210 }, 400, t, field, half);
    expect(r.state.phase).toBe("wander");
    expect(r.state.pos.x).toBe(300);
    expect(r.state.pos.y).toBeCloseTo(180);
  });
});

describe("telegraph -> charge -> recover -> wander", () => {
  it("charges after the wind-up time", () => {
    const s = at("telegraph", 300, 190);
    expect(updateCharger(s, { x: 900, y: 190 }, 600, t, field, half).state.phase).toBe("telegraph");
    expect(updateCharger({ ...s, phaseMs: 600 }, { x: 900, y: 190 }, 100, t, field, half).state.phase).toBe("charge");
  });
  it("runs straight along its lane and stops to catch its breath when the charge ends", () => {
    const s = at("charge", 300, 190, 1);
    const mid = updateCharger(s, { x: 900, y: 100 }, 100, t, field, half).state;
    expect(mid.pos).toEqual({ x: 320, y: 190 });
    const end = updateCharger({ ...mid, phaseMs: 550 }, { x: 900, y: 100 }, 100, t, field, half).state;
    expect(end.phase).toBe("recover");
    expect(isVulnerable(end)).toBe(true);
  });
  it("goes back to wandering after recovering", () => {
    const s = { ...at("recover", 300, 190), phaseMs: 850 };
    const r = updateCharger(s, { x: 900, y: 100 }, 100, t, field, half);
    expect(r.state.phase).toBe("wander");
    expect(isVulnerable(r.state)).toBe(false);
  });
});

describe("charge hits", () => {
  it("hits a player standing in its path only once per charge", () => {
    let s = at("charge", 300, 190, 1);
    const player = { x: 315, y: 192 };
    const first = updateCharger(s, player, 16, t, field, half);
    expect(first.hit).toBe(true);
    s = first.state;
    const second = updateCharger(s, player, 16, t, field, half);
    expect(second.hit).toBe(false);
  });
  it("misses a player who stepped off its lane", () => {
    const r = updateCharger(at("charge", 300, 190, 1), { x: 315, y: 205 }, 16, t, field, half);
    expect(r.hit).toBe(false);
  });
  it("starts every new charge able to hit again", () => {
    const s = { ...at("telegraph", 300, 190), phaseMs: 700, hitThisCharge: true };
    expect(updateCharger(s, { x: 900, y: 100 }, 16, t, field, half).state.hitThisCharge).toBe(false);
  });
});

describe("huge frame gaps", () => {
  it("never leaves the hunting ground, even after a 10 second frame", () => {
    const r = updateCharger(at("charge", 950, 190, 1), { x: 0, y: 100 }, 10_000, t, field, half);
    expect(r.state.pos.x).toBeLessThanOrEqual(field.maxX);
    const w = updateCharger(newCharger({ x: 10, y: 165 }), { x: 900, y: 100 }, 10_000, t, field, () => 0);
    expect(w.state.pos.x).toBeGreaterThanOrEqual(field.minX);
    expect(w.state.pos.y).toBeGreaterThanOrEqual(field.minY);
  });
});
