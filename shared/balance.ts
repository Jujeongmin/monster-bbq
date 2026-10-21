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
    // the capture gauge: where it starts, each tap by harpoon level, its drain, the fastest a capture can be;
    // the health it must be down to first (a boss far lower) and how much harder each monster holds on
    capture: { start: number; tap: number[]; decayPerSec: number; minMs: number; maxHp: number; bossMaxHp: number; resist: Partial<Record<MonsterId, number>> };
    // sleep-dart hits that put each monster to sleep, and how long it then sleeps
    sleepHits: Record<MonsterId, number>;
    sleepMs: number;
    // monsters this small (radius) are caught outright by the net; bigger ones are only tied up
    netSmallMaxRadius: number;
    netBindMs: number;
    sling: { damage: number; stunMs: number; range: number; speed: number };
    firecracker: { radius: number; stunMs: number; range: number };
    // the deep floors' monsters (plan 08c): frog general, water snake, cave bats, glow-shroom crab
    deep: {
      frog: { speed: number; reach: number; width: number; restMs: number; puffMs: number; lashMs: number; retractMs: number; damage: number; pull: number };
      snake: { speed: number; sense: number; rippleMs: number; biteRange: number; damage: number; exposedMs: number; openMs: number };
      bat: { speed: number; sense: number; foldMs: number; diveSpeed: number; diveMs: number; hitRadius: number; damage: number; dazedMs: number };
      crab: { speed: number; reach: number; clawMs: number; recoverMs: number; damage: number; frontMul: number; flippedMul: number; flippedMs: number };
    };
    // the Charge King (plan 08d, user-approved draft 2026-10-16): wall charges (stunned when he hits a
    // wall), falling rocks, piglets; angry below angryAt of his health (faster, charges twice)
    king: {
      wanderSpeed: number;
      aggroRange: number;
      chargeTelegraphMs: number;
      chargeSpeed: number;
      chargeDamage: number;
      stunMs: number; // stunned and out of breath he is open: hits count as counters
      chargeMaxMs: number; // a charge that meets no wall stops after this
      rockTelegraphMs: number;
      rocks: number;
      rockRadius: number;
      rockDamage: number;
      roarMs: number;
      piglets: number; // a call brings this many
      maxPiglets: number;
      breatherMs: number; // between patterns
      angryAt: number;
      angryMul: number;
      minBossMs: number; // the server's floor: no faster than this from arriving in the den
    };
    // the tusk boss (hunt v3 design 4.7): how often it is on floor 2, how it moves, its three patterns
    tusk: {
      chance: number;
      wanderSpeed: number;
      aggroRange: number;
      chargeSpeed: number;
      telegraphMs: number;
      chargeMs: number;
      charges: number;
      chargeGapMs: number;
      slamTelegraphMs: number;
      slamRadius: number;
      slamDamage: number;
      grabRange: number;
      grabRushSpeed: number;
      grabRushMs: number;
      grabMashes: number;
      grabMs: number;
      grabDamage: number;
      recoverMs: number;
      contactDamage: number;
      angryMul: number;
    };
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
  // mats: the deep floors' materials each next level also costs (plan 08c), level by level
  upgrades: Record<UpgradeId, { base: 0 | 1; costs: number[]; locked?: number[]; mats?: { item: ItemId; n: number }[][] }>;
  // lunchbox effects on the hunt: health back per gold of the dish's price, and a few dishes that
  // also put a spring in the step
  lunch: { healPerGold: number; speedDishes: DishId[]; speedMul: number; speedMs: number };
  // postcards to Grandma's old friends (staff design 6): rates published in the game, a legend by the
  // hundredth, a hero in every ten
  staff: { rates: Record<"legend" | "hero" | "rare" | "common", number>; pity: number; cost: { one: number; ten: number }; shards: { dupe: number; dupeLegend: number } };
  // what each upgrade level does (index = level - 1)
  growth: {
    staffSlots: number[];
    meleeDamage: number[];
    rangedDamage: number[];
    rangedRange: number[];
    // stamina by the tank's level, damage taken by the armour's, the lantern's light radius
    maxHp: number[];
    damageTaken: number[];
    light: number[];
    bag: number[];
    menu: number[];
    seats: number[];
    lunch: number[];
    shoes: number[];
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
    openMs: number; // the doors stay open this long (Dave's clock); the last guest comes before lastArrivalMs
    lastArrivalMs: number;
    gapJitter: number; // arrivals spread evenly, each moved by up to this share of the gap
    patienceMs: [number, number];
    orderDelayMs: number; // a guest orders this long after sitting down (a dirty grill must be scrubbed by then)
    eatMs: number;
    minMsPerServe: number; // no faster than this per plate (server check)
    rep: { happy: number; left: number; badDrink: number };
    tipRate: number; // a plate's tip, share of its price
    teaMul: number; // a perfect barley tea multiplies the tip
    messy: number; // share of guests who leave the grill dirty
    cleanTip: number; // gold for scrubbing a dirty grill
    // what each guest wants to drink (shares of 1, the rest want none), its price, the pour's marks
    drinks: {
      tea: number;
      after: number; // cider or sikhye, half each
      price: { tea: number; cider: number; sikhye: number };
      perfectMul: number;
      fillMs: number; // a glass fills while Space is held
      line: number; // the mark to stop at (share of the glass)
      perfect: number; // within this of the line
      good: number;
    };
    // charcoal (Dave's wasabi): each dish Bandal starts burns perDish % (the big bin's level); at none he
    // waits. A press adds `press` (only `pressHigh` above `high`) and keeps the waiter's hands busy.
    charcoal: { perDish: number[]; press: number; high: number; pressHigh: number; pressMs: number };
    // a dirty grill takes this many presses of this long each
    scrub: { presses: number; pressMs: number };
    pass: number; // plates the kitchen window holds
    walk: { speed: number; runMul: number; carryMul: number };
  };
  // awakening (06b-1, user-approved 2026-10-16): stars 1-20, each ×mul; gold = goldPerStarSq × star² up
  // to goldUntil, charcoal by the star reached
  awaken: { mul: number; goldPerStarSq: number; goldUntil: number; charcoal: number[] };
  // the VX shop (06b-1, user-approved 2026-10-16): 30 charcoal = 100 VX is the value line; VIP levels by VX
  // spent, each adding a share to charcoal bundles and vipDaily charcoal a day per level; the first boss
  // of a chapter gives bossCharcoal the first time
  shop: { charcoalPerVx: number; vipAt: number[]; vipBonus: number[]; vipDaily: number; bossCharcoal: number; keepPurchases: number };
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
    // user, 2026-10-21: weaken it first (half health, a boss a tenth), and the big ones hold on harder
    capture: { start: 0.35, tap: [0.09, 0.1, 0.11], decayPerSec: 0.25, minMs: 1200, maxHp: 0.5, bossMaxHp: 0.1, resist: { boar: 1.5, frog: 1.5, snake: 1.5, crab: 2, tusk: 3, king: 3 } },
    sleepHits: { rabbit: 1, chicken: 1, bee: 1, boar: 2, tusk: 5, king: 10, piglet: 1, frog: 2, snake: 1, bat: 1, crab: 2 },
    sleepMs: 15000,
    netSmallMaxRadius: 8,
    netBindMs: 3000,
    sling: { damage: 3, stunMs: 1200, range: 200, speed: 320 },
    firecracker: { radius: 60, stunMs: 1500, range: 150 },
    deep: {
      frog: { speed: 20, reach: 110, width: 12, restMs: 800, puffMs: 600, lashMs: 400, retractMs: 500, damage: 10, pull: 40 },
      snake: { speed: 30, sense: 70, rippleMs: 500, biteRange: 30, damage: 14, exposedMs: 2000, openMs: 900 },
      bat: { speed: 60, sense: 140, foldMs: 400, diveSpeed: 220, diveMs: 500, hitRadius: 10, damage: 8, dazedMs: 900 },
      crab: { speed: 14, reach: 26, clawMs: 500, recoverMs: 600, damage: 12, frontMul: 0.3, flippedMul: 2, flippedMs: 3000 },
    },
    king: {
      wanderSpeed: 26,
      // the den is small: he takes the hunter on from the moment they come down
      aggroRange: 700,
      chargeTelegraphMs: 900,
      chargeSpeed: 260,
      chargeDamage: 28,
      stunMs: 3000,
      chargeMaxMs: 3000,
      rockTelegraphMs: 900,
      rocks: 5,
      rockRadius: 26,
      rockDamage: 18,
      roarMs: 800,
      piglets: 2,
      maxPiglets: 4,
      breatherMs: 1200,
      angryAt: 0.5,
      angryMul: 1.3,
      minBossMs: 25_000,
    },
    tusk: {
      chance: 0.6,
      wanderSpeed: 22,
      aggroRange: 150,
      chargeSpeed: 210,
      telegraphMs: 700,
      chargeMs: 650,
      charges: 3,
      chargeGapMs: 450,
      slamTelegraphMs: 900,
      slamRadius: 70,
      slamDamage: 20,
      grabRange: 24,
      grabRushSpeed: 150,
      grabRushMs: 1200,
      grabMashes: 12,
      grabMs: 2500,
      grabDamage: 35,
      recoverMs: 2000,
      contactDamage: 22,
      angryMul: 1.3,
    },
    bagSlots: 12,
  },
  // what each item is worth raw (premium parts pay double); lunches and the retired item shop priced by it
  economy: {
    itemPrice: {
      boar_belly: { normal: 15, premium: 30 },
      boar_neck: { normal: 14, premium: 28 },
      boar_rib: { normal: 18, premium: 36 },
      king_rib: { normal: 60, premium: 120 },
      rabbit_leg: { normal: 12, premium: 24 },
      honeycomb: { normal: 16, premium: 32 },
      chicken_thigh: { normal: 13, premium: 26 },
      chicken_breast: { normal: 11, premium: 22 },
      shiitake: { normal: 6 },
      wild_garlic: { normal: 5 },
      perilla: { normal: 4 },
      frog_leg: { normal: 16, premium: 32 },
      snake_meat: { normal: 18, premium: 36 },
      crab_meat: { normal: 22, premium: 44 },
      frog_skin: { normal: 20 },
      snake_scale: { normal: 24 },
      bat_wing: { normal: 18 },
      crab_shell: { normal: 30 },
      glow_mushroom: { normal: 26 },
      iron_ore: { normal: 35 },
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
    // the apron armour takes damage off now (plan 08c); its old job, stamina, went to the tank
    armor: { base: 1, costs: [500, 1200, 2500], mats: [[{ item: "frog_skin", n: 2 }], [{ item: "crab_shell", n: 2 }], [{ item: "iron_ore", n: 3 }]] },
    bag: { base: 1, costs: [200, 500, 1000, 2000] },
    menu: { base: 1, costs: [400, 1200, 3000] },
    seats: { base: 1, costs: [800, 1600] },
    lunchbox: { base: 1, costs: [300, 1500] },
    // side weapons (hunt v3 design 4.4, user-approved draft 2026-10-15): gold only until the deep floors' parts (stage 3)
    sling: { base: 1, costs: [600, 1500] },
    sleepGun: { base: 0, costs: [800, 2000, 4500] },
    netGun: { base: 0, costs: [1200, 3000] },
    firecracker: { base: 0, costs: [500] },
    // gear (hunt v3 design 4.5, user-approved draft numbers 2026-10-15)
    boots: { base: 0, costs: [400] },
    lantern: { base: 0, costs: [600, 1500, 3000], mats: [[{ item: "frog_skin", n: 3 }], [{ item: "snake_scale", n: 4 }, { item: "glow_mushroom", n: 2 }], [{ item: "iron_ore", n: 4 }]] },
    // the night shop (plan 07b, user-approved draft numbers 2026-10-16)
    shoes: { base: 1, costs: [500, 1500] },
    coalBin: { base: 1, costs: [600, 1800] },
    // Grandma's old friends at work (staff design): one to start, three at most
    staffSlots: { base: 1, costs: [1500, 4000] },
    tank: { base: 1, costs: [600, 1500, 3000], mats: [[{ item: "frog_skin", n: 2 }], [{ item: "snake_scale", n: 3 }], [{ item: "crab_shell", n: 3 }]] },
  },
  staff: { rates: { legend: 0.01, hero: 0.05, rare: 0.25, common: 0.69 }, pity: 100, cost: { one: 30, ten: 270 }, shards: { dupe: 1, dupeLegend: 3 } },
  lunch: { healPerGold: 0.8, speedDishes: ["honey_rabbit", "baeksuk"], speedMul: 1.2, speedMs: 10000 },
  growth: {
    meleeDamage: [10, 14, 19, 26],
    rangedDamage: [5, 8, 12],
    rangedRange: [1, 1.1, 1.1],
    maxHp: [100, 130, 170, 220],
    damageTaken: [1, 0.9, 0.8, 0.7],
    light: [90, 130, 170],
    bag: [12, 15, 18, 21, 24],
    menu: [2, 3, 4, 5],
    staffSlots: [1, 2, 3],
    // stools at the counter (the seats upgrade)
    // three to start, five at most, spaced wide like Dave's bar (user, 2026-10-16)
    seats: [3, 4, 5],
    lunch: [1, 2, 3],
    shoes: [1, 1.1, 1.2],
    ammo: { sling: [12, 16, 20], sleepGun: [4, 5, 6], netGun: [2, 3], firecracker: [3] },
    sleepFallMs: [1500, 1000, 600],
  },
  // the night service (restaurant v2 design 4); first guesses, tuned in play
  service: {
    baseCustomers: 10,
    perReputation: 5,
    minCustomers: 10,
    maxCustomers: 24,
    firstArriveMs: 3000,
    openMs: 180_000,
    lastArrivalMs: 160_000,
    gapJitter: 0.4,
    patienceMs: [30000, 45000],
    orderDelayMs: 2500,
    eatMs: 6000,
    minMsPerServe: 2500,
    rep: { happy: 1, left: -2, badDrink: -1 },
    tipRate: 0.1,
    teaMul: 1.5,
    messy: 0.4,
    cleanTip: 25,
    drinks: { tea: 0.3, after: 0.3, price: { tea: 0, cider: 15, sikhye: 20 }, perfectMul: 1.5, fillMs: 1200, line: 0.7, perfect: 0.06, good: 0.15 },
    charcoal: { perDish: [8, 6, 4], press: 15, high: 80, pressHigh: 5, pressMs: 350 },
    scrub: { presses: 4, pressMs: 250 },
    pass: 5,
    // game pixels a second on the 960-wide shop
    walk: { speed: 165, runMul: 1.6, carryMul: 0.9 },
  },
  awaken: { mul: 1.1, goldPerStarSq: 200, goldUntil: 10, charcoal: [5, 8, 10, 14, 18, 22, 26, 30, 35, 40, 120, 160, 200, 260, 320, 380, 460, 540, 560, 600] },
  shop: { charcoalPerVx: 0.3, vipAt: [100, 500, 1500, 3000, 6000, 12000, 25000, 45000, 70000, 100000], vipBonus: [0.02, 0.04, 0.06, 0.08, 0.1, 0.13, 0.16, 0.19, 0.22, 0.25], vipDaily: 2, bossCharcoal: 50, keepPurchases: 200 },
};
