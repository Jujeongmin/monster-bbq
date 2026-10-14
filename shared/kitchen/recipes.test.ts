import { describe, expect, it } from "vitest";
// The server's answer table, checked here (test files never reach the client bundle).
import { RECIPES } from "../../server/src/recipes";
import { DISHES, METHODS } from "../content/dishes";
import { ITEMS } from "../content/items";

describe("server recipe table", () => {
  it("has exactly the public dish list", () => {
    expect(Object.keys(RECIPES).sort()).toEqual(Object.keys(DISHES).sort());
  });
  it("uses 1 to 3 different known items and a known method in every recipe", () => {
    for (const r of Object.values(RECIPES)) {
      expect(r.items.length).toBeGreaterThanOrEqual(1);
      expect(r.items.length).toBeLessThanOrEqual(3);
      expect(new Set(r.items).size).toBe(r.items.length);
      for (const id of r.items) expect(Object.keys(ITEMS)).toContain(id);
      expect(METHODS).toContain(r.method);
    }
  });
  it("never uses the same items and method for two dishes", () => {
    const combos = Object.values(RECIPES).map((r) => `${r.method}:${[...r.items].sort().join("+")}`);
    expect(new Set(combos).size).toBe(combos.length);
  });
});
