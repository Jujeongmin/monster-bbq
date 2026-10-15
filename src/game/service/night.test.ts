import { describe, expect, it } from "vitest";
import { loadServed, pickDish, platesLeft, saveServed } from "./night";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("pickDish", () => {
  it("keeps the order while plates of it are left, else the first dish that has some, else none", () => {
    const plates = new Map([["grilled_belly", 0], ["garlic_neck", 2]] as const);
    expect(pickDish(plates, "garlic_neck")).toBe("garlic_neck");
    expect(pickDish(plates, "grilled_belly")).toBe("garlic_neck");
    expect(pickDish(new Map([["grilled_belly", 0]] as const), "grilled_belly")).toBeNull();
  });
});

describe("served plates kept across a reload", () => {
  it("stores what was served for this service and reads it back", () => {
    const s = memory();
    saveServed(s, "s1", [{ customer: "c0", dish: "grilled_belly" }]);
    expect(loadServed(s, "s1")).toEqual([{ customer: "c0", dish: "grilled_belly" }]);
    expect(loadServed(s, "s2")).toEqual([]);
  });
  it("drops broken entries and survives garbage or a storage that throws", () => {
    const s = memory();
    s.setItem("monster-bbq:service:s1:served", JSON.stringify([{ customer: "c0", dish: "grilled_belly" }, { customer: 3 }, { customer: "c1", dish: "moon" }]));
    expect(loadServed(s, "s1")).toEqual([{ customer: "c0", dish: "grilled_belly" }]);
    s.setItem("monster-bbq:service:s1:served", "{nope");
    expect(loadServed(s, "s1")).toEqual([]);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadServed(broken, "s1")).toEqual([]);
    expect(() => saveServed(broken, "s1", [])).not.toThrow();
  });
  it("counts the plates still left after what was served", () => {
    const left = platesLeft([{ dish: "grilled_belly", plates: 3, price: 40 }, { dish: "garlic_neck", plates: 1, price: 50 }], [{ customer: "c0", dish: "grilled_belly" }, { customer: "c1", dish: "garlic_neck" }]);
    expect([...left.entries()]).toEqual([["grilled_belly", 2], ["garlic_neck", 0]]);
  });
});
