import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "../actions";
import { newSave, type SaveData } from "../save";

const ctx = (now = 1_000_000): ActionContext => ({ now, random: () => 0.25 });
const kitchen = (extra: Partial<SaveData> = {}): SaveData => ({ ...newSave(), stage: "kitchen", ...extra });

describe("research", () => {
  const ready = kitchen({ gold: 1000, seenItems: ["boar_belly"], items: { "boar_belly:normal": 2 } });
  it("opens a dish at level 1 for its gold and one set of its ingredients", () => {
    const r = applyAction(ready, { type: "research", dish: "grilled_belly" }, ctx());
    expect(r.error).toBeUndefined();
    expect(r.save.dishes).toEqual({ grilled_belly: 1 });
    expect(r.save.gold).toBe(800);
    expect(r.save.items).toEqual({ "boar_belly:normal": 1 });
  });
  it("takes a resent research (a double click, or a retry after a lost reply) as done, paying once", () => {
    const once = applyAction(ready, { type: "research", dish: "grilled_belly" }, ctx()).save;
    const twice = applyAction(once, { type: "research", dish: "grilled_belly" }, ctx());
    expect(twice.error).toBeUndefined();
    expect(twice.save).toBe(once);
  });
  it("needs every ingredient seen, the gold and a set in the fridge", () => {
    expect(applyAction(kitchen({ gold: 1000, items: { "boar_belly:normal": 1 } }), { type: "research", dish: "grilled_belly" }, ctx()).error).toBe("unseen");
    expect(applyAction({ ...ready, gold: 199 }, { type: "research", dish: "grilled_belly" }, ctx()).error).toBe("no_gold");
    expect(applyAction({ ...ready, items: {} }, { type: "research", dish: "grilled_belly" }, ctx()).error).toBe("no_ingredients");
  });
  it("refuses unknown dishes and research outside the kitchen", () => {
    expect(applyAction(ready, { type: "research", dish: "moon_cake" }, ctx()).error).toBe("bad_action");
    expect(applyAction({ ...ready, stage: "hunt" }, { type: "research", dish: "grilled_belly" }, ctx()).error).toBe("wrong_stage");
  });
});

describe("upgradeDish", () => {
  const owned = kitchen({ gold: 5000, dishes: { grilled_belly: 1 }, items: { "boar_belly:normal": 5 } });
  it("raises a researched dish one level for gold and sets", () => {
    const r = applyAction(owned, { type: "upgradeDish", dish: "grilled_belly" }, ctx());
    expect(r.error).toBeUndefined();
    expect(r.save.dishes).toEqual({ grilled_belly: 2 });
    expect(r.save.gold).toBe(4400);
    expect(r.save.items).toEqual({ "boar_belly:normal": 4 });
  });
  it("charges the next level again on a second press (never the same level twice)", () => {
    const once = applyAction(owned, { type: "upgradeDish", dish: "grilled_belly" }, ctx()).save;
    const twice = applyAction(once, { type: "upgradeDish", dish: "grilled_belly" }, ctx());
    expect(twice.save.dishes).toEqual({ grilled_belly: 3 });
    expect(twice.save.gold).toBe(4400 - 1200);
  });
  it("takes an upgrade resent from a level already passed (a retry after a lost reply) as done, charging once", () => {
    const once = applyAction(owned, { type: "upgradeDish", dish: "grilled_belly", from: 1 }, ctx()).save;
    const resent = applyAction(once, { type: "upgradeDish", dish: "grilled_belly", from: 1 }, ctx());
    expect(resent.error).toBeUndefined();
    expect(resent.save).toBe(once);
    expect(applyAction(once, { type: "upgradeDish", dish: "grilled_belly", from: 2 }, ctx()).save.dishes).toEqual({ grilled_belly: 3 });
    expect(applyAction(once, { type: "upgradeDish", dish: "grilled_belly", from: 3 }, ctx()).error).toBe("bad_action");
  });
  it("refuses dishes not researched, the top level, no gold and no ingredients", () => {
    expect(applyAction(owned, { type: "upgradeDish", dish: "baeksuk" }, ctx()).error).toBe("unknown_dish");
    expect(applyAction({ ...owned, dishes: { grilled_belly: 5 } }, { type: "upgradeDish", dish: "grilled_belly" }, ctx()).error).toBe("max_level");
    expect(applyAction({ ...owned, gold: 10 }, { type: "upgradeDish", dish: "grilled_belly" }, ctx()).error).toBe("no_gold");
    expect(applyAction({ ...owned, items: {} }, { type: "upgradeDish", dish: "grilled_belly" }, ctx()).error).toBe("no_ingredients");
  });
});

describe("openShop", () => {
  const stocked = kitchen({
    dishes: { grilled_belly: 2, belly_ssam: 1 },
    items: { "boar_belly:normal": 2, "boar_belly:premium": 1, perilla: 1, wild_garlic: 1 },
  });
  const menu = [{ dish: "grilled_belly", sets: 2 }, { dish: "belly_ssam", sets: 1 }];
  it("takes the sets out of the fridge, keeps the menu and opens tonight with its plates and prices", () => {
    const r = applyAction(stocked, { type: "openShop", menu }, ctx(5000));
    expect(r.error).toBeUndefined();
    expect(r.save.items).toEqual({});
    expect(r.save.menu).toEqual(menu);
    expect(r.save.service).toMatchObject({
      startedAt: 5000,
      dishes: [
        { dish: "grilled_belly", plates: 8, price: 46 },
        { dish: "belly_ssam", plates: 3, price: 78 },
      ],
    });
    expect(typeof r.save.service!.id).toBe("string");
  });
  it("refuses more sets than the fridge holds across dishes that share an ingredient", () => {
    const r = applyAction(stocked, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 3 }, { dish: "belly_ssam", sets: 1 }] }, ctx());
    expect(r.error).toBe("no_ingredients");
    expect(r.save).toBe(stocked);
  });
  it("refuses an empty menu, too many lines, a dish twice, unknown or unresearched dishes and bad set counts", () => {
    expect(applyAction(stocked, { type: "openShop", menu: [] }, ctx()).error).toBe("no_menu");
    const three = [{ dish: "grilled_belly", sets: 1 }, { dish: "belly_ssam", sets: 1 }, { dish: "shiitake_grill", sets: 1 }];
    expect(applyAction(stocked, { type: "openShop", menu: three }, ctx()).error).toBe("bad_menu");
    expect(applyAction(stocked, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }, { dish: "grilled_belly", sets: 1 }] }, ctx()).error).toBe("bad_menu");
    expect(applyAction(stocked, { type: "openShop", menu: [{ dish: "baeksuk", sets: 1 }] }, ctx()).error).toBe("bad_menu");
    for (const sets of [0, 1.5, 100, "2"]) expect(applyAction(stocked, { type: "openShop", menu: [{ dish: "grilled_belly", sets }] }, ctx()).error).toBe("bad_menu");
  });
  it("opens only from the kitchen, and only once", () => {
    expect(applyAction({ ...stocked, stage: "settle" }, { type: "openShop", menu }, ctx()).error).toBe("wrong_stage");
    const open = applyAction(stocked, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }] }, ctx()).save;
    // resent after it opened (a lost reply): the open service stands, nothing is taken twice
    const again = applyAction(open, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }] }, ctx());
    expect(again.error).toBeUndefined();
    expect(again.save).toBe(open);
  });
});

describe("finishHunt sees what came home", () => {
  it("adds the ingredients brought home to seenItems once", () => {
    const s = applyAction(newSave(), { type: "startHunt", zone: "forest", side: "sling" }, ctx()).save;
    const plain = { ...s, seenItems: ["boar_belly" as const] };
    // an empty report brings nothing new
    expect(applyAction(plain, { type: "finishHunt", huntId: s.hunt!.id, events: [], exit: "1-e0", ko: false }, ctx()).save.seenItems).toEqual(["boar_belly"]);
  });
});

describe("while a service is open", () => {
  const open = (): SaveData => {
    const k = kitchen({ gold: 5000, seenItems: ["boar_belly", "shiitake"], dishes: { grilled_belly: 1 }, items: { "boar_belly:normal": 5, shiitake: 2 } });
    return applyAction(k, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }] }, ctx()).save;
  };
  it("refuses research, dish upgrades, lunches and the next day until the night is settled", () => {
    const s = open();
    expect(s.service).not.toBeNull();
    expect(applyAction(s, { type: "research", dish: "shiitake_grill" }, ctx()).error).toBe("wrong_stage");
    expect(applyAction(s, { type: "upgradeDish", dish: "grilled_belly" }, ctx()).error).toBe("wrong_stage");
    expect(applyAction(s, { type: "packLunch", dishes: ["grilled_belly"] }, ctx()).error).toBe("bad_lunch");
    expect(applyAction(s, { type: "endDay" }, ctx()).error).toBe("wrong_stage");
  });
});
