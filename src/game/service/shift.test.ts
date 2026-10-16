import { describe, expect, it } from "vitest";
import { BALANCE } from "../../../shared/balance";
import { RECIPES } from "../../../shared/content/recipes";
import type { Customer } from "../../../shared/service/plan";
import { judgePour, LAYOUT, Shift, tipFor, type ShiftConfig } from "./shift";

const SV = BALANCE.service;
const guest = (id: string, arriveMs: number, over: Partial<Customer> = {}): Customer => ({ id, kind: 0, arriveMs, dish: "grilled_belly", patienceMs: 40_000, drink: "none", ...over });
const cfg = (customers: Customer[], over: Partial<ShiftConfig> = {}): ShiftConfig => ({
  customers,
  dishes: [{ dish: "grilled_belly", plates: 3, price: 40 }, { dish: "garlic_neck", plates: 3, price: 50 }],
  stools: 4,
  traySlots: 2,
  walkMul: 1,
  coalDrain: 0,
  ...over,
});
// run the night forward in 50 ms steps
const run = (sh: Shift, ms: number, move = { x: 0, run: false }) => {
  for (let t = 0; t < ms; t += 50) sh.tick(50, move);
};
// walk the waiter to a spot
const goTo = (sh: Shift, x: number) => {
  sh.s.x = x;
};

describe("the night at the counter", () => {
  it("seats a guest on the first clean free stool and has Bandal cook their order", () => {
    const sh = new Shift(cfg([guest("c0", 0)]));
    run(sh, 6000);
    const g = sh.s.guests[0];
    expect(g.phase).toBe("seated");
    expect(g.seat).toBe(0);
    expect(sh.s.plates.grilled_belly).toBe(2);
    run(sh, RECIPES.grilled_belly.cookMs);
    expect(sh.s.pass).toEqual(["grilled_belly"]);
  });

  it("cooks half again as slow under 30% charcoal and twice as slow at none", () => {
    const sh = new Shift(cfg([]));
    sh.s.coal = 50;
    expect(sh.cookMul()).toBe(1);
    sh.s.coal = 20;
    expect(sh.cookMul()).toBe(SV.charcoal.lowMul);
    sh.s.coal = 0;
    expect(sh.cookMul()).toBe(SV.charcoal.emptyMul);
  });

  it("burns the charcoal down by the bin's rate and fills it a press at a time, hands busy meanwhile", () => {
    const sh = new Shift(cfg([], { coalDrain: 2 }));
    run(sh, 10_000);
    expect(sh.s.coal).toBeCloseTo(80, 0);
    goTo(sh, LAYOUT.coalBox);
    expect(sh.act()).toBe(true);
    expect(sh.s.coal).toBeCloseTo(80 + SV.charcoal.press, 0);
    expect(sh.act()).toBe(false); // still busy
    run(sh, SV.charcoal.pressMs);
    expect(sh.act()).toBe(true);
  });

  it("keeps the kitchen waiting while the pass is full", () => {
    const sh = new Shift(cfg([], { dishes: [{ dish: "grilled_belly", plates: 9, price: 40 }] }));
    sh.s.kitchen = Array.from({ length: 6 }, () => ({ dish: "grilled_belly" as const, leftMs: 100 }));
    run(sh, 2000);
    expect(sh.s.pass).toHaveLength(SV.pass);
    expect(sh.s.kitchen).toHaveLength(2);
  });

  it("takes plates onto the tray only as far as it holds, and walks slower with something on it", () => {
    const sh = new Shift(cfg([]));
    sh.s.pass = ["grilled_belly", "garlic_neck", "grilled_belly"];
    const empty = sh.speed(false);
    goTo(sh, LAYOUT.pass);
    expect(sh.act()).toBe(true);
    expect(sh.s.tray).toHaveLength(2);
    expect(sh.s.pass).toEqual(["grilled_belly"]);
    expect(sh.canAct()).toBe(false);
    expect(sh.speed(false)).toBeCloseTo(empty * SV.walk.trayMul);
    expect(sh.speed(true)).toBeCloseTo(empty * SV.walk.trayMul * SV.walk.runMul);
  });

  it("serves the guest their dish, then they eat, leave and the grill is dirty until scrubbed", () => {
    const sh = new Shift(cfg([guest("c0", 0)]));
    run(sh, 6000 + RECIPES.grilled_belly.cookMs);
    goTo(sh, LAYOUT.pass);
    sh.act();
    goTo(sh, sh.s.seats[0].x);
    expect(sh.act()).toBe(true);
    const g = sh.s.guests[0];
    expect(g.phase).toBe("eating");
    expect(g.servedMs).toBeGreaterThanOrEqual(RECIPES.grilled_belly.cookMs);
    run(sh, SV.eatMs + 3000);
    expect(sh.s.seats[0].dirty).toBe(true);
    for (let i = 0; i < SV.scrub.presses; i++) {
      expect(sh.act()).toBe(true);
      run(sh, SV.scrub.pressMs);
    }
    expect(sh.s.seats[0].dirty).toBe(false);
    run(sh, 10_000);
    expect(sh.done).toBe(true);
    expect(sh.report()).toEqual({ served: [{ customer: "c0", dish: "grilled_belly", waitMs: g.servedMs }], left: [] });
  });

  it("does not seat anyone on a dirty grill: they wait by the door", () => {
    const sh = new Shift(cfg([guest("c0", 0)], { stools: 1 }));
    sh.s.seats[0].dirty = true;
    run(sh, 3000);
    expect(sh.s.guests[0].phase).toBe("queue");
  });

  it("sends a guest out angry when their patience runs out, calling off the order still cooking", () => {
    const sh = new Shift(cfg([guest("c0", 0, { patienceMs: 5000 })]));
    sh.s.coal = 0; // cooking at half speed, too slow
    run(sh, 6000);
    expect(sh.s.left).toEqual(["c0"]);
    expect(sh.s.guests[0].angry).toBe(true);
    expect(sh.s.kitchen).toHaveLength(0);
    expect(sh.s.plates.grilled_belly).toBe(3);
    expect(sh.s.seats[0].dirty).toBe(false);
  });

  it("gives a plate already cooked for someone who stormed out to the next guest who orders it", () => {
    const sh = new Shift(cfg([guest("c0", 0, { patienceMs: 7000 }), guest("c1", 9000)], { stools: 1 }));
    run(sh, 8000);
    expect(sh.s.left).toEqual(["c0"]);
    expect(sh.s.pass).toEqual(["grilled_belly"]);
    run(sh, 8000);
    expect(sh.s.guests[1].phase).toBe("seated");
    expect(sh.s.kitchen).toHaveLength(0);
    expect(sh.s.plates.grilled_belly).toBe(2);
  });

  it("orders another dish when theirs is sold out, and closes the doors once every plate is ordered", () => {
    const sh = new Shift(cfg([guest("c0", 0), guest("c1", 100)], { dishes: [{ dish: "grilled_belly", plates: 1, price: 40 }, { dish: "garlic_neck", plates: 1, price: 50 }] }));
    run(sh, 6000);
    expect(sh.s.guests.map((g) => g.dish).sort()).toEqual(["garlic_neck", "grilled_belly"]);
    expect(sh.s.ordersClosed).toBe(true);
  });

  it("judges a pour by how close it stops to the line, and an overflow is bad", () => {
    expect(judgePour(SV.drinks.line)).toBe("perfect");
    expect(judgePour(SV.drinks.line + SV.drinks.perfect + 0.02)).toBe("good");
    expect(judgePour(SV.drinks.line - SV.drinks.good - 0.02)).toBe("bad");
    expect(judgePour(1.01)).toBe("bad");
  });

  it("pours the tea a seated guest asked for, and they take it with their pour on the report", () => {
    const sh = new Shift(cfg([guest("c0", 0, { drink: "tea" })]));
    run(sh, 6000);
    goTo(sh, LAYOUT.drinkCart);
    expect(sh.pourStart()).toBe(true);
    run(sh, SV.drinks.fillMs * SV.drinks.line);
    expect(sh.pourEnd()).toBe("perfect");
    expect(sh.s.tray).toEqual([{ kind: "drink", drink: "tea", pour: "perfect" }]);
    expect(sh.pourStart()).toBe(false); // nobody else wants one
    goTo(sh, sh.s.seats[0].x);
    expect(sh.act()).toBe(true);
    expect(sh.s.guests[0].pour).toBe("perfect");
  });

  it("lets an after-meal guest wait a while for cider, then leave without it", () => {
    const sh = new Shift(cfg([guest("c0", 0, { drink: "cider" })]));
    run(sh, 6000 + RECIPES.grilled_belly.cookMs);
    goTo(sh, LAYOUT.pass);
    sh.act();
    goTo(sh, sh.s.seats[0].x);
    sh.act();
    run(sh, SV.eatMs + 100);
    expect(sh.s.guests[0].phase).toBe("thirsty");
    expect(sh.drinkWanted()).toBe("cider");
    run(sh, 13_000);
    expect(sh.s.guests[0].phase).not.toBe("thirsty");
    expect(sh.report().served[0].drink).toBeUndefined();
  });

  it("closes the hall: everyone still waiting for a dish leaves angry, the doors stay shut", () => {
    const sh = new Shift(cfg([guest("c0", 0), guest("c1", 1000), guest("c2", 60_000)]));
    run(sh, 3000);
    sh.closeHall();
    expect(sh.s.left.sort()).toEqual(["c0", "c1"]);
    run(sh, 70_000);
    expect(sh.s.guests).toHaveLength(2);
    expect(sh.done).toBe(true);
  });

  it("tips 30% for a quick plate, 15% for a middling one", () => {
    expect(tipFor(40, 5000, 40_000)).toBe(12);
    expect(tipFor(40, 20_000, 40_000)).toBe(6);
    expect(tipFor(40, 30_000, 40_000)).toBe(0);
  });

  it("picks up again from a saved state", () => {
    const sh = new Shift(cfg([guest("c0", 0)]));
    run(sh, 6000);
    const again = new Shift(cfg([guest("c0", 0)]), JSON.parse(JSON.stringify(sh.s)));
    expect(again.s).toEqual(sh.s);
    run(again, RECIPES.grilled_belly.cookMs);
    expect(again.s.pass).toEqual(["grilled_belly"]);
  });
});
