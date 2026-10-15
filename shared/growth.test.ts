import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "./actions";
import { BALANCE } from "./balance";
import { bagSlots, huntStats, level, lunchSlots, maxLevel, menuSlots, nextCost, seatBonus, toolQuality, UPGRADE_IDS } from "./growth";
import { planHunt } from "./hunt/plan";
import { planService } from "./service/plan";
import { newSave, readSave } from "./save";

const ctx: ActionContext = { now: 0, random: () => 0.5, recipes: null };
const U = BALANCE.upgrades;
const buy = (s: ReturnType<typeof newSave>, id: string) => applyAction(s, { type: "buyUpgrade", id }, ctx);

describe("upgrade levels", () => {
  it("starts gear at level 1 and tools not owned (level 0)", () => {
    const s = newSave();
    expect(level(s, "melee")).toBe(1);
    expect(level(s, "bag")).toBe(1);
    expect(level(s, "pot")).toBe(0);
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
  it("adds a cooking method when a tool is bought", () => {
    const r = buy({ ...newSave(), gold: 5000 }, "pot");
    expect(r.save.tools).toContain("boil");
    expect(level(r.save, "pot")).toBe(1);
  });
  it("refuses without enough gold, past the last level, on a locked level and for unknown ids, leaving the save alone", () => {
    const poor = { ...newSave(), gold: U.melee.costs[0] - 1 };
    expect(buy(poor, "melee")).toEqual({ save: poor, error: "no_gold" });
    const maxed = { ...newSave(), gold: 99_999, upgrades: { ranged: maxLevel("ranged") } };
    expect(buy(maxed, "ranged")).toEqual({ save: maxed, error: "max_level" });
    const atLock = { ...newSave(), gold: 99_999, upgrades: { melee: 3 } };
    expect(buy(atLock, "melee")).toEqual({ save: atLock, error: "locked" });
    expect(buy({ ...newSave(), gold: 99_999 }, "wok").error).toBe("locked");
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
  it("gives stronger hunts, a bigger bag, more menu slots, more guests and kinder tools by level", () => {
    expect(huntStats(newSave())).toEqual({ meleeDamage: 10, rangedDamage: 5, rangedRange: 1, maxHp: 100 });
    expect(huntStats(at({ melee: 3, ranged: 2, armor: 4 }))).toEqual({ meleeDamage: 19, rangedDamage: 8, rangedRange: 1.1, maxHp: 220 });
    expect(bagSlots(newSave())).toBe(12);
    expect(bagSlots(at({ bag: 3 }))).toBe(18);
    expect(menuSlots(at({ menu: 2 }))).toBe(3);
    expect(seatBonus(at({ seats: 3 }))).toBe(2);
    expect(toolQuality(at({ grillQuality: 3 }), "grill")).toBe(1.3);
    expect(toolQuality(newSave(), "boil")).toBe(1);
    expect(lunchSlots(at({ lunchbox: 2 }))).toBe(2);
  });
  it("lets the server take a 15-item haul once the bag is upgraded", () => {
    const start = applyAction({ ...newSave(), upgrades: { bag: 2 } }, { type: "startHunt", zone: "forest" }, { ...ctx, now: 1_000_000 }).save;
    const plan = planHunt(start.hunt!.seed, "forest");
    const kills = [...plan.spawns.filter((s) => s.wave === 0), ...plan.spawns.filter((s) => s.wave === 1)].slice(0, 15).map((s) => ({ kill: s.id, grade: "normal" }));
    const r = applyAction(start, { type: "finishHunt", huntId: start.hunt!.id, events: kills, ko: false }, { ...ctx, now: 1_000_000 + 15 * BALANCE.hunt.minMsPerKill });
    expect(Object.values(r.save.items).reduce((a, b) => a + b, 0)).toBe(15);
  });
  it("lets tonight's menu hold more dishes after the menu upgrade", () => {
    const cookbook = { grilled_belly: { method: "grill" as const, items: ["boar_belly" as const] }, garlic_neck: { method: "grill" as const, items: ["boar_neck" as const] }, shiitake_grill: { method: "grill" as const, items: ["shiitake" as const] } };
    const three = { type: "setMenu", dishes: ["grilled_belly", "garlic_neck", "shiitake_grill"] };
    expect(applyAction({ ...newSave(), cookbook }, three, ctx).error).toBe("bad_menu");
    expect(applyAction({ ...newSave(), cookbook, upgrades: { menu: 2 } }, three, ctx).error).toBeUndefined();
  });
  it("brings one more guest a night per seat level, the same way for the server and the page", () => {
    const opts = { day: 1, reputation: 0, menu: ["grilled_belly" as const] };
    expect(planService(5, { ...opts, seats: 1 })).toHaveLength(planService(5, opts).length + 1);
  });
});
