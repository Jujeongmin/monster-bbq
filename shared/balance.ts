import type { ChargerTuning } from "./hunt/charger";
import type { FleerTuning } from "./hunt/fleer";
import type { PackTuning } from "./hunt/pack";
import type { ShooterTuning } from "./hunt/shooter";
import type { HitTuning, WeaponKind, WeaponStats } from "./hunt/combat";
import type { DishId } from "./content/dishes";
import type { ItemId } from "./content/items";
import type { MonsterId } from "./content/monsters";
import type { UpgradeId } from "./content/upgrades";
import type { SideWeaponId } from "./content/sideWeapons";

// Every hunting number lives here. Prototype values from plan 01; tuned in the playtest.
export const BALANCE: {
  hunt: {
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
    // a hunt report needs at least this long per way down taken (server check, hunt v3 design 5.3)
    minMsPerFloor: number;
    // stars (hunt v3 design 4.2): what each way of taking a monster gives; the tusk boss gives bossMul times
    stars: Record<"down" | "capture" | "sleep" | "net", { count: number; grade: "normal" | "premium" }> & { bossMul: number };
    // the capture gauge: where it starts, each tap by harpoon level, its drain, the fastest a capture can be
    capture: { start: number; tap: number[]; decayPerSec: number; minMs: number };
    // sleep-dart hits that put each monster to sleep, and how long it then sleeps
    sleepHits: Record<MonsterId, number>;
    sleepMs: number;
    // monsters this small (radius) are caught outright by the net; bigger ones are only tied up
    netSmallMaxRadius: number;
    netBindMs: number;
    sling: { damage: number; stunMs: number; range: number; speed: number };
    firecracker: { radius: number; stunMs: number; range: number };
    bagSlots: number;
  };
  economy: { itemPrice: Record<ItemId, { normal: number; premium?: number }>; maxMeatPerHunt: number };
  kitchen: { menuSlots: number };
  // dish levels (restaurant v2 design 3): row i is level i+1 — its price multiplier, plates per set of
  // ingredients, and the cost to reach it (gold = times the dish's base price, sets of its own
  // ingredients; level 1's cost is the research). A set with a premium part sells for premiumBonus more.
  dishes: { levels: { price: number; plates: number; gold: number; sets: number }[]; premiumBonus: number };
  // per upgrade: its starting level, the cost of each next level, and target levels locked until later
  // chapters (boss parts, story); base 0 = not owned until bought (the side weapons)
  upgrades: Record<UpgradeId, { base: 0 | 1; costs: number[]; locked?: number[] }>;
  // lunchbox effects on the hunt: health back per gold of the dish's price, and a few dishes that
  // also put a spring in the step
  lunch: { healPerGold: number; speedDishes: DishId[]; speedMul: number; speedMs: number };
  // what each upgrade level does (index = level - 1)
  growth: {
    meleeDamage: number[];
    rangedDamage: number[];
    rangedRange: number[];
    maxHp: number[];
    bag: number[];
    menu: number[];
    seats: number[];
    lunch: number[];
    // side weapons: shots per hunt by level, and how fast the sleep dart works by its level
    ammo: Record<SideWeaponId, number[]>;
    sleepFallMs: number[];
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
    rep: { happy: number; left: number };
  };
} = {
  hunt: {
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
      handHeight: 15,
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
    // the world and its walkable ground are per floor now (shared/content/floors.ts)
    minMsPerFloor: 8000,
    // user-approved drafts (plan 08b), tuned in play
    stars: { down: { count: 1, grade: "normal" }, capture: { count: 2, grade: "normal" }, sleep: { count: 2, grade: "premium" }, net: { count: 2, grade: "premium" }, bossMul: 2 },
    capture: { start: 0.35, tap: [0.09, 0.1, 0.11], decayPerSec: 0.25, minMs: 1200 },
    sleepHits: { rabbit: 1, chicken: 1, bee: 1, boar: 2, tusk: 5 },
    sleepMs: 15000,
    netSmallMaxRadius: 8,
    netBindMs: 3000,
    sling: { damage: 3, stunMs: 1200, range: 200, speed: 320 },
    firecracker: { radius: 60, stunMs: 1500, range: 150 },
    bagSlots: 12,
  },
  // what each item is worth raw (premium parts pay double); lunches and the retired item shop priced by it
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
  kitchen: { menuSlots: 2 },
  // user-approved draft numbers 2026-10-15, tuned in play
  dishes: {
    levels: [
      { price: 1, plates: 3, gold: 5, sets: 1 },
      { price: 1.15, plates: 4, gold: 15, sets: 1 },
      { price: 1.3, plates: 4, gold: 30, sets: 2 },
      { price: 1.5, plates: 5, gold: 60, sets: 3 },
      { price: 1.75, plates: 6, gold: 100, sets: 4 },
    ],
    premiumBonus: 0.2,
  },
  // gold growth (growth design 2, user-approved draft numbers 2026-10-14)
  upgrades: {
    melee: { base: 1, costs: [300, 900, 2400], locked: [4] },
    ranged: { base: 1, costs: [400, 1500] },
    armor: { base: 1, costs: [300, 1000, 2800] },
    bag: { base: 1, costs: [200, 500, 1000, 2000] },
    menu: { base: 1, costs: [400, 1200, 3000] },
    seats: { base: 1, costs: [800, 1600, 3200, 6400] },
    lunchbox: { base: 1, costs: [300, 1500] },
    // side weapons (hunt v3 design 4.4, user-approved draft 2026-10-15): gold only until the deep floors' parts (stage 3)
    sling: { base: 1, costs: [600, 1500] },
    sleepGun: { base: 0, costs: [800, 2000, 4500] },
    netGun: { base: 0, costs: [1200, 3000] },
    firecracker: { base: 0, costs: [500] },
  },
  lunch: { healPerGold: 0.8, speedDishes: ["honey_rabbit", "baeksuk"], speedMul: 1.2, speedMs: 10000 },
  growth: {
    meleeDamage: [10, 14, 19, 26],
    rangedDamage: [5, 8, 12],
    rangedRange: [1, 1.1, 1.1],
    maxHp: [100, 130, 170, 220],
    bag: [12, 15, 18, 21, 24],
    menu: [2, 3, 4, 5],
    seats: [0, 1, 2, 3, 4],
    lunch: [1, 2, 3],
    ammo: { sling: [12, 16, 20], sleepGun: [4, 5, 6], netGun: [2, 3], firecracker: [3] },
    sleepFallMs: [1500, 1000, 600],
  },
  // the night service (restaurant v2 design 4); first guesses, tuned in play
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
    rep: { happy: 1, left: -2 },
  },
};
