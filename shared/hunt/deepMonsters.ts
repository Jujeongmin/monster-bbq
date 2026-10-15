import { BALANCE } from "../balance";
import { clampToField, distance, stepToward, unit } from "./geometry";
import type { Field, Vec } from "./types";

// The deep floors' four monsters (hunt v3 design 4.7, user-chosen): each a small state machine like the
// forest's (charger, fleer, ...), kept here together. Numbers in BALANCE.hunt.deep.
const D = BALANCE.hunt.deep;

interface Base {
  pos: Vec;
  phaseMs: number;
  facing: Vec;
  wanderTarget: Vec | null;
}

// a slow stroll toward a random spot of the field
function wander<S extends Base>(s: S, speed: number, dtMs: number, field: Field, rand: () => number): S {
  const target = s.wanderTarget ?? { x: field.minX + rand() * (field.maxX - field.minX), y: field.minY + rand() * (field.maxY - field.minY) };
  const step = stepToward(s.pos, target, (speed * dtMs) / 1000);
  return { ...s, pos: clampToField(step.pos, field), phaseMs: s.phaseMs + dtMs, facing: unit({ x: target.x - s.pos.x, y: target.y - s.pos.y }, s.facing), wanderTarget: step.arrived ? null : target };
}

// ---------------------------------------------------------------- frog general: puff, tongue, reel in

export interface TongueState extends Base {
  phase: "wander" | "puff" | "lash" | "retract";
  lashDir: Vec;
  hitThisLash: boolean;
}

// ready to lash from the start (it rests restMs only between lashes)
export const newTongue = (pos: Vec): TongueState => ({ pos, phase: "wander", phaseMs: D.frog.restMs, facing: { x: 1, y: 0 }, wanderTarget: null, lashDir: { x: 1, y: 0 }, hitThisLash: false });

// The tongue comes back slowly: hits now are counters, and a harpoon catch starts easier.
export const isTongueOpen = (s: TongueState): boolean => s.phase === "retract";

export function updateTongue(s: TongueState, player: Vec, dtMs: number, field: Field, rand: () => number): { state: TongueState; hurt: { damage: number } | null; pull: number } {
  const phaseMs = s.phaseMs + dtMs;
  switch (s.phase) {
    case "wander": {
      if (phaseMs > D.frog.restMs && distance(s.pos, player) <= D.frog.reach) {
        const dir = unit({ x: player.x - s.pos.x, y: player.y - s.pos.y }, s.facing);
        return { state: { ...s, phase: "puff", phaseMs: 0, facing: dir, lashDir: dir, wanderTarget: null }, hurt: null, pull: 0 };
      }
      return { state: { ...wander(s, D.frog.speed, dtMs, field, rand), phaseMs }, hurt: null, pull: 0 };
    }
    case "puff":
      return { state: phaseMs >= D.frog.puffMs ? { ...s, phase: "lash", phaseMs: 0, hitThisLash: false } : { ...s, phaseMs }, hurt: null, pull: 0 };
    case "lash": {
      // the tongue: a straight line out to `reach` along the locked direction
      const to = { x: player.x - s.pos.x, y: player.y - s.pos.y };
      const along = to.x * s.lashDir.x + to.y * s.lashDir.y;
      const off = Math.abs(to.x * s.lashDir.y - to.y * s.lashDir.x);
      const hit = !s.hitThisLash && along > 0 && along <= D.frog.reach && off <= D.frog.width;
      const next = phaseMs >= D.frog.lashMs ? { ...s, phase: "retract" as const, phaseMs: 0, hitThisLash: s.hitThisLash || hit } : { ...s, phaseMs, hitThisLash: s.hitThisLash || hit };
      return { state: next, hurt: hit ? { damage: D.frog.damage } : null, pull: hit ? D.frog.pull : 0 };
    }
    case "retract":
      return { state: phaseMs >= D.frog.retractMs ? { ...s, phase: "wander", phaseMs: 0 } : { ...s, phaseMs }, hurt: null, pull: 0 };
  }
}

// ---------------------------------------------------------------- water snake: hidden, ripple, bite

export interface LurkerState extends Base {
  phase: "hidden" | "ripple" | "bite" | "exposed";
}

export const newLurker = (pos: Vec): LurkerState => ({ pos, phase: "hidden", phaseMs: 0, facing: { x: 1, y: 0 }, wanderTarget: null });

// Under the mud it cannot be hit at all (the harpoon and darts pass over it).
export const isLurkerTargetable = (s: LurkerState): boolean => s.phase === "bite" || s.phase === "exposed";
export const isLurkerOpen = (s: LurkerState): boolean => s.phase === "exposed" && s.phaseMs < D.snake.openMs;

export function updateLurker(s: LurkerState, player: Vec, dtMs: number, field: Field, rand: () => number): { state: LurkerState; hurt: { damage: number } | null } {
  const phaseMs = s.phaseMs + dtMs;
  switch (s.phase) {
    case "hidden":
      if (distance(s.pos, player) <= D.snake.sense) return { state: { ...s, phase: "ripple", phaseMs: 0, facing: unit({ x: player.x - s.pos.x, y: player.y - s.pos.y }, s.facing), wanderTarget: null }, hurt: null };
      return { state: { ...wander(s, D.snake.speed, dtMs, field, rand), phaseMs }, hurt: null };
    case "ripple":
      if (phaseMs < D.snake.rippleMs) return { state: { ...s, phaseMs }, hurt: null };
      // up out of the mud: a bite if the hunter is still close
      return { state: { ...s, phase: "exposed", phaseMs: 0 }, hurt: distance(s.pos, player) <= D.snake.biteRange ? { damage: D.snake.damage } : null };
    case "bite":
    case "exposed":
      return { state: phaseMs >= D.snake.exposedMs ? { ...s, phase: "hidden", phaseMs: 0 } : { ...s, phaseMs }, hurt: null };
  }
}

// ---------------------------------------------------------------- cave bats: hover, fold, dive, dazed

export interface SwarmState extends Base {
  phase: "hover" | "fold" | "dive" | "dazed";
  home: Vec;
  diveDir: Vec;
  hitThisDive: boolean;
}

export const newSwarm = (pos: Vec): SwarmState => ({ pos, home: pos, phase: "hover", phaseMs: 0, facing: { x: 1, y: 0 }, wanderTarget: null, diveDir: { x: 1, y: 0 }, hitThisDive: false });

export const isSwarmOpen = (s: SwarmState): boolean => s.phase === "dazed";

// One bat was hit: the whole flock folds to dive.
export const angerSwarm = (members: SwarmState[]): SwarmState[] => members.map((m) => (m.phase === "hover" ? { ...m, phase: "fold", phaseMs: 0 } : m));

// `light`: the lantern's radius around the hunter; a bat inside it keeps away instead of diving.
export function updateSwarm(s: SwarmState, player: Vec, dtMs: number, field: Field, light: number): { state: SwarmState; hurt: { damage: number } | null } {
  const dt = dtMs / 1000;
  const phaseMs = s.phaseMs + dtMs;
  const lit = light > 0 && distance(s.pos, player) <= light;
  switch (s.phase) {
    case "hover": {
      if (lit) {
        const away = unit({ x: s.pos.x - player.x, y: s.pos.y - player.y }, s.facing);
        return { state: { ...s, pos: clampToField({ x: s.pos.x + away.x * D.bat.speed * dt, y: s.pos.y + away.y * D.bat.speed * dt }, field), phaseMs, facing: away }, hurt: null };
      }
      if (distance(s.pos, player) <= D.bat.sense) return { state: { ...s, phase: "fold", phaseMs: 0 }, hurt: null };
      // circling its roost
      const a = (phaseMs / 1000) * 2 + s.home.x;
      const pos = { x: s.home.x + Math.cos(a) * 16, y: s.home.y + Math.sin(a) * 10 };
      return { state: { ...s, pos: clampToField(pos, field), phaseMs, facing: unit({ x: pos.x - s.pos.x, y: pos.y - s.pos.y }, s.facing) }, hurt: null };
    }
    case "fold": {
      const dir = unit({ x: player.x - s.pos.x, y: player.y - s.pos.y }, s.facing);
      return { state: phaseMs >= D.bat.foldMs ? { ...s, phase: "dive", phaseMs: 0, diveDir: dir, facing: dir, hitThisDive: false } : { ...s, phaseMs, facing: dir }, hurt: null };
    }
    case "dive": {
      const pos = clampToField({ x: s.pos.x + s.diveDir.x * D.bat.diveSpeed * dt, y: s.pos.y + s.diveDir.y * D.bat.diveSpeed * dt }, field);
      const hit = !s.hitThisDive && distance(pos, player) <= D.bat.hitRadius;
      const done = phaseMs >= D.bat.diveMs || hit;
      return { state: done ? { ...s, pos, phase: "dazed", phaseMs: 0, hitThisDive: true } : { ...s, pos, phaseMs }, hurt: hit ? { damage: D.bat.damage } : null };
    }
    case "dazed":
      return { state: phaseMs >= D.bat.dazedMs ? { ...s, phase: "hover", phaseMs: 0, home: s.pos } : { ...s, phaseMs }, hurt: null };
  }
}

// ---------------------------------------------------------------- glow-shroom crab: claws, shell, flipped

export interface ShellState extends Base {
  phase: "wander" | "claw" | "snap" | "flipped";
}

export const newShell = (pos: Vec): ShellState => ({ pos, phase: "wander", phaseMs: 0, facing: { x: 1, y: 0 }, wanderTarget: null });

export const isShellOpen = (s: ShellState): boolean => s.phase === "flipped";
// A finisher or a firecracker turns it over, legs waving.
export const flipShell = (s: ShellState): ShellState => ({ ...s, phase: "flipped", phaseMs: 0 });

// How much of a hit gets through: from the front its shell takes most, from behind all, flipped double.
export function shellDamageMul(s: ShellState, attacker: Vec): number {
  if (s.phase === "flipped") return D.crab.flippedMul;
  const to = { x: attacker.x - s.pos.x, y: attacker.y - s.pos.y };
  return to.x * s.facing.x + to.y * s.facing.y > 0 ? D.crab.frontMul : 1;
}

export function updateShell(s: ShellState, player: Vec, dtMs: number, field: Field, rand: () => number): { state: ShellState; hurt: { damage: number } | null } {
  const phaseMs = s.phaseMs + dtMs;
  switch (s.phase) {
    case "wander":
      if (distance(s.pos, player) <= D.crab.reach) return { state: { ...s, phase: "claw", phaseMs: 0, facing: unit({ x: player.x - s.pos.x, y: player.y - s.pos.y }, s.facing), wanderTarget: null }, hurt: null };
      return { state: { ...wander(s, D.crab.speed, dtMs, field, rand), phaseMs }, hurt: null };
    case "claw":
      if (phaseMs < D.crab.clawMs) return { state: { ...s, phaseMs }, hurt: null };
      return { state: { ...s, phase: "snap", phaseMs: 0 }, hurt: distance(s.pos, player) <= D.crab.reach ? { damage: D.crab.damage } : null };
    case "snap":
      return { state: phaseMs >= D.crab.recoverMs ? { ...s, phase: "wander", phaseMs: 0 } : { ...s, phaseMs }, hurt: null };
    case "flipped":
      return { state: phaseMs >= D.crab.flippedMs ? { ...s, phase: "wander", phaseMs: 0 } : { ...s, phaseMs }, hurt: null };
  }
}
