import { distance, unit } from "./geometry";
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

// A slash toward `aim`: everything within `range` whose direction is within `halfAngle` of the aim.
export function coneTargets<T extends { pos: Vec }>(attacker: Vec, aim: Vec, targets: T[], range: number, halfAngle: number): T[] {
  const a = unit(aim);
  const minCos = Math.cos(halfAngle);
  return targets.filter((t) => {
    const d = distance(attacker, t.pos);
    if (d > range) return false;
    if (d === 0) return true;
    return ((t.pos.x - attacker.x) * a.x + (t.pos.y - attacker.y) * a.y) / d >= minCos;
  });
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

// Melee swings inside the window chain 1 -> 2 -> ... -> comboSteps, then start over.
export function nextComboStep(prevStep: number, msSinceLastSwing: number, sameTarget: boolean, weapon: WeaponKind, tuning: HitTuning): number {
  if (weapon !== "melee" || !sameTarget || msSinceLastSwing > tuning.comboWindowMs || prevStep >= tuning.comboSteps) return 1;
  return prevStep + 1;
}

export interface HitInput {
  weapon: WeaponStats;
  comboStep: number;
  // the target is open (dazed, or catching its breath after a charge): counter bonus
  targetVulnerable: boolean;
  attackerPos: Vec;
  targetPos: Vec;
  // the way the target looks
  targetFacing: Vec;
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
  // behind = the attacker is on the opposite side to where the target looks
  const toAttacker = { x: input.attackerPos.x - input.targetPos.x, y: input.attackerPos.y - input.targetPos.y };
  const backAttack = toAttacker.x * input.targetFacing.x + toAttacker.y * input.targetFacing.y < 0;
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
