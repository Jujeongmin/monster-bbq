import { describe, expect, it } from "vitest";
import type { DishId } from "../content/dishes";
import { hintsFor, judgeCook, servings, type Recipe } from "./cook";

// A small made-up table (the real one is the server's).
const TABLE = {
  grilled_belly: { method: "grill", items: ["boar_belly"] },
  belly_ssam: { method: "grill", items: ["boar_belly", "perilla", "wild_garlic"] },
  honey_rabbit: { method: "grill", items: ["rabbit_leg", "honeycomb"] },
  rib_stew: { method: "boil", items: ["boar_rib", "shiitake"] },
} as Record<DishId, Recipe>;

describe("judgeCook", () => {
  it("finds a dish from the same items (any order) and method", () => {
    expect(judgeCook(["wild_garlic", "boar_belly", "perilla"], "grill", TABLE, {})).toEqual({ kind: "new", dish: "belly_ssam" });
  });
  it("says known for a dish already in the cookbook", () => {
    expect(judgeCook(["boar_belly"], "grill", TABLE, { grilled_belly: TABLE.grilled_belly })).toEqual({ kind: "known", dish: "grilled_belly" });
  });
  it("hints at the method when only the method is wrong", () => {
    expect(judgeCook(["shiitake", "boar_rib"], "grill", TABLE, {})).toEqual({ kind: "near", hint: "method" });
  });
  it("hints at the taste of the one missing item", () => {
    expect(judgeCook(["rabbit_leg"], "grill", TABLE, {})).toEqual({ kind: "near", hint: "missing", taste: "sweet" });
  });
  it("hints at one item too many", () => {
    expect(judgeCook(["boar_rib", "shiitake", "perilla"], "boil", TABLE, {})).toEqual({ kind: "near", hint: "extra" });
  });
  it("prefers the missing hint when a try is both one short of one dish and one over another", () => {
    // belly + garlic: belly_ssam minus perilla, and grilled_belly plus garlic
    expect(judgeCook(["boar_belly", "wild_garlic"], "grill", TABLE, {})).toEqual({ kind: "near", hint: "missing", taste: "veg" });
  });
  it("hints for found dishes too (the hint is about this try)", () => {
    expect(judgeCook(["boar_belly"], "boil", TABLE, { grilled_belly: TABLE.grilled_belly })).toEqual({ kind: "near", hint: "method" });
  });
  it("flops when nothing is close", () => {
    expect(judgeCook(["chicken_breast", "honeycomb"], "fry", TABLE, {})).toEqual({ kind: "fail", method: "fry" });
  });
});

describe("hintsFor", () => {
  it("opens the hints of dishes not found yet that use the items, keeping open ones, in table order", () => {
    expect(hintsFor(["perilla"], TABLE, {}, ["rib_stew"])).toEqual(["belly_ssam", "rib_stew"]);
  });
  it("skips dishes already found", () => {
    expect(hintsFor(["boar_belly"], TABLE, { grilled_belly: TABLE.grilled_belly }, [])).toEqual(["belly_ssam"]);
  });
  it("opens nothing for unrelated items", () => {
    expect(hintsFor(["chicken_thigh"], TABLE, {}, [])).toEqual([]);
  });
});

describe("servings", () => {
  it("counts both grades of each item and takes the smallest", () => {
    expect(servings(TABLE.belly_ssam, { "boar_belly:premium": 2, "boar_belly:normal": 3, perilla: 4, wild_garlic: 2 })).toBe(2);
  });
  it("is 0 when an item is missing", () => {
    expect(servings(TABLE.belly_ssam, { "boar_belly:normal": 3, perilla: 4 })).toBe(0);
  });
});
