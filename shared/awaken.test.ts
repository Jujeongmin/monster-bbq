import { describe, expect, it } from "vitest";
import { applyAction } from "./actions";
import { awakenCost, canAwaken, sidePower, sleepDartsFor, starLevel, starMul } from "./awaken";
import { BALANCE } from "./balance";
import { huntStats } from "./growth";
import { planShop } from "./kitchen/dish";
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

describe("what the stars do", () => {
  it("hits harder with an awakened knife and harpoon, and the apron takes more off", () => {
    const base = huntStats({ upgrades: {} });
    const s = huntStats({ upgrades: {}, stars: { melee: 5, ranged: 3, armor: 2 } });
    expect(s.meleeDamage).toBe(Math.round(base.meleeDamage * 1.1 ** 5));
    expect(s.rangedDamage).toBe(Math.round(base.rangedDamage * 1.1 ** 3));
    expect(s.damageTaken).toBeCloseTo(base.damageTaken / 1.1 ** 2);
  });
  it("sells an awakened dish dearer", () => {
    const items = { "boar_belly:normal": 1 };
    const plain = planShop(items, { grilled_belly: 1 }, [{ dish: "grilled_belly", sets: 1 }])!;
    const star = planShop(items, { grilled_belly: 1 }, [{ dish: "grilled_belly", sets: 1 }], { grilled_belly: 4 })!;
    expect(star.dishes[0].price).toBe(Math.round(plain.dishes[0].price * 1.1 ** 4));
  });
  it("puts a monster to sleep with fewer darts, the server counting the same", () => {
    expect(sleepDartsFor("king", 0)).toBe(BALANCE.hunt.sleepHits.king);
    expect(sleepDartsFor("king", 8)).toBe(Math.ceil(BALANCE.hunt.sleepHits.king / 1.1 ** 8));
    expect(sleepDartsFor("rabbit", 20)).toBe(1);
  });
  it("makes an awakened side weapon stronger by its stars", () => {
    expect(sidePower({}, "sling")).toBe(1);
    expect(sidePower({ stars: { firecracker: 3 } }, "firecracker")).toBeCloseTo(1.331);
  });
});
