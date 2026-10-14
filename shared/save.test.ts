import { describe, expect, it } from "vitest";
import { itemKey, parseItemKey } from "./content/items";
import { newSave, readSave } from "./save";

describe("itemKey / parseItemKey", () => {
  it("keys monster parts by grade and forage without one", () => {
    expect(itemKey("boar_belly", "premium")).toBe("boar_belly:premium");
    expect(itemKey("shiitake")).toBe("shiitake");
    expect(parseItemKey("boar_rib:normal")).toEqual({ id: "boar_rib", grade: "normal" });
    expect(parseItemKey("perilla")).toEqual({ id: "perilla", grade: null });
  });
  it("rejects unknown items and wrong grade use", () => {
    expect(parseItemKey("dragon_tail:premium")).toBeNull();
    expect(parseItemKey("boar_belly")).toBeNull();
    expect(parseItemKey("shiitake:premium")).toBeNull();
    expect(parseItemKey("boar_belly:golden")).toBeNull();
  });
});

const EMPTY_KITCHEN = { cookbook: {}, hints: [], menu: [], tools: ["grill"], lastCook: null };

describe("newSave", () => {
  it("starts on day 1 with nothing, no hunt going on and only the grill", () => {
    expect(newSave()).toEqual({ version: 3, day: 1, gold: 0, items: {}, hunt: null, ...EMPTY_KITCHEN });
  });
});

describe("readSave", () => {
  const valid = {
    version: 3,
    day: 4,
    gold: 120,
    items: { "boar_belly:premium": 2, shiitake: 1 },
    hunt: { id: "h1", seed: 7, zone: "forest", startedAt: 1000 },
    cookbook: { grilled_belly: { method: "grill", items: ["boar_belly"] } },
    hints: ["rib_stew"],
    menu: ["grilled_belly"],
    tools: ["grill", "boil"],
    lastCook: { attemptId: "a1", outcome: { kind: "near", hint: "missing", taste: "veg" } },
  };
  it("keeps a valid save as it is", () => {
    expect(readSave(valid)).toEqual(valid);
  });
  it("moves a version 2 save to version 3 with an empty kitchen, keeping items and the hunt", () => {
    const v2 = { version: 2, day: 4, gold: 120, items: { shiitake: 1 }, hunt: { id: "h1", seed: 7, zone: "forest", startedAt: 1000 } };
    expect(readSave(v2)).toEqual({ ...v2, version: 3, ...EMPTY_KITCHEN });
  });
  it("moves a version 1 save's meat into items without losing any", () => {
    expect(readSave({ version: 1, day: 3, gold: 50, meat: { premium: 2, normal: 5 } })).toEqual({
      version: 3,
      day: 3,
      gold: 50,
      items: { "boar_belly:premium": 2, "boar_belly:normal": 5 },
      hunt: null,
      ...EMPTY_KITCHEN,
    });
  });
  it("starts fresh for nothing, garbage or an unknown version", () => {
    expect(readSave(undefined)).toEqual(newSave());
    expect(readSave("nope")).toEqual(newSave());
    expect(readSave({ version: 99, day: 5 })).toEqual(newSave());
  });
  it("drops broken item entries and a broken hunt instead of failing", () => {
    expect(
      readSave({ version: 3, day: -3, gold: "x", items: { "boar_belly:normal": 2.7, shiitake: -1, "dragon:premium": 4, perilla: "2" }, hunt: { id: 5 } }),
    ).toEqual({ version: 3, day: 1, gold: 0, items: { "boar_belly:normal": 2 }, hunt: null, ...EMPTY_KITCHEN });
  });
  it("drops broken kitchen entries instead of failing", () => {
    const r = readSave({
      ...valid,
      cookbook: {
        grilled_belly: { method: "grill", items: ["boar_belly"] },
        dragon_steak: { method: "grill", items: ["boar_belly"] },
        rib_stew: { method: "melt", items: ["boar_rib"] },
        baeksuk: { method: "boil", items: [] },
        belly_ssam: { method: "grill", items: ["boar_belly", "perilla", "wild_garlic", "shiitake"] },
        garlic_neck: { method: "grill", items: ["boar_neck", "unicorn"] },
      },
      hints: ["rib_stew", "rib_stew", "moon_cake", 3],
      menu: ["grilled_belly", "nope"],
      tools: ["laser"],
      lastCook: { attemptId: "a1", outcome: { kind: "magic" } },
    });
    expect(r.cookbook).toEqual({ grilled_belly: { method: "grill", items: ["boar_belly"] } });
    expect(r.hints).toEqual(["rib_stew"]);
    expect(r.menu).toEqual(["grilled_belly"]);
    expect(r.tools).toEqual(["grill"]);
    expect(r.lastCook).toBeNull();
  });
});
