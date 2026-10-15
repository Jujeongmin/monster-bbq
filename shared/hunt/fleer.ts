import { clampToField, distance, stepToward, unit } from "./geometry";
import type { Field, Vec } from "./types";

// The timid kind (horned rabbit): wanders, bolts away when the hunter comes close, then has to stop
// and rest, which is the moment to catch it (or reel it in with the harpoon from afar).
export interface FleerTuning {
  wanderSpeed: number;
  fleeSpeed: number;
  fleeRange: number;
  fleeMs: number;
  restMs: number;
}

export type FleerPhase = "wander" | "flee" | "rest";

export interface FleerState {
  pos: Vec;
  phase: FleerPhase;
  phaseMs: number;
  facing: Vec;
  wanderTarget: Vec | null;
}

export function newFleer(pos: Vec): FleerState {
  return { pos, phase: "wander", phaseMs: 0, facing: { x: 1, y: 0 }, wanderTarget: null };
}

export function isFleerVulnerable(s: FleerState): boolean {
  return s.phase === "rest";
}

// A hit sends it running straight away, even mid-rest.
export function fleerHit(s: FleerState): FleerState {
  return { ...s, phase: "flee", phaseMs: 0, wanderTarget: null };
}

export function updateFleer(s: FleerState, player: Vec, dtMs: number, t: FleerTuning, field: Field, rand: () => number): FleerState {
  const dt = dtMs / 1000;
  const phaseMs = s.phaseMs + dtMs;
  switch (s.phase) {
    case "wander": {
      if (distance(s.pos, player) <= t.fleeRange) return { ...s, phase: "flee", phaseMs: 0, wanderTarget: null };
      const target = s.wanderTarget ?? { x: field.minX + rand() * (field.maxX - field.minX), y: field.minY + rand() * (field.maxY - field.minY) };
      const step = stepToward(s.pos, target, t.wanderSpeed * dt);
      return { ...s, pos: clampToField(step.pos, field), phaseMs, facing: unit({ x: target.x - s.pos.x, y: target.y - s.pos.y }, s.facing), wanderTarget: step.arrived ? null : target };
    }
    case "flee": {
      if (phaseMs >= t.fleeMs) return { ...s, phase: "rest", phaseMs: 0 };
      const away = unit({ x: s.pos.x - player.x, y: s.pos.y - player.y }, s.facing);
      const pos = clampToField({ x: s.pos.x + away.x * t.fleeSpeed * dt, y: s.pos.y + away.y * t.fleeSpeed * dt }, field);
      return { ...s, pos, phaseMs, facing: away };
    }
    case "rest":
      return phaseMs >= t.restMs ? { ...s, phase: "wander", phaseMs: 0 } : { ...s, phaseMs };
  }
}
