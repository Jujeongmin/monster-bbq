import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "../actions";
import { BALANCE } from "../balance";
import { newSave, type SaveData } from "../save";
import { planService } from "./plan";
import { tipFor } from "./settle";
import { RECIPES } from "../content/recipes";

const SV = BALANCE.service;
const ctx = (now: number): ActionContext => ({ now, random: () => 0.37 });

const kitchen: SaveData = {
  ...newSave(),
  stage: "kitchen",
  day: 3,
  reputation: 60, // high enough that a night of unserved guests never floors it at 0
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
  it("pays tonight's price per plate and a tenth of it as a tip, moves reputation and keeps a summary", () => {
    const r = applyAction(s0, report([{ customer: c[0].id, dish: "grilled_belly", waitMs: slow(c[0]) }, { customer: c[1].id, dish: "garlic_neck", waitMs: slow(c[1]) }]), after(late));
    expect(r.error).toBeUndefined();
    expect(r.save.gold).toBe(90 + 4 + 5);
    expect(r.save.stage).toBe("settle");
    expect(r.save.service).toBeNull();
    // every guest of the night who went without counts as gone, however few plates were made (balance
    // check 2026-10-21: making few plates no longer spares the reputation)
    const gone = c.length - 2;
    expect(r.save.lastService).toEqual({ id: svc.id, served: 2, left: gone, sales: 90, tips: 9, drinks: 0, cleaned: 0, happy: 2, repDelta: 2 * SV.rep.happy + gone * SV.rep.left, dishes: [{ dish: "grilled_belly", plates: 1, gold: 40 }, { dish: "garlic_neck", plates: 1, gold: 50 }] });
    expect(r.save.reputation).toBe(Math.max(0, 60 + 2 * SV.rep.happy + gone * SV.rep.left));
  });
  it("tips a tenth of the price however quick the plate was", () => {
    expect(tipFor(40, false)).toBe(4);
    expect(tipFor(40, true)).toBe(6);
    const quick = applyAction(s0, report([{ customer: dry.id, dish: "grilled_belly", waitMs: RECIPES.grilled_belly.cookMs }]), after(late));
    expect(quick.save.lastService!.tips).toBe(4);
  });
  it("pays for each dirty grill scrubbed, only for messy guests who were served", () => {
    const messy = c.find((x) => x.messy)!;
    const tidy = c.find((x) => !x.messy)!;
    const both = [{ customer: messy.id, dish: "grilled_belly", waitMs: slow(messy) }, { customer: tidy.id, dish: "garlic_neck", waitMs: slow(tidy) }];
    const r = applyAction(s0, report(both, [], { cleaned: [messy.id] }), after(late));
    expect(r.error).toBeUndefined();
    expect(r.save.lastService!.tips).toBe(4 + 5 + SV.cleanTip);
    expect(r.save.lastService!.cleaned).toBe(1);
    expect(applyAction(s0, report(both, [], { cleaned: [tidy.id] }), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report(both, [], { cleaned: [messy.id, messy.id] }), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report([both[1]], [], { cleaned: [messy.id] }), after(late)).error).toBe("bad_service");
  });
  it("makes a perfect barley tea worth half as much tip again", () => {
    const r = applyAction(s0, report([{ customer: teaGuest.id, dish: "grilled_belly", waitMs: slow(teaGuest), drink: "perfect" }]), after(late));
    expect(r.save.lastService!.tips).toBe(6);
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
  it("counts the guests who came after every plate was sold as gone too (balance check 2026-10-21)", () => {
    const served = c.slice(0, 6).map((x, i) => ({ customer: x.id, dish: i < 3 ? "grilled_belly" : "garlic_neck", waitMs: slow(x) }));
    const r = applyAction(s0, report(served), after(late));
    expect(r.error).toBeUndefined();
    expect(r.save.lastService!.left).toBe(c.length - 6);
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

describe("openShop keeps the menu it opened with (shop remake step 4)", () => {
  it("records the opening menu as planMenu, with no adds yet", () => {
    expect(opened().service).toMatchObject({ planMenu: ["grilled_belly", "garlic_neck"], adds: [] });
  });
});

describe("tonight's friends and the settlement (staff design 5)", () => {
  const withJang: SaveData = { ...kitchen, staff: { ...kitchen.staff, owned: { jang: { shards: 0, stars: 0 } }, roster: { kitchen: "jang" } } };
  const open = (s: SaveData) => {
    const r = applyAction(s, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }, { dish: "garlic_neck", sets: 1 }] }, ctx(1_000_000));
    if (r.error) throw new Error(r.error);
    return r.save;
  };
  it("fixes the roster when the shop opens", () => {
    expect(open(withJang).service!.staff).toEqual({ kitchen: { id: "jang", stars: 0 } });
  });
  it("settles with the roster the shop opened with, accepting a plate cooked faster with a kitchen helper", () => {
    const s0 = open(withJang);
    const later = { ...s0, staff: { ...s0.staff, roster: {} } };
    const c = planService(s0.service!.seed, { day: kitchen.day, reputation: kitchen.reputation, menu: ["grilled_belly", "garlic_neck"] })[0];
    const wait = Math.ceil(RECIPES.grilled_belly.cookMs * 0.5);
    const r = applyAction(later, { type: "finishService", serviceId: s0.service!.id, served: [{ customer: c.id, dish: "grilled_belly", waitMs: wait }], left: [] }, ctx(s0.service!.startedAt + c.arriveMs + 200_000));
    expect(r.error).toBeUndefined();
  });
  it("refuses one faster than even the helper allows", () => {
    const s0 = open(withJang);
    const c = planService(s0.service!.seed, { day: kitchen.day, reputation: kitchen.reputation, menu: ["grilled_belly", "garlic_neck"] })[0];
    const wait = Math.floor(RECIPES.grilled_belly.cookMs * 0.5) - 100;
    const r = applyAction(s0, { type: "finishService", serviceId: s0.service!.id, served: [{ customer: c.id, dish: "grilled_belly", waitMs: wait }], left: [] }, ctx(s0.service!.startedAt + 200_000));
    expect(r.error).toBe("bad_service");
  });
  it("counts Baekhwa's extra guests", () => {
    const s0 = open({ ...kitchen, staff: { ...kitchen.staff, owned: { baekhwa: { shards: 0, stars: 0 } }, roster: { serve: "baekhwa" } } });
    const base = planService(s0.service!.seed, { day: kitchen.day, reputation: kitchen.reputation, menu: ["grilled_belly", "garlic_neck"] });
    const all = planService(s0.service!.seed, { day: kitchen.day, reputation: kitchen.reputation, menu: ["grilled_belly", "garlic_neck"], extra: 2 });
    expect(all.length).toBe(base.length + 2);
    const extra = all[all.length - 1];
    const r = applyAction(s0, { type: "finishService", serviceId: s0.service!.id, served: [{ customer: extra.id, dish: "grilled_belly", waitMs: RECIPES.grilled_belly.cookMs }], left: [] }, ctx(s0.service!.startedAt + extra.arriveMs + 200_000));
    expect(r.error).toBeUndefined();
  });
});
