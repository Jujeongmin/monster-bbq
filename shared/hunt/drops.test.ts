import { describe, expect, it } from "vitest";
import { MONSTERS } from "../content/monsters";
import { dropFor } from "./drops";

describe("dropFor", () => {
  it("gives the same part for the same hunt and spawn", () => {
    expect(dropFor(11, { id: "s3", monster: "boar" })).toBe(dropFor(11, { id: "s3", monster: "boar" }));
  });
  it("only gives parts from the monster's own table", () => {
    const allowed = MONSTERS.boar.drops.map(([item]) => item as string);
    for (let i = 0; i < 50; i++) expect(allowed).toContain(dropFor(i, { id: `s${i}`, monster: "boar" }));
    expect(dropFor(5, { id: "s1", monster: "rabbit" })).toBe("rabbit_leg");
  });
  it("follows the table's weights over many hunts", () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const item = dropFor(i * 7919, { id: `s${i % 40}`, monster: "boar" });
      counts[item] = (counts[item] ?? 0) + 1;
    }
    // weights 5 : 3 : 2
    expect(counts.boar_belly / 3000).toBeCloseTo(0.5, 1);
    expect(counts.boar_neck / 3000).toBeCloseTo(0.3, 1);
    expect(counts.boar_rib / 3000).toBeCloseTo(0.2, 1);
  });
});
