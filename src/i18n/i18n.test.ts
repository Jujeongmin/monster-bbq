import { describe, expect, it } from "vitest";
import { detectLocale, itemName, setLocale, t } from "./index";

describe("detectLocale", () => {
  it("follows ?lang=, then the browser language, Korean for Korean browsers", () => {
    expect(detectLocale("?lang=en", "ko-KR")).toBe("en");
    expect(detectLocale("", "ko-KR")).toBe("ko");
    expect(detectLocale("", "en-US")).toBe("en");
    expect(detectLocale("", "ja-JP")).toBe("en");
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
