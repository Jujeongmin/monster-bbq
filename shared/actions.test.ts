import { describe, expect, it } from "vitest";
import { applyAction, koPenalty, saleLines, type ActionContext } from "./actions";
import { BALANCE } from "./balance";
import type { DishId } from "./content/dishes";
import { itemKey } from "./content/items";
import type { Recipe } from "./kitchen/cook";
import { dropFor } from "./hunt/drops";
import { planHunt } from "./hunt/plan";
import { newSave, type SaveData } from "./save";

// A small made-up recipe table (the real one is the server's).
const TABLE = {
  grilled_belly: { method: "grill", items: ["boar_belly"] },
  belly_ssam: { method: "grill", items: ["boar_belly", "perilla", "wild_garlic"] },
  rib_stew: { method: "boil", items: ["boar_rib", "shiitake"] },
  shiitake_grill: { method: "grill", items: ["shiitake"] },
} as Record<DishId, Recipe>;

const ctx = (now: number, recipes: Record<DishId, Recipe> | null = TABLE): ActionContext => ({ now, random: () => 0.25, recipes });

function started(now = 1_000_000): SaveData {
  const r = applyAction(newSave(), { type: "startHunt", zone: "forest" }, ctx(now));
  if (r.error) throw new Error(r.error);
  return r.save;
}

describe("startHunt", () => {
  it("opens a hunt with a server-chosen seed and the server's clock", () => {
    const s = started(5000);
    expect(s.hunt).toMatchObject({ zone: "forest", startedAt: 5000 });
    expect(typeof s.hunt!.id).toBe("string");
    expect(Number.isInteger(s.hunt!.seed)).toBe(true);
  });
  it("rejects an unknown hunting ground", () => {
    expect(applyAction(newSave(), { type: "startHunt", zone: "moon" }, ctx(0)).error).toBe("bad_action");
  });
});

describe("finishHunt", () => {
  const s0 = started();
  const plan = planHunt(s0.hunt!.seed, "forest");
  const wave0 = plan.spawns.filter((s) => s.wave === 0);
  const wave1 = plan.spawns.filter((s) => s.wave === 1);
  const later = (kills: number) => ctx(s0.hunt!.startedAt + kills * BALANCE.hunt.minMsPerKill);
  const report = (events: unknown[], extra: object = {}) => ({ type: "finishHunt", huntId: s0.hunt!.id, events, ko: false, ...extra });

  it("adds the server-decided drops and gathered items, and closes the hunt", () => {
    const events = [{ kill: wave0[0].id, grade: "premium" }, { gather: plan.nodes[0].id }, { kill: wave0[1].id, grade: "normal" }];
    const r = applyAction(s0, report(events), later(2));
    expect(r.error).toBeUndefined();
    const expected: Record<string, number> = {};
    const bump = (k: string) => (expected[k] = (expected[k] ?? 0) + 1);
    bump(itemKey(dropFor(s0.hunt!.seed, wave0[0]), "premium"));
    bump(itemKey(plan.nodes[0].item));
    bump(itemKey(dropFor(s0.hunt!.seed, wave0[1]), "normal"));
    expect(r.save.items).toEqual(expected);
    expect(r.save.hunt).toBeNull();
  });

  it("keeps items in the order they were taken until the bag is full", () => {
    const events = [...wave0, ...wave1].slice(0, BALANCE.hunt.bagSlots + 3).map((s) => ({ kill: s.id, grade: "normal" }));
    const r = applyAction(s0, report(events), later(events.length));
    expect(r.error).toBeUndefined();
    expect(Object.values(r.save.items).reduce((a, b) => a + b, 0)).toBe(BALANCE.hunt.bagSlots);
  });

  it("accepts refills in the order they appear: one after each kill, even when the kill was a refill", () => {
    const refills = plan.spawns.filter((s) => s.wave > 0);
    const events = [wave0[0], refills[0], refills[1], refills[2]].map((s) => ({ kill: s.id, grade: "normal" }));
    expect(applyAction(s0, report(events), later(4)).error).toBeUndefined();
  });

  it("refuses a refill that would not have appeared yet", () => {
    const refills = plan.spawns.filter((s) => s.wave > 0);
    const events = [wave0[0], refills[1]].map((s) => ({ kill: s.id, grade: "normal" }));
    expect(applyAction(s0, report(events), later(2)).error).toBe("bad_hunt");
  });

  it("halves each item after a knockout", () => {
    const events = wave0.slice(0, 4).map((s) => ({ kill: s.id, grade: "normal" }));
    const full = applyAction(s0, report(events), later(4)).save.items;
    const halved = applyAction(s0, report(events, { ko: true }), later(4)).save.items;
    for (const [k, n] of Object.entries(halved)) expect(n).toBe(Math.floor(full[k] / 2));
  });

  const refused: [string, () => { save: SaveData; error?: string }][] = [
    ["the same monster twice", () => applyAction(s0, report([{ kill: wave0[0].id, grade: "normal" }, { kill: wave0[0].id, grade: "normal" }]), later(2))],
    ["a monster that was never there", () => applyAction(s0, report([{ kill: "s9999", grade: "normal" }]), later(1))],
    ["a refill before anything was taken", () => applyAction(s0, report([{ kill: wave1[0].id, grade: "normal" }]), later(1))],
    ["a spot gathered twice", () => applyAction(s0, report([{ gather: plan.nodes[0].id }, { gather: plan.nodes[0].id }]), later(0))],
    ["kills faster than possible", () => applyAction(s0, report(wave0.slice(0, 5).map((s) => ({ kill: s.id, grade: "normal" }))), later(1))],
    ["a made-up grade", () => applyAction(s0, report([{ kill: wave0[0].id, grade: "golden" }]), later(1))],
    ["another hunt's id", () => applyAction(s0, { ...report([]), huntId: "nope" }, later(0))],
    ["no hunt going on", () => applyAction(newSave(), report([]), later(0))],
  ];
  for (const [what, run] of refused) {
    it(`refuses ${what} and leaves the save and the open hunt alone`, () => {
      const r = run();
      expect(r.error).toBe("bad_hunt");
      expect(r.save).toEqual(what === "no hunt going on" ? newSave() : s0);
    });
  }
});

describe("sellAll and endDay", () => {
  it("sells every item at its price, premium parts at the premium price", () => {
    const s = { ...newSave(), gold: 10, items: { "boar_belly:premium": 2, "boar_belly:normal": 3, shiitake: 2 } };
    expect(applyAction(s, { type: "sellAll" }, ctx(0)).save).toEqual({ ...s, gold: 10 + 2 * 30 + 3 * 15 + 2 * 6, items: {} });
  });
  it("moves to the next day", () => {
    expect(applyAction(newSave(), { type: "endDay" }, ctx(0)).save.day).toBe(2);
  });
  it("rejects unknown actions", () => {
    expect(applyAction(newSave(), { type: "giveMeGold", gold: 1e9 }, ctx(0)).error).toBe("bad_action");
    expect(applyAction(newSave(), "sellAll", ctx(0)).error).toBe("bad_action");
  });
});

describe("koPenalty", () => {
  it("keeps half of every stack, rounded down", () => {
    expect(koPenalty({ "boar_belly:premium": 3, shiitake: 4, perilla: 1 })).toEqual({ "boar_belly:premium": 1, shiitake: 2 });
  });
});

describe("saleLines", () => {
  it("lists each stack with what it fetches, the best-paying first, skipping unknown keys", () => {
    expect(saleLines({ shiitake: 2, "boar_belly:premium": 2, "boar_belly:normal": 3, junk: 5 })).toEqual([
      { key: "boar_belly:premium", n: 2, gold: 60 },
      { key: "boar_belly:normal", n: 3, gold: 45 },
      { key: "shiitake", n: 2, gold: 12 },
    ]);
  });
});

describe("finishHunt opens cookbook hints", () => {
  const s0 = started();
  const plan = planHunt(s0.hunt!.seed, "forest");
  const report = (events: unknown[], ko = false) => ({ type: "finishHunt", huntId: s0.hunt!.id, events, ko });
  const shiitake = plan.nodes.filter((n) => n.item === "shiitake");

  it("opens the hints of dishes using what was gained", () => {
    const r = applyAction(s0, report([{ gather: shiitake[0].id }, { gather: shiitake[1].id }]), ctx(s0.hunt!.startedAt));
    expect(r.save.hints).toEqual(["rib_stew", "shiitake_grill"]);
  });
  it("opens nothing for an item lost to a knockout", () => {
    const r = applyAction(s0, report([{ gather: shiitake[0].id }], true), ctx(s0.hunt!.startedAt));
    expect(r.save.items).toEqual({});
    expect(r.save.hints).toEqual([]);
  });
});

describe("cook", () => {
  const fridge = { ...newSave(), items: { "boar_belly:premium": 1, "boar_belly:normal": 2, perilla: 1, wild_garlic: 1, shiitake: 3 } };
  const cook = (items: unknown, method: unknown = "grill", attemptId: unknown = "a1") => ({ type: "cook", attemptId, items, method });

  it("finds a dish, uses one of each item and adds the recipe to the cookbook", () => {
    const s = { ...fridge, hints: ["belly_ssam" as DishId, "rib_stew" as DishId] };
    const r = applyAction(s, cook(["boar_belly:premium", "perilla", "wild_garlic"]), ctx(0));
    expect(r.error).toBeUndefined();
    expect(r.save.items).toEqual({ "boar_belly:normal": 2, shiitake: 3 });
    expect(r.save.cookbook).toEqual({ belly_ssam: TABLE.belly_ssam });
    expect(r.save.hints).toEqual(["rib_stew"]);
    expect(r.save.lastCook).toEqual({ attemptId: "a1", outcome: { kind: "new", dish: "belly_ssam" } });
  });
  it("uses the items on a failed try too", () => {
    const r = applyAction(fridge, cook(["shiitake", "perilla"], "fry"), ctx(0));
    expect(r.save.items).toEqual({ ...fridge.items, shiitake: 2, perilla: undefined });
    expect(r.save.lastCook?.outcome).toEqual({ kind: "fail", method: "fry" });
  });
  it("does not cook a resent try twice", () => {
    const once = applyAction(fridge, cook(["shiitake"]), ctx(0)).save;
    const again = applyAction(once, cook(["shiitake"]), ctx(0));
    expect(again.error).toBeUndefined();
    expect(again.save).toEqual(once);
  });
  it("is unavailable without the server's recipe table", () => {
    const r = applyAction(fridge, cook(["shiitake"]), ctx(0, null));
    expect(r.error).toBe("unavailable");
    expect(r.save).toEqual(fridge);
  });
  const refused: [string, unknown][] = [
    ["the same item in two grades", cook(["boar_belly:premium", "boar_belly:normal"])],
    ["an item not in the fridge", cook(["boar_rib:normal"])],
    ["an unknown item key", cook(["dragon:premium"])],
    ["four items", cook(["boar_belly:premium", "perilla", "wild_garlic", "shiitake"])],
    ["no items", cook([])],
    ["items that are not a list", cook("shiitake")],
    ["an unknown method", cook(["shiitake"], "microwave")],
    ["no attempt id", cook(["shiitake"], "grill", null)],
    ["a huge attempt id", cook(["shiitake"], "grill", "x".repeat(41))],
  ];
  for (const [what, action] of refused) {
    it(`refuses ${what} and leaves the save alone`, () => {
      const r = applyAction(fridge, action, ctx(0));
      expect(r.error).toBe("bad_cook");
      expect(r.save).toEqual(fridge);
    });
  }
});

describe("setMenu", () => {
  const s = {
    ...newSave(),
    cookbook: { grilled_belly: TABLE.grilled_belly, belly_ssam: TABLE.belly_ssam, rib_stew: TABLE.rib_stew, shiitake_grill: TABLE.shiitake_grill },
  };
  it("sets tonight's menu", () => {
    expect(applyAction(s, { type: "setMenu", dishes: ["belly_ssam", "grilled_belly"] }, ctx(0)).save.menu).toEqual(["belly_ssam", "grilled_belly"]);
  });
  it("allows an empty menu", () => {
    expect(applyAction(s, { type: "setMenu", dishes: [] }, ctx(0)).error).toBeUndefined();
  });
  const refused: [string, unknown][] = [
    ["a dish not found yet", ["baeksuk"]],
    ["a dish without its tool", ["rib_stew"]],
    ["more dishes than menu slots", ["grilled_belly", "belly_ssam", "shiitake_grill"]],
    ["the same dish twice", ["grilled_belly", "grilled_belly"]],
    ["something that is not a list", "grilled_belly"],
  ];
  for (const [what, dishes] of refused) {
    it(`refuses ${what}`, () => {
      const r = applyAction(s, { type: "setMenu", dishes }, ctx(0));
      expect(r.error).toBe("bad_menu");
      expect(r.save).toEqual(s);
    });
  }
});
