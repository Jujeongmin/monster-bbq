import { describe, expect, it } from "vitest";
import { DISHES, type DishId } from "../content/dishes";
import { isItemId } from "../content/items";
import { RECIPES } from "../content/recipes";
import { dishPrice, fitMenu, levelCost, MAX_DISH_LEVEL, planShop, platesPerSet, setsAvailable, takeSets } from "./dish";

describe("RECIPES", () => {
  it("has every dish once, made of 1 to 3 different known items, with a price and a cooking time", () => {
    expect(Object.keys(RECIPES).sort()).toEqual(Object.keys(DISHES).sort());
    for (const r of Object.values(RECIPES)) {
      expect(r.items.length).toBeGreaterThanOrEqual(1);
      expect(r.items.length).toBeLessThanOrEqual(3);
      expect(new Set(r.items).size).toBe(r.items.length);
      expect(r.items.every(isItemId)).toBe(true);
      expect(r.price).toBeGreaterThan(0);
      expect(r.cookMs).toBeGreaterThanOrEqual(3000);
      expect(r.cookMs).toBeLessThanOrEqual(6000);
    }
  });
});

describe("dish levels", () => {
  it("raises the price and the plates per set with the level", () => {
    expect(MAX_DISH_LEVEL).toBe(5);
    expect(dishPrice("grilled_belly", 1)).toBe(40);
    expect(dishPrice("grilled_belly", 2)).toBe(46);
    expect(dishPrice("grilled_belly", 5)).toBe(70);
    expect(platesPerSet(1)).toBe(3);
    expect(platesPerSet(5)).toBe(6);
  });
  it("prices research (level 1) and each next level in gold and sets, nothing past the top", () => {
    expect(levelCost("baeksuk", 1)).toEqual({ gold: 450, sets: 1 });
    expect(levelCost("grilled_belly", 2)).toEqual({ gold: 600, sets: 1 });
    expect(levelCost("grilled_belly", 5)).toEqual({ gold: 4000, sets: 4 });
    expect(levelCost("grilled_belly", 6)).toBeNull();
    expect(levelCost("grilled_belly", 0)).toBeNull();
  });
});

describe("takeSets", () => {
  it("uses regular parts first and counts the sets that needed a premium part", () => {
    const r = takeSets({ "boar_belly:premium": 1, "boar_belly:normal": 1 }, "grilled_belly", 2);
    expect(r).toEqual({ items: {}, premium: 1 });
  });
  it("takes one of each ingredient per set, forage by its plain key", () => {
    const r = takeSets({ "boar_belly:normal": 3, perilla: 2, wild_garlic: 2 }, "belly_ssam", 2);
    expect(r).toEqual({ items: { "boar_belly:normal": 1 }, premium: 0 });
  });
  it("is null when one ingredient runs out, and leaves the items it was given alone", () => {
    const items = { "boar_belly:normal": 3, perilla: 1, wild_garlic: 3 };
    expect(takeSets(items, "belly_ssam", 2)).toBeNull();
    expect(items).toEqual({ "boar_belly:normal": 3, perilla: 1, wild_garlic: 3 });
  });
});

describe("setsAvailable", () => {
  it("counts both grades, the scarcest ingredient decides", () => {
    expect(setsAvailable({ "boar_belly:normal": 2, "boar_belly:premium": 1, perilla: 2, wild_garlic: 5 }, "belly_ssam")).toBe(2);
    expect(setsAvailable({}, "grilled_belly")).toBe(0);
  });
});

describe("planShop", () => {
  const items = { "boar_belly:normal": 2, "boar_belly:premium": 1, perilla: 1, wild_garlic: 1 };
  const levels: Partial<Record<DishId, number>> = { grilled_belly: 2, belly_ssam: 1 };
  it("takes the sets line by line and prices each dish by level and premium share", () => {
    const r = planShop(items, levels, [{ dish: "grilled_belly", sets: 2 }, { dish: "belly_ssam", sets: 1 }]);
    expect(r).toEqual({
      items: {},
      dishes: [
        { dish: "grilled_belly", plates: 8, price: 46 },
        { dish: "belly_ssam", plates: 3, price: 78 },
      ],
    });
  });
  it("is null when two dishes sharing an ingredient ask for more than there is", () => {
    expect(planShop(items, levels, [{ dish: "grilled_belly", sets: 3 }, { dish: "belly_ssam", sets: 1 }])).toBeNull();
  });
});

describe("fitMenu", () => {
  it("cuts last night's sets down to what the items make now and drops lines with none", () => {
    const items = { "boar_belly:normal": 2, shiitake: 0 };
    const levels: Partial<Record<DishId, number>> = { grilled_belly: 1, shiitake_grill: 1 };
    expect(fitMenu(items, levels, [{ dish: "grilled_belly", sets: 5 }, { dish: "shiitake_grill", sets: 1 }])).toEqual([{ dish: "grilled_belly", sets: 2 }]);
  });
  it("drops dishes not researched", () => {
    expect(fitMenu({ "boar_belly:normal": 2 }, {}, [{ dish: "grilled_belly", sets: 1 }])).toEqual([]);
  });
});
