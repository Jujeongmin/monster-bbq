import { describe, expect, it } from "vitest";
import { clearShift, leftNightReport, loadShift, saveShift } from "./night";
import { Shift } from "./shift";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("the night kept across a reload", () => {
  const shift = () => new Shift({ customers: [{ id: "c0", kind: 1, arriveMs: 0, dish: "grilled_belly", patienceMs: 40_000, drink: "tea", messy: false }], dishes: [{ dish: "grilled_belly", plates: 3, price: 40 }], stools: 4, walkMul: 1, coalPerDish: 8 });
  it("stores the night for this service and reads it back", () => {
    const s = memory();
    const sh = shift();
    for (let i = 0; i < 100; i++) sh.tick(50);
    saveShift(s, "s1", sh.s);
    expect(loadShift(s, "s1")).toEqual(sh.s);
    expect(loadShift(s, "s2")).toBeUndefined();
  });
  it("starts over on garbage", () => {
    const s = memory();
    s.setItem("monster-bbq:service:s1:shift", "{oops");
    expect(loadShift(s, "s1")).toBeUndefined();
    s.setItem("monster-bbq:service:s1:shift", JSON.stringify({ clock: 5 }));
    expect(loadShift(s, "s1")).toBeUndefined();
  });
  it("does not throw when storage is blocked", () => {
    const blocked = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); }, removeItem: () => { throw new Error("no"); } };
    expect(() => saveShift(blocked, "s1", shift().s)).not.toThrow();
    expect(loadShift(blocked, "s1")).toBeUndefined();
    expect(() => clearShift(blocked, "s1")).not.toThrow();
  });
  it("settles a night left open from what was kept, or as nothing served (user 2026-10-27)", () => {
    const s = memory();
    const sh = shift();
    sh.s.guests.push({ ...sh.s.guests[0], id: "c9", servedMs: 9000, pour: null } as never);
    saveShift(s, "s1", sh.s);
    expect(leftNightReport(s, "s1")).toEqual(sh.report());
    expect(leftNightReport(s, "s2")).toEqual({ served: [], left: [], cleaned: [] });
    clearShift(s, "s1");
    expect(loadShift(s, "s1")).toBeUndefined();
  });
});
