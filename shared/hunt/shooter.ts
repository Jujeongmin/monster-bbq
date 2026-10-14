import { clampToField, distance, unit } from "./geometry";
import type { Field, Vec } from "./types";

// The ranged kind (stinger bee): keeps its distance, takes aim (locking the direction), fires one
// stinger, then has to cool down, which is the opening.
export interface ShooterTuning {
  speed: number;
  keepDistance: number;
  range: number;
  aimMs: number;
  cooldownMs: number;
  shotSpeed: number;
  shotLifeMs: number;
}

export type ShooterPhase = "hover" | "aim" | "cooldown";

export interface ShooterState {
  pos: Vec;
  phase: ShooterPhase;
  phaseMs: number;
  facing: Vec;
  aimDir: Vec;
}

export interface Shot {
  pos: Vec;
  dir: Vec;
  speed: number;
  lifeMs: number;
}

export function newShooter(pos: Vec): ShooterState {
  return { pos, phase: "hover", phaseMs: 0, facing: { x: -1, y: 0 }, aimDir: { x: -1, y: 0 } };
}

export function isShooterVulnerable(s: ShooterState): boolean {
  return s.phase === "cooldown";
}

export function updateShooter(s: ShooterState, player: Vec, dtMs: number, t: ShooterTuning, field: Field): { state: ShooterState; shot: Shot | null } {
  const dt = dtMs / 1000;
  const phaseMs = s.phaseMs + dtMs;
  switch (s.phase) {
    case "hover": {
      const d = distance(s.pos, player);
      const toward = unit({ x: player.x - s.pos.x, y: player.y - s.pos.y }, s.facing);
      // comfortably in range: take aim; too close: back off first; too far: close in
      if (d <= t.range && d >= t.keepDistance - 30) return { state: { ...s, phase: "aim", phaseMs: 0, facing: toward, aimDir: toward }, shot: null };
      const sign = d < t.keepDistance ? -1 : 1;
      const pos = clampToField({ x: s.pos.x + toward.x * sign * t.speed * dt, y: s.pos.y + toward.y * sign * t.speed * dt }, field);
      return { state: { ...s, pos, phaseMs, facing: toward }, shot: null };
    }
    case "aim":
      if (phaseMs < t.aimMs) return { state: { ...s, phaseMs }, shot: null };
      return {
        state: { ...s, phase: "cooldown", phaseMs: 0 },
        shot: { pos: { ...s.pos }, dir: s.aimDir, speed: t.shotSpeed, lifeMs: t.shotLifeMs },
      };
    case "cooldown":
      return { state: phaseMs >= t.cooldownMs ? { ...s, phase: "hover", phaseMs: 0 } : { ...s, phaseMs }, shot: null };
  }
}

// A stinger in flight: straight line until its life runs out (null).
export function stepShot(shot: Shot, dtMs: number): Shot | null {
  const lifeMs = shot.lifeMs - dtMs;
  if (lifeMs <= 0) return null;
  const k = (shot.speed * dtMs) / 1000;
  return { ...shot, pos: { x: shot.pos.x + shot.dir.x * k, y: shot.pos.y + shot.dir.y * k }, lifeMs };
}

export function shotHits(shot: Shot, target: Vec, radius: number): boolean {
  return distance(shot.pos, target) <= radius;
}
