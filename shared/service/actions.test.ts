import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "../actions";
import { BALANCE } from "../balance";
import { newSave, type SaveData } from "../save";
import { planService } from "./plan";
import { tipRate } from "./settle";
import { RECIPES } from "../content/recipes";

const SV = BALANCE.service;
const ctx = (now: number): ActionContext => ({ now, random: () => 0.37 });

const kitchen: SaveData = {
  ...newSave(),
  stage: "kitchen",
  day: 3,
  reputation: 20,
  dishes: { grilled_belly: 1, garlic_neck: 1 },
  items: { "boar_belly:normal": 1, "boar_neck:normal": 1, wild_garlic: 1 },
};

// tonight: 3 plates of pork belly at 40, 3 of garlic neck at 50
function opened(now = 1_000_000) {
  const r = applyAction(kitchen, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }, { dish: "garlic_neck", sets: 1 }] }, ctx(now));
  if (r.error) throw new Error(r.error);
  return r.save;
}

describe("finishService (restaurant v2 stage 2: the waiter carries, tips, drinks)", () => {
  const s0 = opened();
  const svc = s0.service!;
  const customers = planService(svc.seed, { day: kitchen.day, reputation: kitchen.reputation, menu: ["grilled_belly", "garlic_neck"] });
  const after = (ms: number) => ctx(svc.startedAt + ms);
  const report = (served: unknown[], left: unknown[] = [], extra: object = {}) => ({ type: "finishService", serviceId: svc.id, served, left, ...extra });
  const c = customers;
  const late = Math.max(...c.map((x) => x.arriveMs + x.patienceMs)) + 60_000;
  // a slow plate (no tip): most of the guest's patience
  const slow = (x: (typeof c)[number]) => Math.round(x.patienceMs * 0.9);
  const thirsty = c.find((x) => x.drink === "cider" || x.drink === "sikhye")!;
  const teaGuest = c.find((x) => x.drink === "tea")!;
  const dry = c.find((x) => x.drink === "none")!;

  it("finds the guests these tests need in tonight's plan", () => {
    expect([thirsty, teaGuest, dry].every(Boolean)).toBe(true);
  });
  it("pays tonight's price per plate, moves reputation and keeps a summary", () => {
    const r = applyAction(s0, report([{ customer: c[0].id, dish: "grilled_belly", waitMs: slow(c[0]) }, { customer: c[1].id, dish: "garlic_neck", waitMs: slow(c[1]) }]), after(late));
    expect(r.error).toBeUndefined();
    expect(r.save.gold).toBe(90);
    expect(r.save.stage).toBe("settle");
    expect(r.save.service).toBeNull();
    // 6 plates, so every customer up to 6 who went without counts as gone
    const gone = Math.min(c.length, 6) - 2;
    expect(r.save.lastService).toEqual({ id: svc.id, served: 2, left: gone, sales: 90, tips: 0, drinks: 0, happy: 2, repDelta: 2 * SV.rep.happy + gone * SV.rep.left });
    expect(r.save.reputation).toBe(Math.max(0, 20 + 2 * SV.rep.happy + gone * SV.rep.left));
  });
  it("tips 30% for a quick plate, 15% for a middling one, nothing for a slow one", () => {
    expect(tipRate(3000, 30000)).toBe(0.3);
    expect(tipRate(15000, 30000)).toBe(0.15);
    expect(tipRate(20000, 30000)).toBe(0);
    const quick = Math.max(RECIPES.grilled_belly.cookMs, Math.floor(dry.patienceMs * 0.2));
    const r = applyAction(s0, report([{ customer: dry.id, dish: "grilled_belly", waitMs: quick }]), after(late));
    expect(r.save.lastService!.tips).toBe(12);
  });
  it("makes a perfect barley tea worth half as much tip again", () => {
    const quick = Math.max(RECIPES.grilled_belly.cookMs, Math.floor(teaGuest.patienceMs * 0.2));
    const r = applyAction(s0, report([{ customer: teaGuest.id, dish: "grilled_belly", waitMs: quick, drink: "perfect" }]), after(late));
    expect(r.save.lastService!.tips).toBe(18);
    expect(r.save.lastService!.drinks).toBe(0);
  });
  it("sells cider and sikhye after the meal, half again for a perfect pour, a bad pour costs reputation", () => {
    const price = SV.drinks.price[thirsty.drink as "cider" | "sikhye"];
    const one = (drink: string) => report([{ customer: thirsty.id, dish: "grilled_belly", waitMs: slow(thirsty), drink }]);
    expect(applyAction(s0, one("good"), after(late)).save.lastService!.drinks).toBe(price);
    expect(applyAction(s0, one("perfect"), after(late)).save.lastService!.drinks).toBe(Math.round(price * 1.5));
    const badPour = applyAction(s0, one("bad"), after(late)).save.lastService!;
    const goodPour = applyAction(s0, one("good"), after(late)).save.lastService!;
    expect(badPour.repDelta).toBe(goodPour.repDelta + SV.rep.badDrink);
  });
  it("refuses a pour for a guest who asked for no drink, or a made-up pour", () => {
    expect(applyAction(s0, report([{ customer: dry.id, dish: "grilled_belly", waitMs: slow(dry), drink: "good" }]), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report([{ customer: thirsty.id, dish: "grilled_belly", waitMs: slow(thirsty), drink: "great" }]), after(late)).error).toBe("bad_service");
  });
  it("refuses a wait shorter than the dish takes, longer than the guest's patience, or not over yet", () => {
    const x = c[0];
    expect(applyAction(s0, report([{ customer: x.id, dish: "grilled_belly", waitMs: RECIPES.grilled_belly.cookMs - 1 }]), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report([{ customer: x.id, dish: "grilled_belly", waitMs: x.patienceMs + 1 }]), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report([{ customer: x.id, dish: "grilled_belly", waitMs: 5000 }]), after(x.arriveMs + 4999)).error).toBe("bad_service");
    expect(applyAction(s0, report([{ customer: x.id, dish: "grilled_belly" }]), after(late)).error).toBe("bad_service");
  });
  it("does not count customers who came after every plate was sold as gone", () => {
    const served = c.slice(0, 6).map((x, i) => ({ customer: x.id, dish: i < 3 ? "grilled_belly" : "garlic_neck", waitMs: slow(x) }));
    const r = applyAction(s0, report(served), after(late));
    expect(r.error).toBeUndefined();
    expect(r.save.lastService!.left).toBe(0);
  });
  it("refuses more plates of a dish than were made, a dish not cooked tonight, unknown or repeated customers", () => {
    const four = c.slice(0, 4).map((x) => ({ customer: x.id, dish: "grilled_belly", waitMs: slow(x) }));
    expect(applyAction(s0, report(four), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report([{ customer: c[0].id, dish: "baeksuk", waitMs: slow(c[0]) }]), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report([{ customer: "c999", dish: "grilled_belly", waitMs: 5000 }]), after(late)).error).toBe("bad_service");
    const twice = [{ customer: c[0].id, dish: "grilled_belly", waitMs: slow(c[0]) }, { customer: c[0].id, dish: "grilled_belly", waitMs: slow(c[0]) }];
    expect(applyAction(s0, report(twice), after(late)).error).toBe("bad_service");
  });
  it("refuses a left list naming served, unknown or repeated customers", () => {
    const one = [{ customer: c[0].id, dish: "grilled_belly", waitMs: slow(c[0]) }];
    expect(applyAction(s0, report(one, [c[0].id]), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report(one, ["c999"]), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report(one, [c[1].id, c[1].id]), after(late)).error).toBe("bad_service");
  });
  it("changes nothing when the settled report is sent again", () => {
    const one = [{ customer: c[0].id, dish: "grilled_belly", waitMs: slow(c[0]) }];
    const done = applyAction(s0, report(one), after(late)).save;
    const again = applyAction(done, report(one), after(late));
    expect(again.error).toBeUndefined();
    expect(again.save).toBe(done);
  });
  it("refuses a report with no service going on", () => {
    expect(applyAction(kitchen, report([]), after(late)).error).toBe("bad_service");
  });
});
