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
    player: { maxHp: number; speed: number; depthSpeedRatio: number };
    weapons: Record<WeaponKind, WeaponStats>;
    hit: HitTuning;
    harpoon: {
      speed: number;
      range: number;
      cooldownMs: number;
      throwLockMs: number;
      hand: { x: number; y: number };
      bodyOffsetY: number;
      hitRadius: number;
      pullSpeed: number;
      pullStopDist: number;
      dazeMs: number;
    };
    hitStopMs: number;
    boar: ChargerTuning & { maxHp: number; contactDamage: number };
    boarCount: number;
  };
} = {
  hunt: {
    // feet positions on the dirt floor layer (floor drawn at y 112..224; 3 screens wide)
    field: { minX: 16, maxX: 1184, minY: 132, maxY: 206 },
    worldWidth: 1200,
    laneTolerance: 8,
    premiumMaxRangedHits: 2,
    player: { maxHp: 100, speed: 80, depthSpeedRatio: 0.6 },
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
    // ranged damage comes from weapons.ranged; a harpooned boar is reeled in and left open (counter)
    harpoon: {
      speed: 340,
      range: 170,
      cooldownMs: 600,
      throwLockMs: 220,
      // where the rope leaves the hunter, relative to the feet (x toward facing)
      hand: { x: 8, y: 24 },
      bodyOffsetY: 20,
      hitRadius: 18,
      pullSpeed: 260,
      pullStopDist: 22,
      // how long a reeled-in boar stays dazed (open for counters): long enough for a 3-hit combo
      dazeMs: 1700,
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
