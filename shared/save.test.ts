import { describe, expect, it } from "vitest";
import { itemKey, parseItemKey } from "./content/items";
import { newSave, readSave, refundRetired } from "./save";

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

const FRESH = {
  version: 7,
  day: 1,
  stage: "hunt",
  gold: 0,
  items: {},
  hunt: null,
  seenItems: [],
  dishes: {},
  menu: [],
  reputation: 0,
  upgrades: {},
  lunchbox: [],
  service: null,
  lastService: null,
};

describe("newSave", () => {
  it("starts on day 1 with nothing researched and nothing seen", () => {
    expect(newSave()).toEqual(FRESH);
  });
});

describe("readSave (version 7)", () => {
  const valid = {
    version: 7,
    day: 4,
    stage: "kitchen",
    gold: 120,
    items: { "boar_belly:premium": 2, shiitake: 1 },
    hunt: null,
    seenItems: ["boar_belly", "shiitake"],
    dishes: { grilled_belly: 2, shiitake_grill: 1 },
    menu: [{ dish: "grilled_belly", sets: 2 }],
    reputation: 12,
    upgrades: { melee: 2 },
    lunchbox: ["grilled_belly"],
    service: { id: "s1", seed: 9, startedAt: 2000, dishes: [{ dish: "grilled_belly", plates: 8, price: 46 }] },
    lastService: { id: "s0", served: 3, left: 1, sales: 120, tips: 0, happy: 3, repDelta: 1 },
  };
  it("keeps a valid save as it is", () => {
    expect(readSave(valid)).toEqual(valid);
  });
  it("starts fresh for nothing, garbage or an unknown version", () => {
    expect(readSave(undefined)).toEqual(newSave());
    expect(readSave("nope")).toEqual(newSave());
    expect(readSave({ version: 99, day: 5 })).toEqual(newSave());
  });
  it("drops broken dishes, menu lines, seen items and tonight's dishes instead of failing", () => {
    const r = readSave({
      ...valid,
      seenItems: ["boar_belly", "boar_belly", "unicorn", 3],
      dishes: { grilled_belly: 2, dragon_steak: 1, rib_stew: 0, baeksuk: 9, garlic_neck: 1.5 },
      menu: [{ dish: "grilled_belly", sets: 2 }, { dish: "grilled_belly", sets: 1 }, { dish: "baeksuk", sets: 1 }, { dish: "grilled_belly" }, "x"],
      service: { ...valid.service, dishes: [{ dish: "grilled_belly", plates: 8, price: 46 }, { dish: "moon_cake", plates: 1, price: 1 }, { dish: "grilled_belly", plates: -2, price: 5 }] },
    });
    expect(r.seenItems).toEqual(["boar_belly"]);
    expect(r.dishes).toEqual({ grilled_belly: 2 });
    expect(r.menu).toEqual([{ dish: "grilled_belly", sets: 2 }]);
    expect(r.service?.dishes).toEqual([{ dish: "grilled_belly", plates: 8, price: 46 }]);
  });
  it("drops a broken service, summary or reputation instead of failing", () => {
    const r = readSave({ ...valid, reputation: -5, service: { id: 3 }, lastService: { id: "x", served: "lots" } });
    expect(r.reputation).toBe(0);
    expect(r.service).toBeNull();
    expect(r.lastService).toBeNull();
  });
});

describe("readSave (from version 4 and older)", () => {
  const v4 = {
    version: 4,
    day: 4,
    stage: "settle",
    gold: 100,
    items: { "boar_neck:normal": 2, perilla: 1 },
    hunt: null,
    cookbook: { grilled_belly: { method: "grill", items: ["boar_belly"] }, garlic_neck: { method: "grill", items: ["boar_neck", "wild_garlic"] } },
    hints: ["rib_stew"],
    menu: ["grilled_belly", "rib_stew"],
    tools: ["grill", "boil"],
    lastCook: null,
    reputation: 7,
    upgrades: { melee: 2, pot: 1, grillQuality: 3 },
    lunchbox: [],
    service: null,
    lastService: null,
  };
  it("opens found recipes at level 1, sees their ingredients and what is in the fridge, keeps the menu as one set each", () => {
    const r = readSave(v4);
    expect(r.version).toBe(7);
    expect(r.dishes).toEqual({ grilled_belly: 1, garlic_neck: 1 });
    expect([...r.seenItems].sort()).toEqual(["boar_belly", "boar_neck", "perilla", "wild_garlic"]);
    expect(r.menu).toEqual([{ dish: "grilled_belly", sets: 1 }]);
    expect(r).not.toHaveProperty("cookbook");
    expect(r).not.toHaveProperty("tools");
    expect(r).not.toHaveProperty("hints");
    expect(r).not.toHaveProperty("lastCook");
  });
  it("gives back the gold spent on the cooking tools and their quality, keeps the rest of the upgrades", () => {
    const r = readSave(v4);
    // pot level 1 = 600, grill quality 1 -> 3 = 500 + 2000
    expect(r.gold).toBe(100 + 600 + 2500);
    expect(r.upgrades).toEqual({ melee: 2 });
  });
  it("closes a service that was open (no ingredients were taken yet in version 4) and goes back to the kitchen", () => {
    const r = readSave({ ...v4, stage: "kitchen", service: { id: "s1", seed: 9, startedAt: 2000, menu: ["grilled_belly"] } });
    expect(r.service).toBeNull();
    expect(r.stage).toBe("kitchen");
    expect(r.items).toEqual(v4.items);
  });
  it("moves a version 1 save's meat into items and sees it", () => {
    const r = readSave({ version: 1, day: 3, gold: 50, meat: { premium: 2, normal: 5 } });
    expect(r).toEqual({ ...FRESH, day: 3, gold: 50, items: { "boar_belly:premium": 2, "boar_belly:normal": 5 }, seenItems: ["boar_belly"] });
  });
});

describe("refundRetired", () => {
  it("adds up what each bought level of a removed upgrade cost", () => {
    expect(refundRetired({ pot: 1, wok: 1, fryer: 1, board: 1, grillQuality: 2, potQuality: 3 })).toBe(600 + 1500 + 3000 + 5000 + 500 + 2500);
    expect(refundRetired({ pot: 0, grillQuality: 1, melee: 4 })).toBe(0);
    expect(refundRetired({ pot: 7, grillQuality: "x" })).toBe(600);
    expect(refundRetired(null)).toBe(0);
  });
});

describe("save version 6 (hunt v3: two hunts a day)", () => {
  it("starts a new save at version 6, before the morning hunt", () => {
    expect(newSave()).toMatchObject({ version: 7, stage: "hunt", hunt: null });
  });
  it("keeps the lunch stage and a hunt's time of day", () => {
    const s = readSave({ ...newSave(), stage: "lunch", hunt: { id: "h1", seed: 3, zone: "forest", period: "afternoon", side: "sleepGun", startedAt: 5 } });
    expect(s.stage).toBe("lunch");
    expect(s.hunt).toEqual({ id: "h1", seed: 3, zone: "forest", period: "afternoon", side: "sleepGun", startedAt: 5 });
  });
  it("reads a version 5 save as version 6, a hunt in progress as the morning hunt", () => {
    const v5 = { ...newSave(), version: 5, stage: "hunt", hunt: { id: "h1", seed: 3, zone: "forest", startedAt: 5 } };
    const s = readSave(v5);
    expect(s.version).toBe(7);
    expect(s.hunt?.period).toBe("morning");
  });
  it("reads a hunt saved before side weapons as carrying the slingshot", () => {
    expect(readSave({ ...newSave(), hunt: { id: "h1", seed: 3, zone: "forest", period: "morning", startedAt: 5 } }).hunt?.side).toBe("sling");
  });
  it("reads an unknown time of day as the morning", () => {
    expect(readSave({ ...newSave(), hunt: { id: "h1", seed: 3, zone: "forest", period: "midnight", startedAt: 5 } }).hunt?.period).toBe("morning");
  });
});
