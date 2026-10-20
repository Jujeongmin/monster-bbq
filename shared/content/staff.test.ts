import { describe, expect, it } from "vitest";
import { STAFF, STAFF_IDS, statOf } from "./staff";

describe("Grandma's old friends", () => {
  it("are four common, four rare, two hero and two legend", () => {
    const count = (r: string) => STAFF_IDS.filter((id) => STAFF[id].rarity === r).length;
    expect([count("common"), count("rare"), count("hero"), count("legend")]).toEqual([4, 4, 2, 2]);
  });
  it("add up to 140, 190, 240 and 300 by rarity", () => {
    const sums = { common: 140, rare: 190, hero: 240, legend: 300 } as const;
    for (const id of STAFF_IDS) {
      const s = STAFF[id].stats;
      expect(s.serving + s.cooking + s.dexterity + s.charm, id).toBe(sums[STAFF[id].rarity]);
    }
  });
  it("grow a tenth a star", () => {
    expect(statOf("jang", "cooking", 2)).toBe(145);
    expect(statOf("park", "dexterity", 0)).toBe(70);
  });
});
