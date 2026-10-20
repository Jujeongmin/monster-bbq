import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "../actions";
import { platesPerSet } from "../kitchen/dish";
import { newSave, type SaveData } from "../save";
import { addOptions } from "./addMenu";

const ctx: ActionContext = { now: 1_000_000, random: () => 0.37 };
const kitchen: SaveData = {
  ...newSave(),
  stage: "kitchen",
  day: 3,
  dishes: { grilled_belly: 1, garlic_neck: 1, chicken_perilla: 1 },
  items: { "boar_belly:normal": 3, "boar_neck:normal": 1, wild_garlic: 1, "chicken_breast:normal": 2, perilla: 2 },
};
// open with pork belly (1 set) and garlic neck (1 set); two more sets of belly and two of chicken stay
function opened(over: Partial<SaveData> = {}): SaveData {
  const r = applyAction({ ...kitchen, ...over }, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }, { dish: "garlic_neck", sets: 1 }] }, ctx);
  if (r.error) throw new Error(r.error);
  return r.save;
}
const add = (save: SaveData, dish: string, sets: number, addId = "a1", serviceId = save.service?.id) => applyAction(save, { type: "addToMenu", serviceId, dish, sets, addId }, ctx);

describe("adding to the menu during the night (addToMenu)", () => {
  it("adds sets to a dish already on tonight's menu at its price", () => {
    const s0 = opened();
    const before = s0.service!.dishes.find((d) => d.dish === "grilled_belly")!;
    const r = add(s0, "grilled_belly", 2);
    expect(r.error).toBeUndefined();
    const after = r.save.service!.dishes.find((d) => d.dish === "grilled_belly")!;
    expect(after).toEqual({ dish: "grilled_belly", plates: before.plates + 2 * platesPerSet(1), price: before.price });
    expect(r.save.items["boar_belly:normal"] ?? 0).toBe(0);
    expect(r.save.menu.find((l) => l.dish === "grilled_belly")!.sets).toBe(3);
    expect(r.save.service!.planMenu).toEqual(["grilled_belly", "garlic_neck"]);
  });
  it("adds a new dish within the menu slots", () => {
    const s0 = opened({ upgrades: { menu: 2 } });
    const r = add(s0, "chicken_perilla", 1);
    expect(r.error).toBeUndefined();
    expect(r.save.service!.dishes.map((d) => d.dish)).toEqual(["grilled_belly", "garlic_neck", "chicken_perilla"]);
    expect(r.save.service!.planMenu).toEqual(["grilled_belly", "garlic_neck"]);
    expect(r.save.menu.map((l) => l.dish)).toEqual(["grilled_belly", "garlic_neck", "chicken_perilla"]);
  });
  it("refuses a new dish with no slot left, a dish not researched, too many sets, too few ingredients, another night or no night", () => {
    const s0 = opened();
    expect(add(s0, "chicken_perilla", 1).error).toBe("no_slot");
    expect(add(opened({ upgrades: { menu: 2 } }), "honey_rabbit", 1).error).toBe("bad_menu");
    expect(add(s0, "grilled_belly", 99).error).toBe("bad_menu");
    expect(add(s0, "grilled_belly", 3).error).toBe("no_ingredients");
    expect(add(s0, "grilled_belly", 1, "a1", "other").error).toBe("bad_service");
    expect(add({ ...s0, service: null }, "grilled_belly", 1).error).toBe("wrong_stage");
    expect(add(s0, "grilled_belly", 0).error).toBe("bad_menu");
    expect(applyAction(s0, { type: "addToMenu", serviceId: s0.service!.id, dish: "grilled_belly", sets: 1 }, ctx).error).toBe("bad_menu");
  });
  it("applies one addId once", () => {
    const s0 = opened();
    const first = add(s0, "grilled_belly", 1, "x");
    const again = add(first.save, "grilled_belly", 1, "x");
    expect(again.error).toBeUndefined();
    expect(again.save).toEqual(first.save);
  });
  it("lists what can be added", () => {
    const s0 = opened();
    expect(addOptions(s0)).toEqual([{ dish: "grilled_belly", maxSets: 2, isNew: false, price: s0.service!.dishes[0].price }]);
    const roomy = opened({ upgrades: { menu: 2 } });
    expect(addOptions(roomy).map((o) => [o.dish, o.isNew, o.maxSets])).toEqual([
      ["grilled_belly", false, 2],
      ["chicken_perilla", true, 2],
    ]);
    expect(addOptions({ ...s0, service: null })).toEqual([]);
  });
});
