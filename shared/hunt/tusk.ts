import { BALANCE } from "../balance";
import { clampToField, distance, stepToward, unit } from "./geometry";
import type { Field, Vec } from "./types";

// The tusk boss (hunt v3 design 4.7, user-chosen "엄니대장"): a big boar that wanders until the hunter
// comes near, then runs its patterns in turn — three charges in a row, a ground slam (a circle warned
// before the shock), a rush that pins the hunter (mash to break free) — and after each big pattern
// catches its breath for recoverMs, the window to hit it. Woken from sleep it is angry: faster.
const T = BALANCE.hunt.tusk;
export type TuskPattern = "charges" | "slam" | "grab";
const ORDER: TuskPattern[] = ["charges", "slam", "grab"];

export interface TuskState {
  pos: Vec;
  phase: "wander" | "telegraph" | "charge" | "gap" | "slamWindup" | "slam" | "rush" | "grab" | "recover";
  phaseMs: number;
  facing: Vec;
  chargeDir: Vec;
  chargesLeft: number;
  pattern: TuskPattern;
  nextPattern: number;
  angry: boolean;
  mashes: number;
  hitThisMove: boolean;
  wanderTarget: Vec | null;
}

export const newTusk = (pos: Vec): TuskState => ({
  pos, phase: "wander", phaseMs: 0, facing: { x: -1, y: 0 }, chargeDir: { x: -1, y: 0 }, chargesLeft: 0,
  pattern: "charges", nextPattern: 0, angry: false, mashes: 0, hitThisMove: false, wanderTarget: null,
});

export const isTuskVulnerable = (s: TuskState): boolean => s.phase === "recover";

// One mash while pinned: enough of them throw the boss off, and it has to catch its breath.
export function mashTusk(s: TuskState): TuskState {
  if (s.phase !== "grab") return s;
  const mashes = s.mashes + 1;
  return mashes >= T.grabMashes ? { ...s, phase: "recover", phaseMs: 0, mashes: 0 } : { ...s, mashes };
}

export function updateTusk(s: TuskState, player: Vec, dtMs: number, field: Field, rand: () => number): { state: TuskState; hurt: { damage: number } | null; grabbed: boolean; slam: Vec | null } {
  const speed = (v: number) => v * (s.angry ? T.angryMul : 1);
  const dt = dtMs / 1000;
  const phaseMs = s.phaseMs + dtMs;
  const toPlayer = unit({ x: player.x - s.pos.x, y: player.y - s.pos.y }, s.facing);
  const none = { hurt: null, grabbed: false, slam: null };
  const begin = (pattern: TuskPattern): TuskState => {
    const base = { ...s, pattern, nextPattern: (ORDER.indexOf(pattern) + 1) % ORDER.length, phaseMs: 0, facing: toPlayer, hitThisMove: false, wanderTarget: null };
    if (pattern === "charges") return { ...base, phase: "telegraph", chargesLeft: T.charges, chargeDir: toPlayer };
    if (pattern === "slam") return { ...base, phase: "slamWindup" };
    return { ...base, phase: "rush", chargeDir: toPlayer };
  };
  switch (s.phase) {
    case "wander": {
      if (distance(s.pos, player) <= T.aggroRange) return { state: begin(ORDER[s.nextPattern]), ...none };
      const target = s.wanderTarget ?? { x: field.minX + rand() * (field.maxX - field.minX), y: field.minY + rand() * (field.maxY - field.minY) };
      const step = stepToward(s.pos, target, speed(T.wanderSpeed) * dt);
      return { state: { ...s, pos: clampToField(step.pos, field), phaseMs, facing: unit({ x: target.x - s.pos.x, y: target.y - s.pos.y }, s.facing), wanderTarget: step.arrived ? null : target }, ...none };
    }
    case "telegraph":
      return { state: phaseMs >= T.telegraphMs ? { ...s, phase: "charge", phaseMs: 0, hitThisMove: false } : { ...s, phaseMs, chargeDir: toPlayer, facing: toPlayer }, ...none };
    case "charge": {
      const pos = clampToField({ x: s.pos.x + s.chargeDir.x * speed(T.chargeSpeed) * dt, y: s.pos.y + s.chargeDir.y * speed(T.chargeSpeed) * dt }, field);
      const hit = !s.hitThisMove && distance(pos, player) <= 22;
      const done = phaseMs >= T.chargeMs;
      const left = s.chargesLeft - (done ? 1 : 0);
      const next: TuskState = done ? (left > 0 ? { ...s, pos, phase: "gap", phaseMs: 0, chargesLeft: left } : { ...s, pos, phase: "recover", phaseMs: 0, chargesLeft: 0 }) : { ...s, pos, phaseMs, hitThisMove: s.hitThisMove || hit };
      return { state: next, hurt: hit ? { damage: T.contactDamage } : null, grabbed: false, slam: null };
    }
    case "gap":
      return { state: phaseMs >= T.chargeGapMs ? { ...s, phase: "telegraph", phaseMs: 0, chargeDir: toPlayer, facing: toPlayer } : { ...s, phaseMs }, ...none };
    case "slamWindup":
      return { state: phaseMs >= T.slamTelegraphMs ? { ...s, phase: "slam", phaseMs: 0 } : { ...s, phaseMs }, ...none };
    case "slam": {
      const hit = distance(s.pos, player) <= T.slamRadius;
      return { state: { ...s, phase: "recover", phaseMs: 0 }, hurt: hit ? { damage: T.slamDamage } : null, grabbed: false, slam: s.pos };
    }
    case "rush": {
      const pos = clampToField({ x: s.pos.x + s.chargeDir.x * speed(T.grabRushSpeed) * dt, y: s.pos.y + s.chargeDir.y * speed(T.grabRushSpeed) * dt }, field);
      if (distance(pos, player) <= T.grabRange) return { state: { ...s, pos, phase: "grab", phaseMs: 0, mashes: 0 }, hurt: null, grabbed: true, slam: null };
      return { state: phaseMs >= T.grabRushMs ? { ...s, pos, phase: "recover", phaseMs: 0 } : { ...s, pos, phaseMs, chargeDir: toPlayer }, ...none };
    }
    case "grab":
      return phaseMs >= T.grabMs ? { state: { ...s, phase: "recover", phaseMs: 0, mashes: 0 }, hurt: { damage: T.grabDamage }, grabbed: false, slam: null } : { state: { ...s, phaseMs }, ...none };
    case "recover":
      return { state: phaseMs >= T.recoverMs ? { ...s, phase: "wander", phaseMs: 0 } : { ...s, phaseMs }, ...none };
  }
}
