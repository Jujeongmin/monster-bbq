import { describe, expect, it } from "vitest";
import { RECIPES } from "../../shared/content/recipes";
import type { Customer } from "../../shared/service/plan";
import { Shift, type ShiftConfig } from "../game/service/shift";
import { COAL_LOW, markSeen, nightTipDue, readSeen } from "./tips";

const guest = (id: string, over: Partial<Customer> = {}): Customer => ({ id, kind: 0, arriveMs: 0, dish: "grilled_belly", patienceMs: 40_000, drink: "none", messy: false, ...over });
const cfg = (customers: Customer[]): ShiftConfig => ({ customers, dishes: [{ dish: "grilled_belly", plates: 3, price: 40 }], stools: 4, walkMul: 1, coalPerDish: 8 });
const run = (sh: Shift, ms: number) => {
  for (let t = 0; t < ms; t += 50) sh.tick(50, { x: 0, run: false });
};
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("the lid's first-time tips in the night shop", () => {
  it("starts with the opening tip, then each tip the first time its moment comes", () => {
    const sh = new Shift(cfg([guest("c0")]));
    expect(nightTipDue(sh, [], new Set())).toBe("open");
    expect(nightTipDue(sh, [{ type: "cooked", dish: "grilled_belly" }], new Set(["open"]))).toBe("cooked");
    expect(nightTipDue(sh, [{ type: "take", n: 1 }], new Set(["open", "cooked"]))).toBe("carry");
    expect(nightTipDue(sh, [{ type: "angry", guest: "c0" }], new Set(["open"]))).toBe("angry");
  });
  it("calls a sell-out once", () => {
    const sh = new Shift(cfg([guest("c0")]));
    expect(nightTipDue(sh, [{ type: "soldOut" }], new Set(["open"]))).toBe("soldOut");
    expect(nightTipDue(sh, [{ type: "soldOut" }], new Set(["open", "soldOut"]))).toBeNull();
  });
  it("does not repeat a tip already seen", () => {
    const sh = new Shift(cfg([guest("c0")]));
    expect(nightTipDue(sh, [{ type: "cooked", dish: "grilled_belly" }], new Set(["open", "cooked"]))).toBeNull();
  });
  it("calls the charcoal low under 30, a drink when one is wanted, and a mess on the counter", () => {
    const sh = new Shift(cfg([guest("c0", { drink: "tea" })]));
    sh.s.coal = COAL_LOW - 1;
    expect(nightTipDue(sh, [], new Set(["open"]))).toBe("coalLow");
    sh.s.coal = 100;
    run(sh, 6000 + RECIPES.grilled_belly.cookMs);
    expect(nightTipDue(sh, [], new Set(["open"]))).toBe("drink");
    sh.s.seats[1].dirty = true;
    expect(nightTipDue(sh, [], new Set(["open", "drink"]))).toBe("mess");
  });
  it("remembers seen tips, and works when storage throws or is missing", () => {
    const store = memory();
    markSeen(store, "open");
    markSeen(store, "cooked");
    expect([...readSeen(store)].sort()).toEqual(["cooked", "open"]);
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readSeen(bad).size).toBe(0);
    expect(() => markSeen(bad, "open")).not.toThrow();
    expect(readSeen(null).size).toBe(0);
    expect(readSeen({ getItem: () => "{not json" }).size).toBe(0);
  });
});
