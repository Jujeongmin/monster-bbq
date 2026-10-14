import type { ChargerTuning } from "./hunt/charger";
import type { HitTuning, WeaponKind, WeaponStats } from "./hunt/combat";
import type { Field } from "./hunt/types";

// Every hunting number lives here. Prototype values from plan 01; tuned in the playtest.
export const BALANCE: {
  hunt: {
    world: { w: number; h: number };
    field: Field;
    premiumMaxRangedHits: number;
    player: { maxHp: number; speed: number; depthSpeedRatio: number; radius: number };
    weapons: Record<WeaponKind, WeaponStats>;
    // half the opening angle of the slash cone, in radians
    slashHalfAngle: number;
    hit: HitTuning;
    harpoon: {
      speed: number;
      range: number;
      cooldownMs: number;
      throwLockMs: number;
      // where the rope leaves the hunter, above the feet
      handHeight: number;
      bodyOffsetY: number;
      hitRadius: number;
      pullSpeed: number;
      pullStopDist: number;
      dazeMs: number;
    };
    hitStopMs: number;
    boar: ChargerTuning & { maxHp: number; contactDamage: number; radius: number };
    boarCount: number;
  };
} = {
  hunt: {
    // top-down forest made of the 256 px ground tile, mirrored
    world: { w: 1536, h: 1024 },
    field: { minX: 16, maxX: 1520, minY: 24, maxY: 1008 },
    premiumMaxRangedHits: 2,
    player: { maxHp: 100, speed: 85, depthSpeedRatio: 0.9, radius: 6 },
    weapons: {
      melee: { kind: "melee", range: 32, damage: 10, cooldownMs: 550, swingMs: 450 },
      ranged: { kind: "ranged", range: 170, damage: 5, cooldownMs: 600, swingMs: 220 },
    },
    slashHalfAngle: Math.PI / 3,
    hit: {
      comboSteps: 3,
      comboWindowMs: 900,
      finisherMult: 1.8,
      counterMult: 1.5,
      backAttackMult: 1.25,
      knockback: 4,
      finisherKnockback: 18,
    },
    // ranged damage comes from weapons.ranged; a harpooned boar is reeled in and left dazed (counter)
    harpoon: {
      speed: 340,
      range: 170,
      cooldownMs: 600,
      throwLockMs: 220,
      handHeight: 22,
      bodyOffsetY: 16,
      hitRadius: 18,
      pullSpeed: 260,
      pullStopDist: 24,
      dazeMs: 1700,
    },
    hitStopMs: 60,
    boar: {
      maxHp: 60,
      contactDamage: 18,
      wanderSpeed: 25,
      chargeSpeed: 190,
      aggroRange: 130,
      telegraphMs: 700,
      chargeMs: 650,
      recoverMs: 900,
      hitRadius: 18,
      radius: 12,
    },
    boarCount: 8,
  },
};
