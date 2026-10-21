import { BALANCE } from "../balance";
import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "../actions";
import { STAFF } from "../content/staff";
import { newSave, type SaveData } from "../save";
import { rollRarity } from "./actions";

// a fixed stream of numbers in [0, 1)
const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const ctx = (random: () => number = lcg(7)): ActionContext => ({ now: 1, random });
// every power milestone already paid, so the charcoal counts only the postcards
const rich = (over: Partial<SaveData> = {}): SaveData => ({ ...newSave(), charcoal: 1000, gold: 100_000, powerRewards: BALANCE.power.milestones.map((m) => m.at), ...over });
const pull = (save: SaveData, count: 1 | 10, extra: object = {}, c = ctx()) => applyAction(save, { type: "summon", count, pullId: `p${Math.random()}`, ...extra }, c);
const owned = (s: SaveData) => Object.keys(s.staff.owned);

describe("postcards to Grandma's old friends (summon)", () => {
  it("follows the published rates", () => {
    const rand = lcg(42);
    const n = { legend: 0, hero: 0, rare: 0, common: 0 };
    for (let i = 0; i < 100_000; i++) n[rollRarity(rand, 0, false)]++;
    expect(n.legend / 1000).toBeGreaterThan(0.8);
    expect(n.legend / 1000).toBeLessThan(1.2);
    expect(n.hero / 1000).toBeGreaterThan(4.5);
    expect(n.hero / 1000).toBeLessThan(5.5);
    expect(n.rare / 1000).toBeGreaterThan(24);
    expect(n.rare / 1000).toBeLessThan(26);
    expect(n.common / 1000).toBeGreaterThan(68);
    expect(n.common / 1000).toBeLessThan(70);
  });
  it("gives a legend on the hundredth postcard without one", () => {
    const s = rich({ staff: { ...newSave().staff, sinceLegend: 99, pulls: 99, freeUsed: true } });
    const r = pull(s, 1, {}, ctx(() => 0.99));
    expect(r.error).toBeUndefined();
    expect(owned(r.save).map((id) => STAFF[id as keyof typeof STAFF].rarity)).toEqual(["legend"]);
    expect(r.save.staff.sinceLegend).toBe(0);
  });
  it("guarantees a hero or better in ten", () => {
    const r = pull(rich(), 10, {}, ctx(() => 0.99));
    const rarities = Object.entries(r.save.staff.owned).map(([id]) => STAFF[id as keyof typeof STAFF].rarity);
    expect(rarities.some((x) => x === "hero" || x === "legend")).toBe(true);
    expect(r.save.staff.pulls).toBe(10);
  });
  it("gives the first postcard free once", () => {
    const s0 = { ...newSave(), charcoal: 0 };
    const r = pull(s0, 1, { free: true });
    expect(r.error).toBeUndefined();
    expect(owned(r.save)).toHaveLength(1);
    expect(r.save.staff.freeUsed).toBe(true);
    expect(pull(r.save, 1, { free: true }).error).toBe("bad_action");
  });
  it("charges 30 and 270 golden charcoal, refuses without enough", () => {
    expect(pull(rich({ charcoal: 300 }), 1).save.charcoal).toBe(270);
    expect(pull(rich({ charcoal: 300 }), 10).save.charcoal).toBe(30);
    expect(pull(rich({ charcoal: 29 }), 1).error).toBe("no_charcoal");
    expect(pull(rich({ charcoal: 269 }), 10).error).toBe("no_charcoal");
  });
  it("turns a repeat into shards (three for a legend)", () => {
    // a constant 0.5 picks the third common (kkaebi); 0 picks the first legend
    const common = rich({ staff: { ...newSave().staff, owned: { kkaebi: { shards: 0, stars: 0 } } } });
    expect(pull(common, 1, {}, ctx(() => 0.5)).save.staff.owned.kkaebi).toEqual({ shards: 1, stars: 0 });
    const legend = rich({ staff: { ...newSave().staff, owned: { baekdu: { shards: 0, stars: 0 } } } });
    expect(pull(legend, 1, {}, ctx(() => 0)).save.staff.owned.baekdu).toEqual({ shards: 3, stars: 0 });
  });
  it("applies one pullId once", () => {
    const s0 = rich();
    const first = applyAction(s0, { type: "summon", count: 1, pullId: "same" }, ctx());
    const again = applyAction(first.save, { type: "summon", count: 1, pullId: "same" }, ctx());
    expect(again.save).toEqual(first.save);
  });
  it("refuses during the night or the hunt", () => {
    expect(pull(rich({ hunt: { id: "h", seed: 1, zone: "forest", period: "morning", side: "sling", startedAt: 1 } }), 1).error).toBe("wrong_stage");
  });
});

describe("putting friends to work (assignStaff)", () => {
  const two = rich({ staff: { ...newSave().staff, owned: { park: { shards: 0, stars: 0 }, dallae: { shards: 0, stars: 0 } } } });
  const assign = (s: SaveData, position: string, staffId: string | null) => applyAction(s, { type: "assignStaff", position, staffId }, ctx());
  it("assigns within the slots, moves a friend between positions, refuses during the night or the hunt or someone not owned", () => {
    const a = assign(two, "coal", "park");
    expect(a.save.staff.roster).toEqual({ coal: "park" });
    expect(assign(a.save, "drinks", "dallae").error).toBe("slot_full");
    expect(assign(a.save, "clean", "park").save.staff.roster).toEqual({ clean: "park" });
    expect(assign(a.save, "coal", null).save.staff.roster).toEqual({});
    const roomy = assign({ ...a.save, upgrades: { staffSlots: 2 } }, "drinks", "dallae");
    expect(roomy.save.staff.roster).toEqual({ coal: "park", drinks: "dallae" });
    expect(assign(two, "coal", "jang").error).toBe("not_owned");
    expect(assign({ ...two, stage: "kitchen", service: { id: "s", seed: 1, startedAt: 0, dishes: [], planMenu: [], adds: [], staff: {} } }, "coal", "park").error).toBe("wrong_stage");
    expect(assign(two, "sing", "park").error).toBe("bad_action");
  });
});

describe("awakening a friend (awakenStaff)", () => {
  it("awakens with shards and gold", () => {
    const s = rich({ gold: 1000, staff: { ...newSave().staff, owned: { park: { shards: 1, stars: 0 } } } });
    const r = applyAction(s, { type: "awakenStaff", staffId: "park", from: 0 }, ctx());
    expect(r.save.staff.owned.park).toEqual({ shards: 0, stars: 1 });
    expect(r.save.gold).toBe(800);
    expect(applyAction(r.save, { type: "awakenStaff", staffId: "park", from: 1 }, ctx()).error).toBe("no_shards");
    expect(applyAction(r.save, { type: "awakenStaff", staffId: "park", from: 0 }, ctx()).save).toEqual(r.save);
    expect(applyAction(s, { type: "awakenStaff", staffId: "jang", from: 0 }, ctx()).error).toBe("not_owned");
  });
});
