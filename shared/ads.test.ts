import { describe, expect, it } from "vitest";
import { adCharcoalLeft, claimAdCharcoal, kstDay } from "./ads";
import { BALANCE } from "./balance";
import { newSave, readSave } from "./save";

// 2026-10-27 12:00 in Korea
const NOON = Date.UTC(2026, 9, 27, 3);
const id = (n: number) => `ad-request-${n}-0000`;

describe("ad charcoal", () => {
  it("pays BALANCE.ads.charcoal an ad, BALANCE.ads.charcoalPerDay ads a Korean day", () => {
    let save = newSave();
    for (let i = 0; i < BALANCE.ads.charcoalPerDay; i++) {
      const r = claimAdCharcoal(save, id(i), NOON);
      expect(r.error).toBeUndefined();
      save = r.save;
    }
    expect(save.charcoal).toBe(BALANCE.ads.charcoal * BALANCE.ads.charcoalPerDay);
    expect(adCharcoalLeft(save, NOON)).toBe(0);
    expect(claimAdCharcoal(save, id(99), NOON).error).toBe("ad_limit");
    // midnight in Korea (15:00 UTC) starts a new day
    const tomorrow = Date.UTC(2026, 9, 27, 15, 1);
    expect(kstDay(tomorrow)).toBe(kstDay(NOON) + 1);
    expect(adCharcoalLeft(save, tomorrow)).toBe(BALANCE.ads.charcoalPerDay);
    expect(claimAdCharcoal(save, id(100), tomorrow).save.ads.count).toBe(1);
  });
  it("pays one ad once and refuses ids that are not ad ids", () => {
    const once = claimAdCharcoal(newSave(), id(1), NOON).save;
    expect(claimAdCharcoal(once, id(1), NOON).error).toBe("ad_claimed");
    for (const bad of [undefined, 3, "", "x", "a b c d e f g h", "<script>alert(1)</script>"]) expect(claimAdCharcoal(newSave(), bad, NOON).error).toBe("bad_ad");
  });
  it("reads older saves with no ads yet", () => {
    const { ads: _ads, ...old } = newSave();
    expect(readSave(old).ads).toEqual({ day: 0, count: 0, ids: [] });
  });
});
