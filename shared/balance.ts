import type { ChargerTuning } from "./hunt/charger";
import type { FleerTuning } from "./hunt/fleer";
import type { PackTuning } from "./hunt/pack";
import type { ShooterTuning } from "./hunt/shooter";
import type { HitTuning, WeaponKind, WeaponStats } from "./hunt/combat";
import type { DishId } from "./content/dishes";
import type { ItemId } from "./content/items";
import type { UpgradeId } from "./content/upgrades";
import type { Field } from "./hunt/types";

export interface GrillTuning {
  preheatMs: number; // cold to ready
  stickBelow: number; // heat under which meat sticks
  edgeHeat: number; // heat at the rim (centre = 1)
  sideMs: number; // a belly side from raw to just right at full heat, centre
  charMs: number; // past burnAt, charred through at this pace
  cutFaceMs: number; // cut faces from raw to done
  cutReady: number; // doneness under which cutting loses juice
  fatPerSec: number; // fat a cooking pork belly piece lets out
  fatZoneY: number; // below this (grill coordinates, +y down) is where the fat pools
  fatNeeded: number; // fat pool that makes the fat zone fry garnish
  friedMs: number; // garnish fried through in the fat
  sootPerChar: number; // soot left per unit of char
  sootPerFatSec: number; // soot from fat burning on the plate
  coreLagMs: number; // the inside follows the outside with this lag (times the item's thickness)
  restLagMs: number; // ... and on the resting board, off the heat, with this one
  restNeededMs: number; // a proper rest
  saltEarlyBelow: number; // salt shaken on before either side reaches this doneness counts as salting first
  saltMax: number; // pinches past this are too salty
}

export interface PotTuning {
  heatPerSec: [number, number, number, number]; // degrees per second toward the target by dial
  coolPerSec: number; // with the fire off
  lidBoost: number; // lid on: heats this much faster
  target: [number, number, number, number]; // target temperature by dial (off, low, mid, high)
  cookFrom: number; // temperature from which things cook
  boilOverMs: number; // at full boil on high before it spills (half with the lid on)
  foamPerSec: number; // scum rising while meat boils
  skimAmount: number; // one pass of the ladle
}

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
    rabbit: FleerTuning;
    bee: ShooterTuning & { shotDamage: number; shotRadius: number };
    chicken: PackTuning & { peckDamage: number };
    // a hunt report needs at least this long per kill (server check, spec 7)
    minMsPerKill: number;
    boarCount: number;
    bagSlots: number;
  };
  economy: { itemPrice: Record<ItemId, { normal: number; premium?: number }>; maxMeatPerHunt: number };
  kitchen: { menuSlots: number; maxIngredients: number };
  // per upgrade: its starting level, the cost of each next level, and target levels locked until later
  // chapters (boss parts, story)
  upgrades: Record<UpgradeId, { base: 0 | 1; costs: number[]; locked?: number[] }>;
  // what each upgrade level does (index = level - 1)
  growth: {
    meleeDamage: number[];
    rangedDamage: number[];
    rangedRange: number[];
    maxHp: number[];
    bag: number[];
    menu: number[];
    quality: number[];
    seats: number[];
    lunch: number[];
  };
  service: {
    baseCustomers: number;
    perReputation: number; // one more customer per this much reputation
    minCustomers: number;
    maxCustomers: number;
    firstArriveMs: number;
    gapMs: [number, number];
    patienceMs: [number, number];
    seats: number;
    minMsPerServe: number; // no faster than this per plate (server check)
    dishPrice: Record<DishId, number>;
    premiumBonus: number; // dish score lift when every part on the plate is premium
    tipRate: number;
    happyAt: number;
    rep: { happy: number; left: number };
  };
  cooking: {
    grill: GrillTuning;
    pot: PotTuning;
    // per item: how fast it cooks on the grill (1 = pork belly) and when it starts to burn, whether it
    // has only one side worth cooking (a leaf, a honey puddle), and its time in the pot
    // thick: how far the inside lags behind the outside (0 = nothing to rest: leaves, garlic, mushrooms)
    items: Record<ItemId, { grillRate: number; burnAt: number; oneSide?: boolean; potRate: number; soft?: boolean; thick: number }>;
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
    // range, damage, cooldown and throw lock come from weapons.ranged; a harpooned boar is reeled in
    // and left dazed (counter)
    harpoon: {
      speed: 340,
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
    rabbit: { wanderSpeed: 22, fleeSpeed: 115, fleeRange: 95, fleeMs: 1300, restMs: 1600 },
    bee: { speed: 55, keepDistance: 120, range: 160, aimMs: 650, cooldownMs: 1400, shotSpeed: 210, shotLifeMs: 1100, shotDamage: 12, shotRadius: 9 },
    chicken: { wanderSpeed: 16, wanderRadius: 40, chaseSpeed: 72, peckRange: 18, windupMs: 380, peckMs: 160, recoverMs: 750, hitRadius: 18, peckDamage: 8 },
    minMsPerKill: 1500,
    boarCount: 8,
    bagSlots: 12,
  },
  // temporary shop until plan 05 (cooking): items sell raw at these prices (premium parts pay double)
  economy: {
    itemPrice: {
      boar_belly: { normal: 15, premium: 30 },
      boar_neck: { normal: 14, premium: 28 },
      boar_rib: { normal: 18, premium: 36 },
      rabbit_leg: { normal: 12, premium: 24 },
      honeycomb: { normal: 16, premium: 32 },
      chicken_thigh: { normal: 13, premium: 26 },
      chicken_breast: { normal: 11, premium: 22 },
      shiitake: { normal: 6 },
      wild_garlic: { normal: 5 },
      perilla: { normal: 4 },
    },
    maxMeatPerHunt: 20,
  },
  // research kitchen and menu (spec 4); menu slots grow with upgrades (plan 06)
  kitchen: { menuSlots: 2, maxIngredients: 3 },
  // gold growth (growth design 2, user-approved draft numbers 2026-10-14)
  upgrades: {
    melee: { base: 1, costs: [300, 900, 2400], locked: [4] },
    ranged: { base: 1, costs: [400, 1500] },
    armor: { base: 1, costs: [300, 1000, 2800] },
    bag: { base: 1, costs: [200, 500, 1000, 2000] },
    menu: { base: 1, costs: [400, 1200, 3000] },
    pot: { base: 0, costs: [600] },
    wok: { base: 0, costs: [1500], locked: [1] },
    fryer: { base: 0, costs: [3000], locked: [1] },
    board: { base: 0, costs: [5000], locked: [1] },
    grillQuality: { base: 1, costs: [500, 2000] },
    potQuality: { base: 1, costs: [500, 2000] },
    seats: { base: 1, costs: [800, 1600, 3200, 6400] },
    lunchbox: { base: 1, costs: [300, 1500] },
  },
  growth: {
    meleeDamage: [10, 14, 19, 26],
    rangedDamage: [5, 8, 12],
    rangedRange: [1, 1.1, 1.1],
    maxHp: [100, 130, 170, 220],
    bag: [12, 15, 18, 21, 24],
    menu: [2, 3, 4, 5],
    quality: [1, 1.15, 1.3],
    seats: [0, 1, 2, 3, 4],
    lunch: [1, 2, 3],
  },
  // the night service (cooking-service design 5); first guesses, tuned in play
  service: {
    baseCustomers: 4,
    perReputation: 10,
    minCustomers: 3,
    maxCustomers: 10,
    firstArriveMs: 3000,
    gapMs: [8000, 14000],
    patienceMs: [45000, 60000],
    seats: 4,
    minMsPerServe: 4000,
    dishPrice: {
      grilled_belly: 40,
      garlic_neck: 50,
      belly_ssam: 65,
      honey_rabbit: 70,
      shiitake_grill: 18,
      rib_stew: 80,
      baeksuk: 90,
      chicken_perilla: 55,
    },
    premiumBonus: 0.25,
    tipRate: 0.3,
    happyAt: 0.75,
    rep: { happy: 1, left: -2 },
  },
  // hands-on cooking (cooking-service design 2); first guesses, tuned in play
  cooking: {
    grill: {
      preheatMs: 6000,
      stickBelow: 0.7,
      edgeHeat: 0.45,
      sideMs: 9000,
      charMs: 6000,
      cutFaceMs: 2500,
      cutReady: 0.6,
      fatPerSec: 0.12,
      fatZoneY: 0.55,
      fatNeeded: 0.3,
      friedMs: 3000,
      sootPerChar: 0.5,
      sootPerFatSec: 0.004,
      coreLagMs: 4000,
      restLagMs: 1000,
      restNeededMs: 2500,
      saltEarlyBelow: 0.2,
      saltMax: 3,
    },
    pot: {
      heatPerSec: [0, 4, 7, 11],
      coolPerSec: 3,
      lidBoost: 1.6,
      target: [20, 96, 100, 100],
      cookFrom: 90,
      boilOverMs: 10000,
      foamPerSec: 0.06,
      skimAmount: 0.3,
    },
    items: {
      boar_belly: { grillRate: 1, burnAt: 1.5, potRate: 1 / 25, thick: 0.4 },
      boar_neck: { grillRate: 0.75, burnAt: 1.4, potRate: 1 / 25, thick: 1.2 },
      boar_rib: { grillRate: 0.85, burnAt: 1.3, potRate: 1 / 30, thick: 1 },
      rabbit_leg: { grillRate: 0.8, burnAt: 1.35, potRate: 1 / 25, thick: 1 },
      honeycomb: { grillRate: 1.6, burnAt: 1.05, oneSide: true, potRate: 1 / 5, soft: true, thick: 0 },
      chicken_thigh: { grillRate: 0.7, burnAt: 1.35, potRate: 1 / 35, thick: 1.2 },
      chicken_breast: { grillRate: 0.85, burnAt: 1.3, potRate: 1 / 20, thick: 0.9 },
      shiitake: { grillRate: 1.3, burnAt: 1.5, potRate: 1 / 10, soft: true, thick: 0 },
      wild_garlic: { grillRate: 1.4, burnAt: 1.4, potRate: 1 / 12, soft: true, thick: 0 },
      perilla: { grillRate: 2, burnAt: 1.2, oneSide: true, potRate: 1 / 6, soft: true, thick: 0 },
    },
  },
};
