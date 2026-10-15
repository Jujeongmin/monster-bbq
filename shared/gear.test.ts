import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "./actions";
import { FLOORS, isFloorId } from "./content/floors";
import { huntStats, lightRadius, nextMats } from "./growth";
import { planFloor } from "./hunt/plan";
import { newSave, readSave, type SaveData } from "./save";

// Gear opens the floors and costs gold plus the deep floors' materials (hunt v3 design 4.5-4.6).
const T0 = 1_000_000;
const ctx = (now = T0): ActionContext => ({ now, random: () => 0.4 });
const buy = (s: SaveData, id: string) => applyAction(s, { type: "buyUpgrade", id }, ctx());

describe("gear and the floors it opens", () => {
  it("has floors 1 to 4, the swamp needing boots and the cave a lantern", () => {
    expect([1, 2, 3, 4].every(isFloorId)).toBe(true);
    expect([FLOORS[3].needs, FLOORS[4].needs]).toEqual(["boots", "lantern"]);
    expect(FLOORS[2].down).not.toBeNull();
    expect(FLOORS[4].down).toBeNull();
  });
  it("refuses a report that went down to the swamp without boots", () => {
    const s = applyAction(newSave(), { type: "startHunt", zone: "forest", side: "sling" }, ctx()).save;
    const later = T0 + 600_000;
    const report = (save: SaveData) => applyAction(save, { type: "finishHunt", huntId: s.hunt!.id, events: [{ down: 2 }, { down: 3 }], exit: "3-e0", ko: false }, ctx(later));
    expect(report(s).error).toBe("bad_hunt");
    expect(report({ ...s, upgrades: { boots: 1 } }).error).toBeUndefined();
  });
  it("brings the swamp's frogs and snakes, and the cave's bats in flocks", () => {
    const swamp = planFloor(5, 3, "morning").spawns.filter((x) => x.wave === 0).map((x) => x.monster);
    expect(swamp.filter((m) => m === "frog").length).toBe(3);
    expect(swamp.filter((m) => m === "snake").length).toBe(3);
    const cave = planFloor(5, 4, "morning").spawns.filter((x) => x.wave === 0);
    expect(cave.filter((x) => x.monster === "bat" && x.flock).length).toBe(8);
    expect(cave.filter((x) => x.monster === "crab").length).toBe(3);
  });
});

describe("buying gear with materials", () => {
  it("takes the gold and the materials for the lantern", () => {
    const s = { ...newSave(), gold: 1000, items: { frog_skin: 4 } };
    const r = buy(s, "lantern");
    expect(r.error).toBeUndefined();
    expect([r.save.gold, r.save.items.frog_skin, r.save.upgrades.lantern]).toEqual([400, 1, 1]);
    expect(nextMats(r.save, "lantern")).toEqual([{ item: "snake_scale", n: 4 }, { item: "glow_mushroom", n: 2 }]);
  });
  it("refuses without enough materials and changes nothing", () => {
    const s = { ...newSave(), gold: 1000, items: { frog_skin: 2 } };
    expect(buy(s, "lantern")).toEqual({ save: s, error: "no_materials" });
  });
  it("sells boots for gold alone", () => {
    expect(buy({ ...newSave(), gold: 400 }, "boots").save.upgrades.boots).toBe(1);
  });
  it("lights the cave by the lantern's level", () => {
    expect([lightRadius({ upgrades: { lantern: 1 } }), lightRadius({ upgrades: { lantern: 3 } })]).toEqual([90, 170]);
  });
});

describe("the stamina tank and the apron armour (save version 7)", () => {
  it("raises stamina with the tank, and the armour now takes damage off", () => {
    expect(huntStats({ upgrades: { tank: 3 } }).maxHp).toBe(170);
    expect([huntStats({ upgrades: {} }).damageTaken, huntStats({ upgrades: { armor: 4 } }).damageTaken]).toEqual([1, 0.7]);
  });
  it("moves a version 6 save's armour levels to the tank, so stamina stays", () => {
    const v6 = { ...newSave(), version: 6, upgrades: { armor: 3 } };
    const s = readSave(v6);
    expect(s.version).toBe(7);
    expect(s.upgrades.tank).toBe(3);
    expect(s.upgrades.armor ?? 1).toBe(1);
    expect(huntStats(s).maxHp).toBe(170);
  });
});
