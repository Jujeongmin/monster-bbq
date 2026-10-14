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

// What a swing toward `facing` hits: everything in front on the lane within reach for melee,
// only the nearest such target for the ranged weapon.
export function swingTargets<T extends { pos: Vec }>(attacker: Vec, facing: 1 | -1, targets: T[], weapon: WeaponStats, laneTolerance: number): T[] {
  const inFront = targets.filter((t) => (t.pos.x - attacker.x) * facing >= 0 && inAttackRange(attacker, t.pos, weapon, laneTolerance));
  if (weapon.kind === "melee") return inFront;
  const nearest = inFront.reduce<T | undefined>(
    (best, t) => (!best || Math.abs(t.pos.x - attacker.x) < Math.abs(best.pos.x - attacker.x) ? t : best),
    undefined,
  );
  return nearest ? [nearest] : [];
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
