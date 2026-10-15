import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "./actions";
import { BALANCE } from "./balance";
import { ammoOf, bagSlots, huntStats, ownsSide, sleepFallMs, level, lunchSlots, maxLevel, menuSlots, nextCost, seatBonus, UPGRADE_IDS } from "./growth";
import { planFloor } from "./hunt/plan";
import { planService } from "./service/plan";
import { newSave, readSave } from "./save";

const ctx: ActionContext = { now: 0, random: () => 0.5 };
const U = BALANCE.upgrades;
const buy = (s: ReturnType<typeof newSave>, id: string) => applyAction(s, { type: "buyUpgrade", id }, ctx);

describe("upgrade levels", () => {
  it("starts every upgrade at its base level", () => {
    const s = newSave();
    for (const id of UPGRADE_IDS) expect(level(s, id)).toBe(U[id].base);
    expect(maxLevel("melee")).toBe(1 + U.melee.costs.length);
    expect(nextCost(s, "melee")).toBe(U.melee.costs[0]);
  });
});

describe("buyUpgrade", () => {
  it("takes the cost and raises the level", () => {
    const s = { ...newSave(), gold: 5000 };
    const r = buy(s, "melee");
    expect(r.error).toBeUndefined();
    expect(r.save.gold).toBe(5000 - U.melee.costs[0]);
    expect(level(r.save, "melee")).toBe(2);
    expect(nextCost(r.save, "melee")).toBe(U.melee.costs[1]);
  });
  it("refuses without enough gold, past the last level, on a locked level and for unknown ids, leaving the save alone", () => {
    const poor = { ...newSave(), gold: U.melee.costs[0] - 1 };
    expect(buy(poor, "melee")).toEqual({ save: poor, error: "no_gold" });
    const maxed = { ...newSave(), gold: 99_999, upgrades: { ranged: maxLevel("ranged") } };
    expect(buy(maxed, "ranged")).toEqual({ save: maxed, error: "max_level" });
    const atLock = { ...newSave(), gold: 99_999, upgrades: { melee: 3 } };
    expect(buy(atLock, "melee")).toEqual({ save: atLock, error: "locked" });
    expect(buy({ ...newSave(), gold: 99_999 }, "rocket").error).toBe("bad_action");
  });
  it("has a cost for every level step it offers", () => {
    for (const id of UPGRADE_IDS) expect(U[id].costs.length).toBeGreaterThan(0);
  });
});

describe("reading upgrades from a save", () => {
  it("keeps known levels within range and drops the rest", () => {
    const r = readSave({ ...newSave(), upgrades: { melee: 3, bag: 99, armor: -2, rocket: 4, pot: "1" } });
    expect(r.upgrades).toEqual({ melee: 3 });
  });
});

describe("upgrade effects", () => {
  const at = (upgrades: Record<string, number>) => ({ ...newSave(), upgrades });
  it("gives stronger hunts, a bigger bag, more menu slots, more guests by level", () => {
    expect(huntStats(newSave())).toEqual({ meleeDamage: 10, rangedDamage: 5, rangedRange: 1, maxHp: 100, damageTaken: 1 });
    expect(huntStats(at({ melee: 3, ranged: 2, armor: 4, tank: 4 }))).toEqual({ meleeDamage: 19, rangedDamage: 8, rangedRange: 1.1, maxHp: 220, damageTaken: 0.7 });
    expect(bagSlots(newSave())).toBe(12);
    expect(bagSlots(at({ bag: 3 }))).toBe(18);
    expect(menuSlots(at({ menu: 2 }))).toBe(3);
    expect(seatBonus(at({ seats: 3 }))).toBe(2);
    expect(lunchSlots(at({ lunchbox: 2 }))).toBe(2);
  });
  it("lets the server take a 15-item haul once the bag is upgraded", () => {
    const start = applyAction({ ...newSave(), upgrades: { bag: 2 } }, { type: "startHunt", zone: "forest", side: "sling" }, { ...ctx, now: 1_000_000 }).save;
    const plan = planFloor(start.hunt!.seed, 1, "morning");
    const kills = [...plan.spawns.filter((s) => s.wave === 0), ...plan.spawns.filter((s) => s.wave === 1)].slice(0, 15).map((s) => ({ take: s.id, how: "down" }));
    const r = applyAction(start, { type: "finishHunt", huntId: start.hunt!.id, events: kills, exit: "1-e0", ko: false }, { ...ctx, now: 1_000_000 + 15 * BALANCE.hunt.minMsPerKill });
    expect(Object.values(r.save.items).reduce((a, b) => a + b, 0)).toBe(15);
  });
  it("lets tonight's menu hold more dishes after the menu upgrade", () => {
    const kitchen = { ...newSave(), stage: "kitchen" as const, dishes: { grilled_belly: 1, garlic_neck: 1, shiitake_grill: 1 }, items: { "boar_belly:normal": 1, "boar_neck:normal": 1, wild_garlic: 1, shiitake: 1 } };
    const three = { type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }, { dish: "garlic_neck", sets: 1 }, { dish: "shiitake_grill", sets: 1 }] };
    expect(applyAction(kitchen, three, ctx).error).toBe("bad_menu");
    expect(applyAction({ ...kitchen, upgrades: { menu: 2 } }, three, ctx).error).toBeUndefined();
  });

  it("brings one more guest a night per seat level, the same way for the server and the page", () => {
    const opts = { day: 1, reputation: 0, menu: ["grilled_belly" as const] };
    expect(planService(5, { ...opts, seats: 1 })).toHaveLength(planService(5, opts).length + 1);
  });
});

describe("side weapons in the upgrade shop", () => {
  it("starts with the slingshot only; the others are bought with gold", () => {
    const s = newSave();
    expect([ownsSide(s, "sling"), ownsSide(s, "sleepGun"), ownsSide(s, "netGun"), ownsSide(s, "firecracker")]).toEqual([true, false, false, false]);
    expect(ammoOf(s, "sling")).toBe(12);
    expect(ammoOf(s, "sleepGun")).toBe(0);
    const bought = buy({ ...s, gold: 800 }, "sleepGun").save;
    expect([ownsSide(bought, "sleepGun"), ammoOf(bought, "sleepGun"), bought.gold]).toEqual([true, 4, 0]);
  });
  it("puts the sleep dart to work faster at levels 2 and 3", () => {
    expect([sleepFallMs({ upgrades: { sleepGun: 1 } }), sleepFallMs({ upgrades: { sleepGun: 2 } }), sleepFallMs({ upgrades: { sleepGun: 3 } })]).toEqual([1500, 1000, 600]);
  });
});
