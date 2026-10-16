import { describe, expect, it } from "vitest";
import { loadShift, saveShift } from "./night";
import { Shift } from "./shift";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
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
    const blocked = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
    expect(() => saveShift(blocked, "s1", shift().s)).not.toThrow();
    expect(loadShift(blocked, "s1")).toBeUndefined();
  });
});
