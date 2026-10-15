import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext, type HuntEvent } from "../actions";
import { BALANCE } from "../balance";
import { FLOORS } from "../content/floors";
import { newSave, type SaveData } from "../save";
import { planFloor } from "./plan";

const T0 = 1_000_000;
const ctx = (now = T0): ActionContext => ({ now, random: () => 0.4 });
const H = BALANCE.hunt;

function started(save: SaveData = newSave()): SaveData {
  const r = applyAction(save, { type: "startHunt", zone: "forest", side: "sling" }, ctx());
  if (r.error) throw new Error(r.error);
  return r.save;
}
const finish = (s: SaveData, events: HuntEvent[], exit: string | null, ko = false, now = T0 + 600_000) =>
  applyAction(s, { type: "finishHunt", huntId: s.hunt!.id, events, exit, ko }, ctx(now));
const count = (items: Record<string, number>) => Object.values(items).reduce((a, b) => a + b, 0);

describe("finishHunt on the forest floors", () => {
  it("comes home through an exit of the floor the hunter is on", () => {
    const s = started();
    expect(finish(s, [], "1-e0").error).toBeUndefined();
    expect(finish(s, [], "2-e0").error).toBe("bad_hunt");
    expect(finish(s, [], "nowhere").error).toBe("bad_hunt");
    expect(finish(s, [], null).error).toBe("bad_hunt");
  });
  it("comes home without an exit only when knocked out, with half the bag", () => {
    const s = started();
    const plan = planFloor(s.hunt!.seed, 1, "morning");
    const four = plan.spawns.filter((x) => x.wave === 0).slice(0, 4).map((x): HuntEvent => ({ take: x.id, how: "down" }));
    const ko = finish(s, four, null, true);
    expect(ko.error).toBeUndefined();
    expect(count(ko.save.items)).toBeLessThanOrEqual(2);
    expect(finish(s, four, "1-e0", true).error).toBe("bad_hunt");
  });
  it("takes floor 2 monsters only after going down, and the way out is then on floor 2", () => {
    const s = started();
    const two = planFloor(s.hunt!.seed, 2, "morning").spawns[0];
    expect(finish(s, [{ take: two.id, how: "down" }], "1-e0").error).toBe("bad_hunt");
    const ok = finish(s, [{ down: 2 }, { take: two.id, how: "down" }], "2-e1");
    expect(ok.error).toBeUndefined();
    expect(count(ok.save.items)).toBe(1);
    expect(finish(s, [{ down: 2 }], "1-e0").error).toBe("bad_hunt");
  });
  it("refuses a floor-1 monster after going down, a skipped floor and a way down that is not there", () => {
    const s = started();
    const one = planFloor(s.hunt!.seed, 1, "morning").spawns[0];
    expect(finish(s, [{ down: 2 }, { take: one.id, how: "down" }], "2-e0").error).toBe("bad_hunt");
    expect(finish(s, [{ down: 3 as never }], "1-e0").error).toBe("bad_hunt");
    expect(finish(s, [{ down: 2 }, { down: 3 as never }], "2-e0").error).toBe("bad_hunt");
  });
  it("needs time for every way down and every monster taken", () => {
    const s = started();
    const two = planFloor(s.hunt!.seed, 2, "morning").spawns[0];
    const events: HuntEvent[] = [{ down: 2 }, { take: two.id, how: "down" }];
    const need = H.minMsPerFloor + H.minMsPerKill;
    expect(finish(s, events, "2-e0", false, T0 + need - 1).error).toBe("bad_hunt");
    expect(finish(s, events, "2-e0", false, T0 + need).error).toBeUndefined();
  });
  it("counts refills per floor: a floor's r-th refill only after r+1 kills on that floor", () => {
    const s = started();
    const p1 = planFloor(s.hunt!.seed, 1, "morning");
    const firstRefill = p1.spawns.find((x) => x.wave > 0)!;
    expect(finish(s, [{ take: firstRefill.id, how: "down" }], "1-e0").error).toBe("bad_hunt");
    const w0 = p1.spawns.find((x) => x.wave === 0)!;
    expect(finish(s, [{ take: w0.id, how: "down" }, { take: firstRefill.id, how: "down" }], "1-e0").error).toBeUndefined();
  });
  it("lists the floors' exits the way the scene shows them", () => {
    expect(FLOORS[1].exits.length).toBe(3);
  });
});

describe("two hunts a day", () => {
  it("goes morning hunt -> lunch -> afternoon hunt -> evening kitchen", () => {
    const morning = started();
    expect(morning.hunt!.period).toBe("morning");
    const lunch = finish(morning, [], "1-e0").save;
    expect(lunch.stage).toBe("lunch");
    const afternoon = started(lunch);
    expect(afternoon.hunt!.period).toBe("afternoon");
    const evening = finish(afternoon, [], "1-e2").save;
    expect(evening.stage).toBe("kitchen");
    expect(applyAction(evening, { type: "startHunt", zone: "forest", side: "sling" }, ctx()).error).toBe("wrong_stage");
  });
  it("brings the afternoon roster on the afternoon hunt", () => {
    const afternoon = started(finish(started(), [], "1-e0").save);
    const p = planFloor(afternoon.hunt!.seed, 1, "afternoon");
    const rabbits = p.spawns.filter((x) => x.wave === 0 && x.monster === "rabbit");
    const r = finish(afternoon, rabbits.map((x): HuntEvent => ({ take: x.id, how: "down" })), "1-e0");
    expect(r.error).toBeUndefined();
    expect(rabbits.length).toBe(4);
  });
  it("lets lunch skip the afternoon straight to the evening kitchen, and only from lunch", () => {
    const lunch = finish(started(), [], "1-e0").save;
    expect(applyAction(lunch, { type: "skipHunt" }, ctx()).save.stage).toBe("kitchen");
    expect(applyAction(newSave(), { type: "skipHunt" }, ctx()).error).toBe("wrong_stage");
    expect(applyAction(started(lunch), { type: "skipHunt" }, ctx()).error).toBe("wrong_stage");
  });
  it("does not end the day at lunch", () => {
    const lunch = finish(started(), [], "1-e0").save;
    expect(applyAction(lunch, { type: "endDay" }, ctx()).error).toBe("wrong_stage");
  });
  it("packs a lunchbox at lunch for the afternoon", () => {
    const lunch = { ...finish(started(), [], "1-e0").save, dishes: { grilled_belly: 1 }, items: { "boar_belly:normal": 1 } };
    expect(applyAction(lunch, { type: "packLunch", dishes: ["grilled_belly"] }, ctx()).save.lunchbox).toEqual(["grilled_belly"]);
  });
});

describe("retries after a lost reply", () => {
  it("answers a second startHunt with the hunt already open, not a new seed", () => {
    const s = started();
    const again = applyAction(s, { type: "startHunt", zone: "forest", side: "sling" }, ctx(T0 + 5000));
    expect(again.error).toBeUndefined();
    expect(again.save).toEqual(s);
  });
  it("answers a second skipHunt with the evening kitchen it already moved to", () => {
    const evening = applyAction(finish(started(), [], "1-e0").save, { type: "skipHunt" }, ctx()).save;
    const again = applyAction(evening, { type: "skipHunt" }, ctx());
    expect(again.error).toBeUndefined();
    expect(again.save).toEqual(evening);
  });
  it("still refuses a hunt from the evening kitchen", () => {
    const evening = applyAction(finish(started(), [], "1-e0").save, { type: "skipHunt" }, ctx()).save;
    expect(applyAction(evening, { type: "startHunt", zone: "forest", side: "sling" }, ctx()).error).toBe("wrong_stage");
  });
});

describe("the side weapon taken out", () => {
  it("starts a hunt with a side weapon the hunter owns, and keeps it on the hunt", () => {
    const s = applyAction(newSave(), { type: "startHunt", zone: "forest", side: "sling" }, ctx()).save;
    expect(s.hunt!.side).toBe("sling");
  });
  it("refuses a side weapon not bought yet, or no side weapon at all", () => {
    expect(applyAction(newSave(), { type: "startHunt", zone: "forest", side: "sleepGun" }, ctx()).error).toBe("locked");
    expect(applyAction(newSave(), { type: "startHunt", zone: "forest", side: "bazooka" }, ctx()).error).toBe("bad_action");
    expect(applyAction(newSave(), { type: "startHunt", zone: "forest" }, ctx()).error).toBe("bad_action");
  });
});

describe("taking monsters by stars", () => {
  const out = (side: "sling" | "sleepGun" | "netGun", upgrades = {}) =>
    applyAction({ ...newSave(), upgrades: { sleepGun: 1, netGun: 1, ...upgrades } }, { type: "startHunt", zone: "forest", side }, ctx()).save;
  const wave0 = (s: SaveData) => planFloor(s.hunt!.seed, 1, "morning").spawns.filter((x) => x.wave === 0);
  const later = T0 + 600_000;
  it("brings home 1 regular part for a knock-down, 2 for a capture, 2 premium for sleep", () => {
    const s = out("sleepGun");
    const [a, b, c] = wave0(s);
    const r = finish(s, [{ take: a.id, how: "down" }, { take: b.id, how: "capture" }, { take: c.id, how: "sleep" }], "1-e0", false, later);
    expect(r.error).toBeUndefined();
    const items = r.save.items;
    const premium = Object.entries(items).filter(([k]) => k.endsWith(":premium")).reduce((n, [, v]) => n + v, 0);
    expect([count(items), premium]).toEqual([5, 2]);
  });
  it("refuses sleep without the sleep dart gun, and the net without the net gun", () => {
    const [a] = wave0(out("sling"));
    expect(finish(out("sling"), [{ take: a.id, how: "sleep" }], "1-e0", false, later).error).toBe("bad_hunt");
    expect(finish(out("sleepGun"), [{ take: a.id, how: "net" }], "1-e0", false, later).error).toBe("bad_hunt");
  });
  it("refuses more sleeping monsters than the darts could have put down", () => {
    const s = out("sleepGun");
    const five = wave0(s).filter((x) => x.monster !== "boar").slice(0, 5);
    expect(finish(s, five.map((x): HuntEvent => ({ take: x.id, how: "sleep" })), "1-e0", false, later).error).toBe("bad_hunt");
    expect(finish(s, five.slice(0, 4).map((x): HuntEvent => ({ take: x.id, how: "sleep" })), "1-e0", false, later).error).toBeUndefined();
  });
  it("refuses a capture faster than the gauge can fill", () => {
    const s = out("sling");
    const [a] = wave0(s);
    const need = BALANCE.hunt.minMsPerKill + BALANCE.hunt.capture.minMs;
    expect(finish(s, [{ take: a.id, how: "capture" }], "1-e0", false, T0 + need - 1).error).toBe("bad_hunt");
    expect(finish(s, [{ take: a.id, how: "capture" }], "1-e0", false, T0 + need).error).toBeUndefined();
  });
  it("refuses an unknown way of taking", () => {
    const s = out("sling");
    expect(finish(s, [{ take: wave0(s)[0].id, how: "bribe" as never }], "1-e0", false, later).error).toBe("bad_hunt");
  });
  it("doubles the tusk boss's parts", () => {
    let s: SaveData | null = null;
    for (let r = 0; r < 1 && !s; r += 0.01) {
      const tried = applyAction(newSave(), { type: "startHunt", zone: "forest", side: "sling" }, { now: T0, random: () => r }).save;
      if (planFloor(tried.hunt!.seed, 2, "morning").spawns.some((x) => x.monster === "tusk")) s = tried;
    }
    const res = finish(s!, [{ down: 2 }, { take: "2-boss", how: "down" }], "2-e0", false, T0 + 600_000);
    expect(res.error).toBeUndefined();
    expect(count(res.save.items)).toBe(2);
  });
});
