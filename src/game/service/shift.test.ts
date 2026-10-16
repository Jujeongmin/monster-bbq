import { describe, expect, it } from "vitest";
import { BALANCE } from "../../../shared/balance";
import { RECIPES } from "../../../shared/content/recipes";
import type { Customer } from "../../../shared/service/plan";
import { judgePour, LAYOUT, Shift, type ShiftConfig } from "./shift";

const SV = BALANCE.service;
const guest = (id: string, arriveMs: number, over: Partial<Customer> = {}): Customer => ({ id, kind: 0, arriveMs, dish: "grilled_belly", patienceMs: 40_000, drink: "none", messy: false, ...over });
const cfg = (customers: Customer[], over: Partial<ShiftConfig> = {}): ShiftConfig => ({
  customers,
  dishes: [{ dish: "grilled_belly", plates: 3, price: 40 }, { dish: "garlic_neck", plates: 3, price: 50 }],
  stools: 4,
  walkMul: 1,
  coalPerDish: 8,
  ...over,
});
// run the night forward in 50 ms steps
const run = (sh: Shift, ms: number, move = { x: 0, run: false }) => {
  for (let t = 0; t < ms; t += 50) sh.tick(50, move);
};
const goTo = (sh: Shift, x: number) => {
  sh.s.x = x;
};
// time for the first guest to walk to stool 0 and order
const SETTLE = 2000 + SV.orderDelayMs;
// seat the first guest, cook their plate, carry it over
function serveFirst(sh: Shift) {
  run(sh, SETTLE + RECIPES.grilled_belly.cookMs + 100);
  goTo(sh, LAYOUT.pass);
  expect(sh.act()).toBe(true);
  goTo(sh, sh.s.seats[0].x);
  expect(sh.act()).toBe(true);
}

describe("the night at the counter (Dave's rules)", () => {
  it("seats a guest, has them order a moment later and Bandal cook it", () => {
    const sh = new Shift(cfg([guest("c0", 0)]));
    run(sh, 1500);
    expect(sh.s.guests[0].phase).toBe("seated");
    expect(sh.s.guests[0].ordered).toBe(false);
    run(sh, SV.orderDelayMs);
    expect(sh.s.guests[0].ordered).toBe(true);
    expect(sh.s.plates.grilled_belly).toBe(2);
    run(sh, RECIPES.grilled_belly.cookMs + 100);
    expect(sh.s.pass).toEqual(["grilled_belly"]);
  });

  it("burns charcoal for each dish started, and Bandal waits when there is none", () => {
    const sh = new Shift(cfg([guest("c0", 0)]));
    run(sh, SETTLE + 100);
    expect(sh.s.coal).toBe(100 - 8);
    const dry = new Shift(cfg([guest("c0", 0)]));
    dry.s.coal = 0;
    run(dry, SETTLE + RECIPES.grilled_belly.cookMs + 500);
    expect(dry.s.pass).toEqual([]);
    expect(dry.s.kitchen[0].started).toBe(false);
    goTo(dry, LAYOUT.coalBox);
    dry.act();
    run(dry, RECIPES.grilled_belly.cookMs + 500);
    expect(dry.s.pass).toEqual(["grilled_belly"]);
  });

  it("fills the charcoal a press at a time, only a little past 80%, hands busy meanwhile", () => {
    const sh = new Shift(cfg([]));
    sh.s.coal = 50;
    goTo(sh, LAYOUT.coalBox);
    expect(sh.act()).toBe(true);
    expect(sh.s.coal).toBe(50 + SV.charcoal.press);
    expect(sh.act()).toBe(false); // still busy
    sh.s.coal = 85;
    run(sh, SV.charcoal.pressMs);
    sh.act();
    expect(sh.s.coal).toBe(85 + SV.charcoal.pressHigh);
  });

  it("keeps the kitchen waiting while the pass holds five plates", () => {
    const sh = new Shift(cfg([], { dishes: [{ dish: "grilled_belly", plates: 9, price: 40 }] }));
    sh.s.kitchen = Array.from({ length: 7 }, () => ({ dish: "grilled_belly" as const, leftMs: 100, started: false }));
    run(sh, 2000);
    expect(sh.s.pass).toHaveLength(SV.pass);
    expect(sh.s.kitchen).toHaveLength(2);
  });

  it("carries one plate at a time, a little slower", () => {
    const sh = new Shift(cfg([]));
    sh.s.pass = ["grilled_belly", "garlic_neck"];
    const empty = sh.speed(false);
    goTo(sh, LAYOUT.pass);
    expect(sh.act()).toBe(true);
    expect(sh.s.tray).toEqual([{ kind: "dish", dish: "grilled_belly" }]);
    expect(sh.canAct()).toBe(false);
    expect(sh.speed(false)).toBeCloseTo(empty * SV.walk.carryMul);
  });

  it("serves the dish; a tidy guest leaves the grill clean", () => {
    const sh = new Shift(cfg([guest("c0", 0)]));
    serveFirst(sh);
    expect(sh.s.guests[0].phase).toBe("eating");
    run(sh, SV.eatMs + 3000);
    expect(sh.s.seats[0].dirty).toBe(false);
    run(sh, 10_000);
    expect(sh.done).toBe(true);
    expect(sh.report()).toEqual({ served: [{ customer: "c0", dish: "grilled_belly", waitMs: sh.s.guests[0].servedMs }], left: [], cleaned: [] });
  });

  it("a messy guest leaves the grill dirty; scrubbing it pays and goes on the report", () => {
    const sh = new Shift(cfg([guest("c0", 0, { messy: true })]));
    serveFirst(sh);
    run(sh, SV.eatMs + 100);
    expect(sh.s.seats[0].dirty).toBe(true);
    const before = sh.earned();
    for (let i = 0; i < SV.scrub.presses; i++) {
      expect(sh.act()).toBe(true);
      run(sh, SV.scrub.pressMs);
    }
    expect(sh.s.seats[0].dirty).toBe(false);
    expect(sh.earned()).toBe(before + SV.cleanTip);
    expect(sh.report().cleaned).toEqual(["c0"]);
  });

  it("sends a guest on a dirty grill out angry unless it is scrubbed before they order", () => {
    const sh = new Shift(cfg([guest("c0", 0)], { stools: 1 }));
    sh.s.seats[0].dirty = true;
    run(sh, SETTLE + 1500); // the one stool is further down the counter
    expect(sh.s.left).toEqual(["c0"]);
    const saved = new Shift(cfg([guest("c0", 0)], { stools: 1 }));
    saved.s.seats[0].dirty = true;
    run(saved, 3000);
    expect(saved.s.guests[0].phase).toBe("seated");
    goTo(saved, saved.s.seats[0].x);
    for (let i = 0; i < SV.scrub.presses; i++) {
      saved.act();
      run(saved, SV.scrub.pressMs);
    }
    run(saved, SV.orderDelayMs);
    expect(saved.s.left).toEqual([]);
    expect(saved.s.guests[0].ordered).toBe(true);
  });

  it("sends a guest out angry when their patience runs out, calling off an order not started", () => {
    const sh = new Shift(cfg([guest("c0", 0, { patienceMs: 5000 })]));
    sh.s.coal = 0; // Bandal cannot start
    run(sh, 6000);
    expect(sh.s.left).toEqual(["c0"]);
    expect(sh.s.kitchen).toHaveLength(0);
    expect(sh.s.plates.grilled_belly).toBe(3);
  });

  it("gives a plate already cooked for someone who stormed out to the next guest who orders it", () => {
    const sh = new Shift(cfg([guest("c0", 0, { patienceMs: 9000 }), guest("c1", 10_000)], { stools: 1 }));
    run(sh, 9500);
    expect(sh.s.left).toEqual(["c0"]);
    expect(sh.s.pass).toEqual(["grilled_belly"]);
    run(sh, 6000);
    expect(sh.s.guests[1].ordered).toBe(true);
    expect(sh.s.kitchen).toHaveLength(0);
    expect(sh.s.plates.grilled_belly).toBe(2);
  });

  it("orders another dish when theirs is sold out, and closes the doors once every plate is ordered", () => {
    const sh = new Shift(cfg([guest("c0", 0), guest("c1", 100)], { dishes: [{ dish: "grilled_belly", plates: 1, price: 40 }, { dish: "garlic_neck", plates: 1, price: 50 }] }));
    run(sh, SETTLE + 3000);
    expect(sh.s.guests.map((g) => g.dish).sort()).toEqual(["garlic_neck", "grilled_belly"]);
    expect(sh.s.ordersClosed).toBe(true);
  });

  it("lets no one in after closing time", () => {
    const sh = new Shift(cfg([guest("c0", SV.openMs + 1000)]));
    run(sh, SV.openMs + 2000);
    expect(sh.s.ordersClosed).toBe(true);
    expect(sh.s.guests).toHaveLength(0);
    expect(sh.done).toBe(true);
  });

  it("judges a pour by how close it stops to the line, and an overflow is bad", () => {
    expect(judgePour(SV.drinks.line)).toBe("perfect");
    expect(judgePour(SV.drinks.line + SV.drinks.perfect + 0.02)).toBe("good");
    expect(judgePour(SV.drinks.line - SV.drinks.good - 0.02)).toBe("bad");
    expect(judgePour(1.01)).toBe("bad");
  });

  it("pours the tea a seated guest asked for, and they take it with their pour on the report", () => {
    const sh = new Shift(cfg([guest("c0", 0, { drink: "tea" })]));
    run(sh, SETTLE + 100);
    goTo(sh, LAYOUT.drinkCart);
    expect(sh.pourStart()).toBe(true);
    run(sh, SV.drinks.fillMs * SV.drinks.line);
    expect(sh.pourEnd()).toBe("perfect");
    expect(sh.pourStart()).toBe(false); // hands full, and nobody else wants one
    goTo(sh, sh.s.seats[0].x);
    expect(sh.act()).toBe(true);
    expect(sh.s.guests[0].pour).toBe("perfect");
  });

  it("lets an after-meal guest wait a while for cider, then leave without it", () => {
    const sh = new Shift(cfg([guest("c0", 0, { drink: "cider" })]));
    serveFirst(sh);
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

  it("picks up again from a saved state", () => {
    const sh = new Shift(cfg([guest("c0", 0)]));
    run(sh, SETTLE + 100);
    const again = new Shift(cfg([guest("c0", 0)]), JSON.parse(JSON.stringify(sh.s)));
    expect(again.s).toEqual(sh.s);
    run(again, RECIPES.grilled_belly.cookMs);
    expect(again.s.pass).toEqual(["grilled_belly"]);
  });
});
