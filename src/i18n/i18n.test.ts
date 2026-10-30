import { describe, expect, it } from "vitest";
import { detectLocale, itemName, setLocale, t, type StringKey } from "./index";

describe("detectLocale", () => {
  it("follows ?lang=, then the browser language, Korean for Korean browsers", () => {
    expect(detectLocale("?lang=en", "ko-KR")).toBe("en");
    expect(detectLocale("", "ko-KR")).toBe("ko");
    expect(detectLocale("", "en-US")).toBe("en");
    expect(detectLocale("", "ja-JP")).toBe("en");
  });
  it("keeps the language picked in the settings over the browser's, ?lang= still first", () => {
    expect(detectLocale("", "ko-KR", "en")).toBe("en");
    expect(detectLocale("", "en-US", "ko")).toBe("ko");
    expect(detectLocale("?lang=en", "ko-KR", "ko")).toBe("en");
    expect(detectLocale("", "ko-KR", "fr")).toBe("ko");
  });
});

describe("t", () => {
  it("translates and fills in values", () => {
    setLocale("ko");
    expect(t("hud.day", { day: 3 })).toBe("3일째");
    setLocale("en");
    expect(t("hud.day", { day: 3 })).toBe("Day 3");
  });
  it("leaves a missing value visible instead of crashing", () => {
    setLocale("en");
    expect(t("hud.day")).toBe("Day {day}");
  });
});

describe("itemName", () => {
  it("names an item and its grade in the current language", () => {
    setLocale("ko");
    expect(itemName("boar_belly:premium")).toBe("삼겹살 ★특급");
    expect(itemName("shiitake")).toBe("표고버섯");
    setLocale("en");
    expect(itemName("boar_belly:normal")).toBe(`${t("item.boar_belly")} ${t("grade.normal")}`);
    setLocale("ko");
  });
  it("shows an unknown key as it is", () => {
    expect(itemName("junk")).toBe("junk");
  });
});

// The language pass (user 2026-10-30): every line in both languages, the same blanks filled, no Korean left
// in the English, and every key the game builds from a content id present.
import { DISHES, METHODS } from "../../shared/content/dishes";
import { ITEMS } from "../../shared/content/items";
import { PRODUCTS } from "../../shared/content/products";
import { SIDE_WEAPONS } from "../../shared/content/sideWeapons";
import { POSITIONS, RARITIES, STAFF_IDS } from "../../shared/content/staff";
import { UPGRADE_IDS } from "../../shared/content/upgrades";
import { en } from "./en";
import { ko } from "./ko";

const blanks = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("both dictionaries", () => {
  it("say every line in both languages with the same blanks, and no Korean in the English", () => {
    const bad: string[] = [];
    for (const key of Object.keys(ko) as StringKey[]) {
      if (!ko[key].trim() || !en[key].trim()) bad.push(`${key}: empty`);
      if (/[가-힣]/.test(en[key])) bad.push(`${key}: Korean in en`);
      if (blanks(ko[key]).join() !== blanks(en[key]).join()) bad.push(`${key}: blanks ${blanks(ko[key])} vs ${blanks(en[key])}`);
    }
    expect(bad).toEqual([]);
  });
  it("have every key built from a content id", () => {
    const want = [
      ...Object.keys(ITEMS).map((id) => `item.${id}`),
      ...Object.keys(DISHES).map((id) => `dish.${id}`),
      ...METHODS.map((m) => `method.${m}`),
      "grade.premium",
      "grade.normal",
      ...STAFF_IDS.flatMap((id) => [`staff.name.${id}`, `staff.skill.${id}`, `staff.story.${id}`]),
      ...RARITIES.map((r) => `staff.rarity.${r}`),
      ...POSITIONS.flatMap((p) => [`staff.pos.${p}`, `staff.posShort.${p}`]),
      ...UPGRADE_IDS.map((id) => `upgrade.${id}`),
      ...PRODUCTS.map((p) => `product.${p.id}`),
      ...SIDE_WEAPONS.map((id) => `hunt.side.${id}`),
      ...[1, 2, 3, 4, 5].map((n) => `floor.${n}`),
      ...["bag", "upgrade", "awaken", "friends", "cookbook", "menu", "shop", "ranking"].map((a) => `notebook.app.${a}`),
      ...["morning", "noon", "afternoon", "evening", "night"].map((x) => `time.${x}`),
    ];
    expect(want.filter((k) => !(k in ko))).toEqual([]);
  });
});
