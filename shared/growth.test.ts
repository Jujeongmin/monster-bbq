import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "./actions";
import { BALANCE } from "./balance";
import { level, maxLevel, nextCost, UPGRADE_IDS } from "./growth";
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
