import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "./actions";
import { BALANCE } from "./balance";
import { FLOORS, isFloorId } from "./content/floors";
import { planFloor } from "./hunt/plan";
import { newSave, type SaveData } from "./save";

// The Charge King's den (plan 08d): the tusk boss drops the key, the den takes it, the King gives the
// forest's page back once and his rib every time.
const T0 = 1_000_000;
const LATE = T0 + 3_600_000;
const H = BALANCE.hunt;
const geared: Partial<SaveData> = { upgrades: { boots: 1, lantern: 1 } };

// a hunt whose seed put the tusk boss on floor 2
function startHunt(save: SaveData, wantTusk = false): SaveData {
  for (let i = 1; i < 200; i++) {
    const r = i / 200;
    const s = applyAction(save, { type: "startHunt", zone: "forest", side: "sling" }, { now: T0, random: () => r }).save;
    if (!wantTusk || planFloor(s.hunt!.seed, 2, "morning").spawns.some((x) => x.monster === "tusk")) return s;
  }
  throw new Error("no seed with the tusk boss");
}
const finish = (s: SaveData, events: unknown[], exit: string, now = LATE, ko = false) =>
  applyAction(s, { type: "finishHunt", huntId: s.hunt!.id, events, exit: ko ? null : exit, ko }, { now, random: () => 0.5 } as ActionContext);
const toDen = [{ down: 2 }, { down: 3 }, { down: 4 }, { down: 5 }];
const king = (how = "down") => ({ take: "5-boss", how });

describe("the den below the cave", () => {
  it("is floor 5, down from the cave, and takes the key", () => {
    expect(isFloorId(5)).toBe(true);
    expect(FLOORS[4].down).not.toBeNull();
    expect([FLOORS[5].needs, FLOORS[5].down]).toEqual(["key", null]);
    expect(planFloor(7, 5, "morning").spawns.map((x) => x.id)).toEqual(["5-boss"]);
  });
  it("refuses a report that went down to the den without the key", () => {
    const s = startHunt({ ...newSave(), ...geared });
    expect(finish(s, toDen, "5-e0").error).toBe("bad_hunt");
    expect(finish({ ...s, bossKey: true }, toDen, "5-e0").error).toBeUndefined();
  });
});

describe("the key", () => {
  it("comes from taking the tusk boss, and stays", () => {
    const s = startHunt(newSave(), true);
    const r = finish(s, [{ down: 2 }, { take: "2-boss", how: "down" }], "2-e0");
    expect(r.error).toBeUndefined();
    expect(r.save.bossKey).toBe(true);
    const again = finish(startHunt(r.save), [], "1-e0");
    expect(again.save.bossKey).toBe(true);
  });
});

describe("the Charge King", () => {
  const ready = () => startHunt({ ...newSave(), ...geared, bossKey: true });

  it("gives the forest's page back the first time and opens charcoal king galbi at level 1", () => {
    const r = finish(ready(), [...toDen, king()], "5-e0");
    expect(r.error).toBeUndefined();
    expect(r.save.pages).toEqual(["forest"]);
    expect(r.save.dishes.king_galbi).toBe(1);
    // his rib, twice the stars like the tusk boss
    expect(r.save.items["king_rib:normal"]).toBe(H.stars.down.count * H.stars.bossMul);
  });
  it("gives only his rib after that, and never lowers the dish's level", () => {
    const s = { ...ready(), pages: ["forest"], dishes: { king_galbi: 3 } };
    const r = finish(s, [...toDen, king("capture")], "5-e0");
    expect(r.save.pages).toEqual(["forest"]);
    expect(r.save.dishes.king_galbi).toBe(3);
    expect(r.save.items["king_rib:normal"]).toBe(H.stars.capture.count * H.stars.bossMul);
  });
  it("refuses a King taken faster than the fight could last", () => {
    const s = ready();
    const tooSoon = T0 + 4 * H.minMsPerFloor + H.minMsPerKill + H.king.minBossMs - 1;
    expect(finish(s, [...toDen, king()], "5-e0", tooSoon).error).toBe("bad_hunt");
    expect(finish(s, [...toDen, king()], "5-e0", tooSoon + 1).error).toBeUndefined();
  });
  it("still gives the page when the hunter went down after taking him", () => {
    const r = finish(ready(), [...toDen, king()], "", LATE, true);
    expect(r.save.pages).toEqual(["forest"]);
  });
});

describe("an awakened sleep gun", () => {
  it("counts the darts an awakened sleep gun needs", () => {
    // the sleep gun at level 2 carries 5 darts; the King takes 10, or ceil(10 / 1.1^8) = 5 at star 8
    const s: SaveData = { ...newSave(), upgrades: { boots: 1, lantern: 1, sleepGun: 2 }, bossKey: true, stars: { sleepGun: 8 } };
    const started = applyAction(s, { type: "startHunt", zone: "forest", side: "sleepGun" }, { now: T0, random: () => 0.3 }).save;
    expect(finish(started, [...toDen, king("sleep")], "5-e0").error).toBeUndefined();
    expect(finish({ ...started, stars: {} }, [...toDen, king("sleep")], "5-e0").error).toBe("bad_hunt");
  });
});

describe("the signature dish", () => {
  it("cannot be researched: only the page opens it", () => {
    const s = { ...newSave(), stage: "kitchen" as const, gold: 99_999, seenItems: ["king_rib" as const, "wild_garlic" as const], items: { "king_rib:normal": 2, wild_garlic: 2 } };
    expect(applyAction(s, { type: "research", dish: "king_galbi" }, { now: T0, random: () => 0.5 }).error).toBe("signature");
  });
});
