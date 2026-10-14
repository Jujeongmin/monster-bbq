import { describe, expect, it } from "vitest";
import { applyAction, koPenalty, type ActionContext } from "./actions";
import { BALANCE } from "./balance";
import { itemKey } from "./content/items";
import { dropFor } from "./hunt/drops";
import { planHunt } from "./hunt/plan";
import { newSave, type SaveData } from "./save";

const ctx = (now: number): ActionContext => ({ now, random: () => 0.25 });

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
