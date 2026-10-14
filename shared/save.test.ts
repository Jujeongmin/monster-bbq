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

describe("newSave", () => {
  it("starts on day 1 with nothing and no hunt going on", () => {
    expect(newSave()).toEqual({ version: 2, day: 1, gold: 0, items: {}, hunt: null });
  });
});

describe("readSave", () => {
  it("keeps a valid save as it is", () => {
    const s = { version: 2, day: 4, gold: 120, items: { "boar_belly:premium": 2, shiitake: 1 }, hunt: { id: "h1", seed: 7, zone: "forest", startedAt: 1000 } };
    expect(readSave(s)).toEqual(s);
  });
  it("moves a version 1 save's meat into items without losing any", () => {
    expect(readSave({ version: 1, day: 3, gold: 50, meat: { premium: 2, normal: 5 } })).toEqual({
      version: 2,
      day: 3,
      gold: 50,
      items: { "boar_belly:premium": 2, "boar_belly:normal": 5 },
      hunt: null,
    });
  });
  it("starts fresh for nothing, garbage or an unknown version", () => {
    expect(readSave(undefined)).toEqual(newSave());
    expect(readSave("nope")).toEqual(newSave());
    expect(readSave({ version: 99, day: 5 })).toEqual(newSave());
  });
  it("drops broken item entries and a broken hunt instead of failing", () => {
    expect(
      readSave({ version: 2, day: -3, gold: "x", items: { "boar_belly:normal": 2.7, shiitake: -1, "dragon:premium": 4, perilla: "2" }, hunt: { id: 5 } }),
    ).toEqual({ version: 2, day: 1, gold: 0, items: { "boar_belly:normal": 2 }, hunt: null });
  });
});
