import { describe, expect, it } from "vitest";
import { applyAction } from "./actions";
import { grantPurchase, shopOffer, vipBonus, vipLevel } from "./shop";
import { newSave, type SaveData } from "./save";

// The VX shop (06b-1 design 2-3): what a purchase grants, what the shop offers, VIP.
const buy = (s: SaveData, productId: string, purchaseId = `p-${Math.random()}`) => grantPurchase(s, { purchaseId, productId, quantity: 1 });

describe("buying charcoal", () => {
  it("gives a bundle's plain amount every time, the first purchase included (no first-buy double, user 2026-10-16)", () => {
    const a = buy(newSave(), "charcoal_1").save;
    expect(a.charcoal).toBe(30);
    expect(buy(a, "charcoal_1").save.charcoal).toBe(60);
  });
  it("grants a purchase once however often the webhook comes", () => {
    const a = buy(newSave(), "charcoal_2", "p-1").save;
    const b = buy(a, "charcoal_2", "p-1");
    expect(b.error).toBeUndefined();
    expect(b.save).toBe(a);
    expect(a.vip.spent).toBe(500);
  });
  it("adds the VIP bonus of the level before this purchase", () => {
    const vip5 = { ...newSave(), vip: { spent: 6_000, day: 0 }, shop: { firstBuy: ["charcoal_3"], purchases: [] } };
    expect(vipLevel(6_000)).toBe(5);
    expect(buy(vip5, "charcoal_3").save.charcoal).toBe(Math.floor(450 * 1.1));
    expect([vipLevel(99), vipLevel(100), vipLevel(70_000), vipLevel(10 ** 7)]).toEqual([0, 1, 9, 10]);
    expect([vipBonus(0), vipBonus(1), vipBonus(10)]).toEqual([0, 0.02, 0.25]);
  });
  it("sells the starter pack once: a second webhook grants nothing but is recorded", () => {
    const a = buy({ ...newSave(), pages: ["forest"] }, "starter_pack", "s-1").save;
    expect([a.charcoal, a.gold]).toEqual([75, 5_000]);
    const b = buy(a, "starter_pack", "s-2").save;
    expect([b.charcoal, b.gold, b.shop.purchases.includes("s-2")]).toEqual([75, 5_000, true]);
  });
  it("refuses a product it does not know", () => {
    expect(buy(newSave(), "gold_pouch").error).toBe("unknown_product");
  });
  it("keeps the last 200 purchase ids", () => {
    let s = newSave();
    for (let i = 0; i < 210; i++) s = buy(s, "charcoal_1", `p${i}`).save;
    expect(s.shop.purchases).toHaveLength(200);
    expect(s.shop.purchases[0]).toBe("p10");
  });
});

describe("the shop's offer", () => {
  it("sells every charcoal bundle at the same 30 charcoal per 100 VX (user, 2026-10-16), the first time too", () => {
    const o = shopOffer(newSave()).filter((x) => x.bundle);
    expect(o.map((x) => [x.id, x.charcoal / (x.vx / 100)])).toEqual(["charcoal_1", "charcoal_2", "charcoal_3", "charcoal_4", "charcoal_5"].map((id) => [id, 30]));
    expect(new Set(o.map((x) => x.valuePct))).toEqual(new Set([100]));
    expect(o.some((x) => "firstBuy" in x)).toBe(false);
  });
  it("counts the VIP bonus in the band", () => {
    const o = shopOffer({ ...newSave(), vip: { spent: 6_000, day: 0 } });
    expect(o.find((x) => x.id === "charcoal_1")).toMatchObject({ charcoal: 33, valuePct: 110, vipPct: 10 });
  });
  it("offers the starter pack only after the Charge King, and not once bought", () => {
    expect(shopOffer(newSave()).some((x) => x.id === "starter_pack")).toBe(false);
    expect(shopOffer({ ...newSave(), pages: ["forest"] }).find((x) => x.id === "starter_pack")!.valuePct).toBe(250);
    expect(shopOffer({ ...newSave(), pages: ["forest"], shop: { firstBuy: ["starter_pack"], purchases: [] } }).some((x) => x.id === "starter_pack")).toBe(false);
  });
});

describe("the VIP's daily charcoal", () => {
  const morning = (over: Partial<SaveData> = {}): SaveData => ({ ...newSave(), day: 4, stage: "hunt", vip: { spent: 1_500, day: 0 }, ...over });
  const claim = (s: SaveData) => applyAction(s, { type: "claimVipDaily" }, { now: 1, random: () => 0.5 });
  it("gives 2 a VIP level once a day, in the morning before the hunt", () => {
    const r = claim(morning());
    expect([r.save.charcoal, r.save.vip.day]).toEqual([6, 4]);
    expect(claim(r.save).error).toBe("claimed");
  });
  it("refuses without VIP or outside the morning", () => {
    expect(claim(morning({ vip: { spent: 0, day: 0 } })).error).toBe("no_vip");
    expect(claim(morning({ stage: "kitchen" })).error).toBe("wrong_stage");
  });
});
