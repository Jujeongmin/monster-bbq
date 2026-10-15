import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "./actions";
import { newSave, readSave, type SaveData } from "./save";

// Lunchboxes (growth design 2): dishes packed in the kitchen from real ingredients, eaten on the next hunt.
const ctx = (now = 1_000_000): ActionContext => ({ now, random: () => 0.3 });
const kitchen: SaveData = {
  ...newSave(),
  stage: "kitchen",
  dishes: { grilled_belly: 1, garlic_neck: 1 },
  items: { "boar_belly:premium": 1, "boar_belly:normal": 1, "boar_neck:normal": 1, wild_garlic: 1 },
};
const pack = (s: SaveData, dishes: unknown) => applyAction(s, { type: "packLunch", dishes }, ctx());

describe("packLunch", () => {
  it("packs a found dish, using its ingredients (regular grade first)", () => {
    const r = pack(kitchen, ["grilled_belly"]);
    expect(r.error).toBeUndefined();
    expect(r.save.lunchbox).toEqual(["grilled_belly"]);
    expect(r.save.items).toEqual({ "boar_belly:premium": 1, "boar_neck:normal": 1, wild_garlic: 1 });
  });
  it("fills the box up to its slots, adding to what is already packed", () => {
    const big = { ...kitchen, upgrades: { lunchbox: 2 } };
    const once = pack(big, ["grilled_belly"]).save;
    const twice = pack(once, ["garlic_neck"]);
    expect(twice.save.lunchbox).toEqual(["grilled_belly", "garlic_neck"]);
    expect(pack(twice.save, ["grilled_belly"]).error).toBe("bad_lunch");
  });
  const refused: [string, () => { save: SaveData; error?: string }][] = [
    ["a dish not found yet", () => pack(kitchen, ["baeksuk"])],
    ["more dishes than slots", () => pack(kitchen, ["grilled_belly", "garlic_neck"])],
    ["a dish without its ingredients", () => pack({ ...kitchen, items: {} }, ["grilled_belly"])],
    ["something that is not a list", () => pack(kitchen, "grilled_belly")],
    ["packing during a hunt", () => pack({ ...kitchen, hunt: { id: "h", seed: 1, zone: "forest", startedAt: 0 } }, ["grilled_belly"])],
  ];
  for (const [what, run] of refused) {
    it(`refuses ${what} and leaves the save alone`, () => {
      const r = run();
      expect(r.error).toBe("bad_lunch");
    });
  }
});

describe("the lunchbox and the hunt", () => {
  it("is empty once the hunt is settled, eaten or not", () => {
    const packed = { ...pack(kitchen, ["grilled_belly"]).save, stage: "hunt" as const };
    const started = applyAction(packed, { type: "startHunt", zone: "forest" }, ctx()).save;
    const r = applyAction(started, { type: "finishHunt", huntId: started.hunt!.id, events: [], ko: false }, ctx());
    expect(r.save.lunchbox).toEqual([]);
  });
  it("reads only found dishes from a stored box", () => {
    expect(readSave({ ...kitchen, lunchbox: ["grilled_belly", "moon_cake", 4] }).lunchbox).toEqual(["grilled_belly"]);
  });
});
