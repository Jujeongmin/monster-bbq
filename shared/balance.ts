import type { ChargerTuning } from "./hunt/charger";
import type { HitTuning, WeaponKind, WeaponStats } from "./hunt/combat";
import type { Field } from "./hunt/types";

// Every hunting number lives here. Prototype values from plan 01; tuned in the playtest.
export const BALANCE: {
  hunt: {
    field: Field;
    worldWidth: number;
    laneTolerance: number;
    premiumMaxRangedHits: number;
    player: { maxHp: number; speed: number };
    weapons: Record<WeaponKind, WeaponStats>;
    hit: HitTuning;
    hitStopMs: number;
    boar: ChargerTuning & { maxHp: number; contactDamage: number };
    boarCount: number;
  };
} = {
  hunt: {
    // feet positions on the test forest background (400x224 per screen, 3 screens wide)
    field: { minX: 16, maxX: 1184, minY: 168, maxY: 214 },
    worldWidth: 1200,
    laneTolerance: 8,
    premiumMaxRangedHits: 2,
    player: { maxHp: 100, speed: 80 },
    weapons: {
      melee: { kind: "melee", range: 26, damage: 10, cooldownMs: 550, swingMs: 450 },
      ranged: { kind: "ranged", range: 140, damage: 5, cooldownMs: 700, swingMs: 450 },
    },
    hit: {
      comboSteps: 3,
      comboWindowMs: 900,
      finisherMult: 1.8,
      counterMult: 1.5,
      backAttackMult: 1.25,
      knockback: 4,
      finisherKnockback: 18,
    },
    hitStopMs: 60,
    boar: {
      maxHp: 60,
      contactDamage: 18,
      wanderSpeed: 25,
      chargeSpeed: 190,
      aggroRange: 150,
      telegraphMs: 700,
      chargeMs: 650,
      recoverMs: 900,
      hitWidth: 22,
      laneTolerance: 8,
    },
    boarCount: 3,
  },
};
