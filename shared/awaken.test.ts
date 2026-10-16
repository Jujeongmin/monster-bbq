import { describe, expect, it } from "vitest";
import { applyAction } from "./actions";
import { awakenCost, canAwaken, starLevel, starMul } from "./awaken";
import { newSave, type SaveData } from "./save";

// Awakening (06b-1 design 1): stars 1-20 on hunting gear and dishes, gold and charcoal.
const ctx = { now: 1, random: () => 0.5 };
const rich = (over: Partial<SaveData> = {}): SaveData => ({ ...newSave(), stage: "kitchen", gold: 1_000_000, charcoal: 100_000, ...over });
const awaken = (s: SaveData, target: string, from = starLevel(s, target as never)) => applyAction(s, { type: "awaken", target, from }, ctx);

describe("awakening", () => {
  it("costs gold and a little charcoal up to star 10, charcoal alone after", () => {
    expect(awakenCost(1)).toEqual({ gold: 200, charcoal: 5 });
    expect(awakenCost(10)).toEqual({ gold: 20_000, charcoal: 40 });
    expect(awakenCost(11)).toEqual({ gold: 0, charcoal: 120 });
    expect(awakenCost(20)).toEqual({ gold: 0, charcoal: 600 });
    let charcoal = 0;
    for (let n = 1; n <= 20; n++) charcoal += awakenCost(n).charcoal;
    expect(charcoal).toBe(208 + 3600);
  });
  it("multiplies by 1.1 a star", () => {
    expect(starMul(0)).toBe(1);
    expect(starMul(20)).toBeCloseTo(6.7275, 3);
  });
  it("takes the gold and charcoal and adds a star", () => {
    const r = awaken(rich(), "melee");
    expect(r.error).toBeUndefined();
    expect([r.save.gold, r.save.charcoal, r.save.stars.melee]).toEqual([1_000_000 - 200, 100_000 - 5, 1]);
  });
  it("refuses short of gold or charcoal, past star 20, and changes nothing", () => {
    expect(awaken(rich({ gold: 199 }), "melee").error).toBe("no_gold");
    expect(awaken(rich({ charcoal: 4 }), "melee").error).toBe("no_charcoal");
    expect(awaken(rich({ stars: { melee: 20 } }), "melee").error).toBe("max_stars");
  });
  it("does nothing for a press that saw an older star (a retry, or a double tap)", () => {
    const once = awaken(rich(), "melee").save;
    const again = applyAction(once, { type: "awaken", target: "melee", from: 0 }, ctx);
    expect(again.error).toBeUndefined();
    expect(again.save).toBe(once);
    expect(applyAction(once, { type: "awaken", target: "melee", from: 5 }, ctx).error).toBe("bad_action");
  });
  it("awakens only side weapons bought and dishes researched", () => {
    expect(canAwaken(rich(), "sling")).toBe(true);
    expect(awaken(rich(), "netGun").error).toBe("not_owned");
    expect(awaken(rich(), "baeksuk").error).toBe("not_owned");
    expect(awaken(rich({ dishes: { baeksuk: 1 } }), "baeksuk").error).toBeUndefined();
    expect(awaken(rich(), "pot").error).toBe("bad_action");
  });
  it("waits while a hunt or a night service is on", () => {
    expect(awaken(rich({ hunt: { id: "h", seed: 1, zone: "forest", period: "morning", side: "sling", startedAt: 1 } }), "melee").error).toBe("wrong_stage");
    expect(awaken(rich({ service: { id: "s", seed: 1, startedAt: 1, dishes: [] } }), "melee").error).toBe("wrong_stage");
  });
});
