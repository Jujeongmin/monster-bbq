import { describe, expect, it } from "vitest";
import { powerOf } from "./power";
import { rankEntry, sameRank } from "./ranking";
import { newSave } from "./save";

describe("a shop's line on the ranking (user 2026-10-21)", () => {
  it("carries the shop's name, its power and its VIP level, worked out from the save", () => {
    const s = { ...newSave(), shopName: "곰네", vip: { spent: 600, day: 0 } };
    expect(rankEntry(s)).toEqual({ name: "곰네", power: powerOf(s).total, vip: 2 });
  });
  it("is rewritten only when one of them changes", () => {
    const a = rankEntry(newSave());
    expect(sameRank(a, rankEntry({ ...newSave(), gold: 999 }))).toBe(true);
    expect(sameRank(a, rankEntry({ ...newSave(), shopName: "곰네" }))).toBe(false);
  });
});
