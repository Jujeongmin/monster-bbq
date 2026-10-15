import { clampToField, distance, stepToward, unit } from "./geometry";
import type { Field, Vec } from "./types";

// A charging monster (the boar) on a top-down map: wander -> wind up aiming at the player ->
// charge straight that way -> catch its breath.
export interface ChargerTuning {
  wanderSpeed: number;
  chargeSpeed: number;
  aggroRange: number;
  telegraphMs: number;
  chargeMs: number;
  recoverMs: number;
  // a charge hits the player within this distance
  hitRadius: number;
}

export type ChargerPhase = "wander" | "telegraph" | "charge" | "recover";

export interface ChargerState {
  pos: Vec;
  phase: ChargerPhase;
  phaseMs: number;
  // the way it looks (unit vector); the sprite flips on facing.x
  facing: Vec;
  // locked when the wind-up starts
  chargeDir: Vec;
  wanderTarget: Vec | null;
  hitThisCharge: boolean;
}

export function newCharger(pos: Vec): ChargerState {
  return { pos, phase: "wander", phaseMs: 0, facing: { x: -1, y: 0 }, chargeDir: { x: -1, y: 0 }, wanderTarget: null, hitThisCharge: false };
}

// Catching its breath after a charge (or dazed by a harpoon): hits on it now count as counters.
export function isVulnerable(s: ChargerState): boolean {
  return s.phase === "recover";
}

export function updateCharger(
  s: ChargerState,
  player: Vec,
  dtMs: number,
  t: ChargerTuning,
  field: Field,
  rand: () => number,
): { state: ChargerState; hit: boolean } {
  const dt = dtMs / 1000;
  const phaseMs = s.phaseMs + dtMs;
  switch (s.phase) {
    case "wander": {
      if (distance(s.pos, player) <= t.aggroRange) {
        const dir = unit({ x: player.x - s.pos.x, y: player.y - s.pos.y }, s.facing);
        return { state: { ...s, phase: "telegraph", phaseMs: 0, facing: dir, chargeDir: dir, wanderTarget: null, hitThisCharge: false }, hit: false };
      }
      const target = s.wanderTarget ?? {
        x: field.minX + rand() * (field.maxX - field.minX),
        y: field.minY + rand() * (field.maxY - field.minY),
      };
      const step = stepToward(s.pos, target, t.wanderSpeed * dt);
      const facing = unit({ x: target.x - s.pos.x, y: target.y - s.pos.y }, s.facing);
      return {
        state: { ...s, pos: clampToField(step.pos, field), phaseMs, facing, wanderTarget: step.arrived ? null : target },
        hit: false,
      };
    }
    case "telegraph":
      return {
        state: phaseMs >= t.telegraphMs ? { ...s, phase: "charge", phaseMs: 0, hitThisCharge: false } : { ...s, phaseMs },
        hit: false,
      };
    case "charge": {
      const pos = clampToField({ x: s.pos.x + s.chargeDir.x * t.chargeSpeed * dt, y: s.pos.y + s.chargeDir.y * t.chargeSpeed * dt }, field);
      const hit = !s.hitThisCharge && distance(pos, player) <= t.hitRadius;
      const done = phaseMs >= t.chargeMs;
      return {
        state: { ...s, pos, phase: done ? "recover" : "charge", phaseMs: done ? 0 : phaseMs, hitThisCharge: s.hitThisCharge || hit },
        hit,
      };
    }
    case "recover":
      return { state: phaseMs >= t.recoverMs ? { ...s, phase: "wander", phaseMs: 0 } : { ...s, phaseMs }, hit: false };
  }
}
