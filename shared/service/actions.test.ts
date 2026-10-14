import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "../actions";
import { BALANCE } from "../balance";
import type { DishId } from "../content/dishes";
import type { Recipe } from "../kitchen/cook";
import { newSave, type SaveData } from "../save";
import { planService } from "./plan";
import { dishScore, serveValue } from "./settle";

// A small made-up recipe table (the real one is the server's).
const TABLE = {
  grilled_belly: { method: "grill", items: ["boar_belly"] },
  garlic_neck: { method: "grill", items: ["boar_neck", "wild_garlic"] },
} as Record<DishId, Recipe>;
const SV = BALANCE.service;
const ctx = (now: number, recipes: Record<DishId, Recipe> | null = TABLE): ActionContext => ({ now, random: () => 0.37, recipes });

const kitchen: SaveData = {
  ...newSave(),
  day: 3,
  reputation: 20,
  items: { "boar_belly:premium": 2, "boar_belly:normal": 4, "boar_neck:normal": 3, wild_garlic: 3 },
  cookbook: { grilled_belly: TABLE.grilled_belly, garlic_neck: TABLE.garlic_neck },
  menu: ["grilled_belly", "garlic_neck"],
};

function opened(now = 1_000_000) {
  const r = applyAction(kitchen, { type: "startService" }, ctx(now));
  if (r.error) throw new Error(r.error);
  return r.save;
}

describe("startService", () => {
  it("opens tonight's service with a server seed, the clock and the menu", () => {
    const s = opened(5000);
    expect(s.service).toMatchObject({ startedAt: 5000, menu: ["grilled_belly", "garlic_neck"] });
    expect(typeof s.service!.id).toBe("string");
  });
  it("needs a menu, and ingredients for at least one plate of it", () => {
    expect(applyAction({ ...kitchen, menu: [] }, { type: "startService" }, ctx(0)).error).toBe("no_menu");
    expect(applyAction({ ...kitchen, items: {} }, { type: "startService" }, ctx(0)).error).toBe("no_ingredients");
  });
});

describe("finishService", () => {
  const s0 = opened();
  const svc = s0.service!;
  const customers = planService(svc.seed, { day: kitchen.day, reputation: kitchen.reputation, menu: svc.menu });
  const keysFor = (dish: DishId, premium = false) => (dish === "grilled_belly" ? [premium ? "boar_belly:premium" : "boar_belly:normal"] : ["boar_neck:normal", "wild_garlic"]);
  const after = (ms: number) => ctx(svc.startedAt + ms);
  const report = (served: unknown[], left: unknown[] = [], extra: object = {}) => ({ type: "finishService", serviceId: svc.id, served, left, ...extra });
  const c0 = customers[0];
  const c1 = customers[1];
  const late = Math.max(c0.arriveMs, c1.arriveMs) + 10_000;

  it("pays for the plates, takes the ingredients, moves reputation and keeps a summary", () => {
    const served = [
      { customer: c0.id, keys: keysFor(c0.dish, true), accuracy: 1 },
      { customer: c1.id, keys: keysFor(c1.dish), accuracy: 0.5 },
    ];
    const r = applyAction(s0, report(served), after(late));
    expect(r.error).toBeUndefined();
    const v0 = serveValue(c0.dish, dishScore(1, served[0].keys));
    const v1 = serveValue(c1.dish, dishScore(0.5, served[1].keys));
    const happy = [v0, v1].filter((v) => v.happy).length;
    const unattended = customers.length - 2;
    expect(r.save.gold).toBe(v0.gold + v0.tip + v1.gold + v1.tip);
    expect(r.save.reputation).toBe(Math.max(0, kitchen.reputation + happy * SV.rep.happy + unattended * SV.rep.left));
    const used: Record<string, number> = {};
    for (const s of served) for (const k of s.keys) used[k] = (used[k] ?? 0) + 1;
    for (const [k, n] of Object.entries(used)) expect(r.save.items[k] ?? 0).toBe(kitchen.items[k] - n);
    expect(r.save.service).toBeNull();
    expect(r.save.lastService).toEqual({ id: svc.id, served: 2, left: unattended, sales: v0.gold + v1.gold, tips: v0.tip + v1.tip, happy, repDelta: r.save.reputation - kitchen.reputation });
  });
  it("ignores the same report sent again after it was settled", () => {
    const once = applyAction(s0, report([{ customer: c0.id, keys: keysFor(c0.dish), accuracy: 1 }]), after(late)).save;
    const again = applyAction(once, report([{ customer: c0.id, keys: keysFor(c0.dish), accuracy: 1 }]), after(late));
    expect(again.error).toBeUndefined();
    expect(again.save).toEqual(once);
  });
  it("is unavailable without the server's recipe table", () => {
    expect(applyAction(s0, report([]), ctx(svc.startedAt + 1000, null)).error).toBe("unavailable");
  });

  const wrongDish: DishId = c0.dish === "grilled_belly" ? "garlic_neck" : "grilled_belly";
  const refused: [string, () => { save: SaveData; error?: string }][] = [
    ["the same customer twice", () => applyAction(s0, report([{ customer: c0.id, keys: keysFor(c0.dish), accuracy: 1 }, { customer: c0.id, keys: keysFor(c0.dish), accuracy: 1 }]), after(late))],
    ["a customer who never came", () => applyAction(s0, report([{ customer: "c99", keys: keysFor(c0.dish), accuracy: 1 }]), after(late))],
    ["a customer served before arriving", () => applyAction(s0, report([{ customer: c1.id, keys: keysFor(c1.dish), accuracy: 1 }]), after(c1.arriveMs - 1))],
    ["plates faster than possible", () => applyAction(s0, report([{ customer: c0.id, keys: keysFor(c0.dish), accuracy: 1 }]), after(Math.min(c0.arriveMs, SV.minMsPerServe - 1)))],
    ["a dish other than the order", () => applyAction(s0, report([{ customer: c0.id, keys: keysFor(wrongDish), accuracy: 1 }]), after(late))],
    ["the same item in two grades", () => applyAction(s0, report([{ customer: c0.id, keys: c0.dish === "grilled_belly" ? ["boar_belly:normal", "boar_belly:premium"] : ["boar_neck:normal", "boar_neck:premium"], accuracy: 1 }]), after(late))],
    ["more than the fridge holds", () => applyAction({ ...s0, items: {} }, report([{ customer: c0.id, keys: keysFor(c0.dish), accuracy: 1 }]), after(late))],
    ["an accuracy above 1", () => applyAction(s0, report([{ customer: c0.id, keys: keysFor(c0.dish), accuracy: 1.5 }]), after(late))],
    ["an accuracy that is not a number", () => applyAction(s0, report([{ customer: c0.id, keys: keysFor(c0.dish), accuracy: "great" }]), after(late))],
    ["a customer both served and gone", () => applyAction(s0, report([{ customer: c0.id, keys: keysFor(c0.dish), accuracy: 1 }], [c0.id]), after(late))],
    ["another service's id", () => applyAction(s0, report([], [], { serviceId: "nope" }), after(late))],
    ["no service going on", () => applyAction(kitchen, report([]), after(late))],
  ];
  for (const [what, run] of refused) {
    it(`refuses ${what} and leaves the save alone`, () => {
      const r = run();
      expect(r.error).toBe("bad_service");
      expect(r.save).toEqual(what === "no service going on" ? kitchen : what === "more than the fridge holds" ? { ...s0, items: {} } : s0);
    });
  }
});
