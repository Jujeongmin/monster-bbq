import { clampToField, distance, stepToward, unit } from "./geometry";
import type { Field, Vec } from "./types";

// The flock kind (wild chickens): calm members peck around their home spot; hit one and the whole
// flock turns on the hunter (angerPack), chasing and pecking. After a peck a member catches its breath.
export interface PackTuning {
  wanderSpeed: number;
  wanderRadius: number;
  chaseSpeed: number;
  peckRange: number;
  windupMs: number;
  peckMs: number;
  recoverMs: number;
  hitRadius: number;
}

export type PackPhase = "wander" | "chase" | "windup" | "peck" | "recover";

export interface PackMemberState {
  pos: Vec;
  home: Vec;
  phase: PackPhase;
  phaseMs: number;
  facing: Vec;
  peckDir: Vec;
  wanderTarget: Vec | null;
  hitThisPeck: boolean;
}

export function newPackMember(pos: Vec): PackMemberState {
  return { pos, home: pos, phase: "wander", phaseMs: 0, facing: { x: 1, y: 0 }, peckDir: { x: 1, y: 0 }, wanderTarget: null, hitThisPeck: false };
}

export function isPackVulnerable(s: PackMemberState): boolean {
  return s.phase === "recover";
}

// One member was hit: every calm member of its flock starts chasing (busy ones carry on).
export function angerPack(members: PackMemberState[]): PackMemberState[] {
  return members.map((m) => (m.phase === "wander" ? { ...m, phase: "chase", phaseMs: 0, wanderTarget: null } : m));
}

export function updatePackMember(
  s: PackMemberState,
  player: Vec,
  dtMs: number,
  t: PackTuning,
  field: Field,
  rand: () => number,
): { state: PackMemberState; hit: boolean } {
  const dt = dtMs / 1000;
  const phaseMs = s.phaseMs + dtMs;
  switch (s.phase) {
    case "wander": {
      let target = s.wanderTarget;
      if (!target) {
        const a = rand() * Math.PI * 2;
        const r = rand() * t.wanderRadius;
        target = { x: s.home.x + Math.cos(a) * r, y: s.home.y + Math.sin(a) * r };
      }
      const step = stepToward(s.pos, target, t.wanderSpeed * dt);
      const facing = unit({ x: target.x - s.pos.x, y: target.y - s.pos.y }, s.facing);
      return { state: { ...s, pos: clampToField(step.pos, field), phaseMs, facing, wanderTarget: step.arrived ? null : target }, hit: false };
    }
    case "chase": {
      const toward = unit({ x: player.x - s.pos.x, y: player.y - s.pos.y }, s.facing);
      if (distance(s.pos, player) <= t.peckRange) return { state: { ...s, phase: "windup", phaseMs: 0, facing: toward, peckDir: toward }, hit: false };
      const step = stepToward(s.pos, player, t.chaseSpeed * dt);
      return { state: { ...s, pos: clampToField(step.pos, field), phaseMs, facing: toward }, hit: false };
    }
    case "windup":
      return { state: phaseMs >= t.windupMs ? { ...s, phase: "peck", phaseMs: 0, hitThisPeck: false } : { ...s, phaseMs }, hit: false };
    case "peck": {
      const hit = !s.hitThisPeck && distance(s.pos, player) <= t.hitRadius;
      const done = phaseMs >= t.peckMs;
      return { state: { ...s, phase: done ? "recover" : "peck", phaseMs: done ? 0 : phaseMs, hitThisPeck: s.hitThisPeck || hit }, hit };
    }
    case "recover":
      return { state: phaseMs >= t.recoverMs ? { ...s, phase: "chase", phaseMs: 0 } : { ...s, phaseMs }, hit: false };
  }
}
