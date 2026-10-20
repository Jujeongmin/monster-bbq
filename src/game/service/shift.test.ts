import { describe, expect, it } from "vitest";
import { BALANCE } from "../../../shared/balance";
import { RECIPES } from "../../../shared/content/recipes";
import type { Customer } from "../../../shared/service/plan";
import { HELPER_HOME, judgePour, LAYOUT, Shift, type ShiftConfig } from "./shift";

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

describe("what a serve tells the screen", () => {
  it("carries how much of the guest's patience the wait used", () => {
    const sh = new Shift(cfg([guest("c0", 0)]));
    run(sh, SETTLE + RECIPES.grilled_belly.cookMs + 100);
    sh.drain();
    sh.s.x = LAYOUT.pass;
    sh.act();
    sh.s.guests[0].waitedMs = 10_000;
    sh.s.x = sh.s.seats[0].x;
    sh.act();
    expect(sh.drain().find((e) => e.type === "served")).toMatchObject({ type: "served", guest: "c0", ratio: 0.25 });
  });
});

describe("more dishes during the night (shop remake step 4)", () => {
  const one = { dishes: [{ dish: "grilled_belly" as const, plates: 1, price: 40 }] };
  const soldOut = (sh: Shift) => {
    for (let t = 0; t < 30_000 && !sh.s.ordersClosed; t += 50) sh.tick(50);
    expect(sh.drain().some((e) => e.type === "soldOut")).toBe(true);
  };
  it("reopens orders after a sell-out when plates are added, and the next guest comes in", () => {
    const sh = new Shift(cfg([guest("c0", 0), guest("c1", 20_000)], one));
    soldOut(sh);
    sh.addPlates("grilled_belly", 2, 40);
    expect(sh.drain()).toContainEqual({ type: "reopened" });
    expect(sh.s.ordersClosed).toBe(false);
    run(sh, 21_000 - sh.s.clock);
    expect(sh.s.arrived).toBe(2);
  });
  it("does not reopen orders the player closed", () => {
    const sh = new Shift(cfg([guest("c0", 0), guest("c1", 20_000)], one));
    run(sh, 1000);
    sh.closeOrders();
    sh.addPlates("grilled_belly", 2, 40);
    expect(sh.s.ordersClosed).toBe(true);
    expect(sh.drain().some((e) => e.type === "reopened")).toBe(false);
  });
  it("does not reopen after closing time", () => {
    const sh = new Shift(cfg([guest("c0", 0), guest("c1", 20_000)], one));
    soldOut(sh);
    sh.s.clock = SV.openMs + 1;
    sh.addPlates("grilled_belly", 2, 40);
    expect(sh.s.ordersClosed).toBe(true);
  });
  it("lets guests order a dish added tonight", () => {
    const sh = new Shift(cfg([guest("c0", 0), guest("c1", 20_000)], one));
    soldOut(sh);
    sh.addPlates("garlic_neck", 3, 50);
    // c1 walks to a free stool further along, then orders
    run(sh, 20_000 - sh.s.clock + SETTLE + 6000);
    expect(sh.s.guests.find((g) => g.id === "c1")).toMatchObject({ dish: "garlic_neck", ordered: true });
  });
  it("waits after a sell-out while more could be added, until the player closes the hall", () => {
    const sh = new Shift(cfg([guest("c0", 0), guest("c1", 60_000)], one));
    soldOut(sh);
    goTo(sh, LAYOUT.pass);
    run(sh, RECIPES.grilled_belly.cookMs + 200);
    sh.act();
    goTo(sh, sh.s.seats[0].x);
    sh.act();
    run(sh, SV.eatMs + 3000);
    sh.waitForMenu = true;
    expect(sh.done).toBe(false);
    sh.waitForMenu = false;
    expect(sh.done).toBe(true);
    sh.waitForMenu = true;
    sh.closeHall();
    expect(sh.done).toBe(true);
  });
});

describe("friends at work in the night (staff design 5)", () => {
  const staffed = (staff: ShiftConfig["staff"], customers = [guest("c0", 0)]) => new Shift({ ...cfg(customers), staff, rand: () => 0.1 });
  it("a serving friend carries a ready plate to its guest", () => {
    const sh = staffed({ serve: { id: "ppareun", stars: 0 } });
    run(sh, SETTLE + RECIPES.grilled_belly.cookMs + 9000);
    expect(sh.s.guests[0].servedMs).not.toBeNull();
  });
  it("a kitchen helper cooks faster", () => {
    const sh = staffed({ kitchen: { id: "jang", stars: 0 } });
    run(sh, SETTLE + 100);
    expect(sh.s.kitchen[0].leftMs).toBeLessThanOrEqual(RECIPES.grilled_belly.cookMs * 0.5);
  });
  it("a drinks friend pours and carries tea", () => {
    const sh = staffed({ drinks: { id: "dallae", stars: 0 } }, [guest("c0", 0, { drink: "tea" })]);
    run(sh, SETTLE + 12_000);
    expect(sh.s.guests[0].pour).not.toBeNull();
    expect(sh.s.guests[0].pour).not.toBe("bad");
  });
  it("a charcoal friend keeps the box up", () => {
    const sh = staffed({ coal: { id: "park", stars: 0 } }, []);
    sh.s.coal = 30;
    run(sh, 8000);
    expect(sh.s.coal).toBeGreaterThanOrEqual(80);
  });
  it("a cleaning friend scrubs leftovers", () => {
    const sh = staffed({ clean: { id: "sundeok", stars: 0 } }, [guest("c0", 0, { messy: true })]);
    serveFirst(sh);
    run(sh, SV.eatMs + 10_000);
    expect(sh.s.seats[0].dirty).toBe(false);
    expect(sh.s.cleaned).toContain("c0");
  });
  it("never takes what the waiter is carrying or scrubbing", () => {
    const sh = staffed({ serve: { id: "ppareun", stars: 0 }, clean: { id: "sundeok", stars: 0 } });
    // the serving friend kept far off until the plate comes out, so the waiter reaches it first
    for (let t = 0; t < SETTLE + RECIPES.grilled_belly.cookMs + 100; t += 50) {
      for (const h of sh.s.helpers) h.x = LAYOUT.door;
      sh.tick(50, { x: 0, run: false });
    }
    goTo(sh, LAYOUT.pass);
    expect(sh.act()).toBe(true);
    run(sh, 3000);
    expect(sh.s.helpers.every((h) => h.carry.length === 0)).toBe(true);
    goTo(sh, sh.s.seats[0].x);
    expect(sh.act()).toBe(true);
    expect(sh.drain().filter((e) => e.type === "served")).toHaveLength(1);
    // the waiter scrubbing seat 1: the cleaning friend leaves it to him
    sh.s.seats[1].dirty = true;
    goTo(sh, sh.s.seats[1].x);
    sh.act();
    sh.tick(50);
    expect(sh.s.helpers.find((h) => h.job === "clean")!.target).not.toBe("seat1");
  });
  it("a friend with nothing to do waits at their own spot, clear of the pass", () => {
    const sh = staffed({ serve: { id: "kkaebi", stars: 0 }, clean: { id: "sundeok", stars: 0 } }, []);
    run(sh, 8000);
    expect(sh.s.helpers.map((h) => Math.round(h.x))).toEqual([HELPER_HOME.serve, HELPER_HOME.clean]);
    expect(sh.s.helpers.every((h) => Math.abs(h.x - LAYOUT.pass) > LAYOUT.reach)).toBe(true);
  });
  it("Baekdu calms the first guest about to storm out", () => {
    const sh = staffed({ coal: { id: "baekdu", stars: 0 } }, [guest("c0", 0, { patienceMs: 5000 })]);
    run(sh, 5000 * 1.5);
    expect(sh.drain().some((e) => e.type === "calmed")).toBe(true);
    expect(sh.s.guests[0].angry).toBe(false);
  });
});
