import { sameLane } from "./geometry";
import type { Vec } from "./types";

export type WeaponKind = "melee" | "ranged";

export interface WeaponStats {
  kind: WeaponKind;
  range: number;
  damage: number;
  cooldownMs: number;
  // how long the attack animation locks the hunter in place
  swingMs: number;
}

export function inAttackRange(attacker: Vec, target: Vec, weapon: WeaponStats, laneTolerance: number): boolean {
  return sameLane(attacker, target, laneTolerance) && Math.abs(attacker.x - target.x) <= weapon.range;
}

// Where to stand to hit `target`: on its lane, a little inside reach, on the side the attacker is on.
// Already close enough on x means only the lane changes.
export function approachPoint(attacker: Vec, target: Vec, weapon: WeaponStats): Vec {
  const dx = attacker.x - target.x;
  const reach = weapon.range * 0.8;
  const x = Math.abs(dx) <= reach ? attacker.x : target.x + Math.sign(dx || -1) * reach;
  return { x, y: target.y };
}

export type Order = { kind: "none" } | { kind: "moveTo"; to: Vec } | { kind: "attack"; target: Vec };
export type PlayerAction = { kind: "idle" } | { kind: "move"; to: Vec } | { kind: "attack" };

export function decidePlayerAction(pos: Vec, order: Order, weapon: WeaponStats, laneTolerance: number): PlayerAction {
  switch (order.kind) {
    case "none":
      return { kind: "idle" };
    case "moveTo":
      return pos.x === order.to.x && pos.y === order.to.y ? { kind: "idle" } : { kind: "move", to: order.to };
    case "attack":
      return inAttackRange(pos, order.target, weapon, laneTolerance)
        ? { kind: "attack" }
        : { kind: "move", to: approachPoint(pos, order.target, weapon) };
  }
}

export interface HitTuning {
  comboSteps: number;
  comboWindowMs: number;
  finisherMult: number;
  counterMult: number;
  backAttackMult: number;
  knockback: number;
  finisherKnockback: number;
}

// Melee swings on the same target inside the window chain 1 -> 2 -> ... -> comboSteps, then start over.
export function nextComboStep(prevStep: number, msSinceLastSwing: number, sameTarget: boolean, weapon: WeaponKind, tuning: HitTuning): number {
  if (weapon !== "melee" || !sameTarget || msSinceLastSwing > tuning.comboWindowMs || prevStep >= tuning.comboSteps) return 1;
  return prevStep + 1;
}

export interface HitInput {
  weapon: WeaponStats;
  comboStep: number;
  // the target is open (a charger catching its breath after a charge): counter bonus
  targetVulnerable: boolean;
  attackerX: number;
  targetX: number;
  targetFacing: 1 | -1;
}

export interface HitResult {
  damage: number;
  finisher: boolean;
  counter: boolean;
  backAttack: boolean;
  knockback: number;
}

export function computeHit(input: HitInput, tuning: HitTuning): HitResult {
  const finisher = input.weapon.kind === "melee" && input.comboStep >= tuning.comboSteps;
  const counter = input.targetVulnerable;
  // behind = standing on the side opposite to where the target faces
  const backAttack = (input.attackerX - input.targetX) * input.targetFacing < 0;
  let mult = 1;
  if (finisher) mult *= tuning.finisherMult;
  if (counter) mult *= tuning.counterMult;
  if (backAttack) mult *= tuning.backAttackMult;
  return {
    damage: Math.round(input.weapon.damage * mult),
    finisher,
    counter,
    backAttack,
    knockback: finisher ? tuning.finisherKnockback : tuning.knockback,
  };
}

export interface HitLog {
  meleeHits: number;
  rangedHits: number;
  lastHit: WeaponKind | null;
}

export const EMPTY_HIT_LOG: HitLog = { meleeHits: 0, rangedHits: 0, lastHit: null };

export function recordHit(log: HitLog, kind: WeaponKind): HitLog {
  return kind === "melee"
    ? { ...log, meleeHits: log.meleeHits + 1, lastHit: kind }
    : { ...log, rangedHits: log.rangedHits + 1, lastHit: kind };
}

export type MeatGrade = "premium" | "normal";

// Spec 3: premium when the killing blow was melee and it took at most `maxRangedHits` ranged hits.
export function meatGrade(log: HitLog, maxRangedHits: number): MeatGrade {
  return log.lastHit === "melee" && log.rangedHits <= maxRangedHits ? "premium" : "normal";
}
