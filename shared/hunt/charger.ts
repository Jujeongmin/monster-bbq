import { clampToField, sameLane, stepToward } from "./geometry";
import type { Field, Vec } from "./types";

// A charging monster (the boar): wander -> line up and wind up -> charge along its lane -> catch its breath.
export interface ChargerTuning {
  wanderSpeed: number;
  chargeSpeed: number;
  aggroRange: number;
  telegraphMs: number;
  chargeMs: number;
  recoverMs: number;
  hitWidth: number;
  laneTolerance: number;
}

export type ChargerPhase = "wander" | "telegraph" | "charge" | "recover";

export interface ChargerState {
  pos: Vec;
  phase: ChargerPhase;
  phaseMs: number;
  facing: 1 | -1;
  wanderTarget: Vec | null;
  hitThisCharge: boolean;
}

export function newCharger(pos: Vec): ChargerState {
  return { pos, phase: "wander", phaseMs: 0, facing: -1, wanderTarget: null, hitThisCharge: false };
}

// Catching its breath after a charge: hits on it now count as counters.
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
      const dx = player.x - s.pos.x;
      if (Math.abs(dx) <= t.aggroRange) {
        const facing: 1 | -1 = dx >= 0 ? 1 : -1;
        if (sameLane(s.pos, player, t.laneTolerance)) {
          return { state: { ...s, phase: "telegraph", phaseMs: 0, facing, wanderTarget: null, hitThisCharge: false }, hit: false };
        }
        const step = stepToward(s.pos, { x: s.pos.x, y: player.y }, t.wanderSpeed * dt);
        return { state: { ...s, pos: clampToField(step.pos, field), phaseMs, facing }, hit: false };
      }
      const target = s.wanderTarget ?? {
        x: field.minX + rand() * (field.maxX - field.minX),
        y: field.minY + rand() * (field.maxY - field.minY),
      };
      const step = stepToward(s.pos, target, t.wanderSpeed * dt);
      const facing: 1 | -1 = target.x >= s.pos.x ? 1 : -1;
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
      const pos = clampToField({ x: s.pos.x + s.facing * t.chargeSpeed * dt, y: s.pos.y }, field);
      const hit = !s.hitThisCharge && sameLane(pos, player, t.laneTolerance) && Math.abs(pos.x - player.x) <= t.hitWidth;
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
