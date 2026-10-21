import { describe, expect, it } from "vitest";
import { applyAction } from "./actions";
import { BALANCE } from "./balance";
import { claimPowerRewards, powerOf } from "./power";
import { newSave, readSave, type SaveData } from "./save";

const P = BALANCE.power;
const ctx = { now: 1_000_000, random: () => 0.5 };

describe("the shop's power, one number for the ranking (user 2026-10-21)", () => {
  it("counts a fresh save's one known dish", () => {
    expect(powerOf(newSave())).toEqual({ gear: 0, dishes: P.dishKnown + P.dishLevel, staff: 0, total: P.dishKnown + P.dishLevel });
  });
  it("adds gear levels bought and awakening stars", () => {
    const s: SaveData = { ...newSave(), upgrades: { melee: 3, bag: 2 }, stars: { melee: 2, chicken_perilla: 1 } };
    // melee and bag start at level 1: 2 + 1 levels bought
    expect(powerOf(s).gear).toBe(3 * P.upgradeLevel + 2 * P.star);
    expect(powerOf(s).dishes).toBe(P.dishKnown + P.dishLevel + P.star);
  });
  it("weighs old friends by rarity and their stars", () => {
    const s: SaveData = { ...newSave(), staff: { ...newSave().staff, owned: { park: { shards: 0, stars: 0 }, baekdu: { shards: 0, stars: 2 } } } };
    expect(powerOf(s).staff).toBe(Math.round(P.rarity.common + P.rarity.legend * (1 + 2 * P.staffStar)));
  });
});

describe("power milestones", () => {
  it("pays each milestone's charcoal once, when the power first reaches it", () => {
    const rich: SaveData = { ...newSave(), staff: { ...newSave().staff, owned: { baekdu: { shards: 0, stars: 0 }, mumyeong: { shards: 0, stars: 0 } } } };
    const first = claimPowerRewards(rich);
    const reached = P.milestones.filter((m) => powerOf(rich).total >= m.at);
    expect(reached.length).toBeGreaterThan(0);
    expect(first.charcoal).toBe(reached.reduce((a, m) => a + m.charcoal, 0));
    expect(first.powerRewards).toEqual(reached.map((m) => m.at));
    expect(claimPowerRewards(first)).toEqual(first);
  });
  it("is paid by any action that raises the power (the server's own rules)", () => {
    const s: SaveData = { ...newSave(), staff: { ...newSave().staff, owned: { baekdu: { shards: 0, stars: 0 } } } };
    const r = applyAction(s, { type: "seeStory", id: "prologue" }, ctx);
    expect(r.save.powerRewards.length).toBeGreaterThan(0);
  });
});

describe("the shop's name", () => {
  it("takes 1 to 15 letters, trimmed", () => {
    expect(applyAction(newSave(), { type: "nameShop", name: "  철수네 고깃집 " }, ctx).save.shopName).toBe("철수네 고깃집");
    expect(applyAction(newSave(), { type: "nameShop", name: "" }, ctx).error).toBe("bad_name");
    expect(applyAction(newSave(), { type: "nameShop", name: "a".repeat(16) }, ctx).error).toBe("bad_name");
    expect(applyAction(newSave(), { type: "nameShop", name: 5 }, ctx).error).toBe("bad_name");
  });
  it("survives a reload, and an older save reads as unnamed with no rewards", () => {
    const named = applyAction(newSave(), { type: "nameShop", name: "곰네" }, ctx).save;
    expect(readSave(JSON.parse(JSON.stringify(named))).shopName).toBe("곰네");
    const old = { ...newSave() } as Record<string, unknown>;
    delete old.shopName;
    delete old.powerRewards;
    expect(readSave(old)).toMatchObject({ shopName: "", powerRewards: [] });
  });
});
