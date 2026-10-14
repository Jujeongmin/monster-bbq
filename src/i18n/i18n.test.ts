import { describe, expect, it } from "vitest";
import { detectLocale, setLocale, t } from "./index";

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
