import { BALANCE } from "../../../shared/balance";
import type { DishId } from "../../../shared/content/dishes";
import { RECIPES } from "../../../shared/content/recipes";
import type { TonightDish } from "../../../shared/kitchen/dish";
import type { Customer, Drink } from "../../../shared/service/plan";
import { tipFor, type Pour, type ServedEntry } from "../../../shared/service/settle";
import { statOf, type Position, type StaffId } from "../../../shared/content/staff";
import type { PendingService } from "../../../shared/save";
import { staffEffects, type StaffEffects } from "../../../shared/staff/effects";

// One night at the counter (restaurant v2 design 4, plan 07b, Dave's rules), kept out of Phaser so it
// can be tested: while the clock runs guests come in at the seed's times, take a free stool (or wait by
// the door) and order a moment later; Bandal cooks the orders one after another, each burning some
// charcoal (none left: he waits), and sets the plates on the pass; the waiter walks the aisle behind the
// counter and carries one thing at a time to the guest who wants it. Chores: charcoal, the leftovers messy
// guests leave on the counter (an empty plate and spills: scrub before the next guest orders there;
// `dirty`), drinks. ServiceScene draws this state
// and feeds it the keys; `report()` is what goes to the server.
const SV = BALANCE.service;

// Where things are along the aisle, in game pixels (the shop is 960 wide).
export const LAYOUT = {
  door: 36,
  aisle: [105, 942] as [number, number],
  counter: [100, 740] as [number, number], // the stools spread over this
  drinkCart: 768,
  pass: 846,
  coalBox: 924,
  reach: 34,
  guestSpeed: 135,
};
// Where a friend with nothing to do waits (staff design 5): near their work, clear of the pass where the
// grandchild takes plates. The kitchen helper stays by Bandal.
export const HELPER_HOME: Record<Exclude<Position, "kitchen">, number> = { serve: 690, drinks: 740, coal: 900, clean: 420 };

// Where `stools` stools stand along the counter (the night's rules and the shop by day share it).
export function seatXs(stools: number): number[] {
  const [a, b] = LAYOUT.counter;
  const step = (b - a) / stools;
  return Array.from({ length: stools }, (_, i) => Math.round(a + step * (i + 0.5)));
}
export const CARRY = 1; // one plate or drink at a time, like Dave
const AFTER_DRINK_MS = 12_000;

export type GuestPhase = "queue" | "walk" | "seated" | "eating" | "thirsty" | "leaving" | "gone";

export interface Guest {
  id: string;
  kind: Customer["kind"];
  dish: DishId;
  patienceMs: number;
  drink: Drink;
  messy: boolean;
  phase: GuestPhase;
  x: number;
  seat: number | null;
  waitedMs: number; // since coming in, until the dish arrives
  timerMs: number; // ordering (after sitting down), eating, or waiting for the after-meal drink
  ordered: boolean;
  servedMs: number | null; // the wait when the dish came
  pour: Pour | null;
  angry: boolean;
}

export interface Seat {
  x: number;
  guest: string | null;
  dirty: boolean;
  scrubs: number;
  messBy: string | null; // the guest who left it dirty
}

export type TrayItem = { kind: "dish"; dish: DishId } | { kind: "drink"; drink: Exclude<Drink, "none">; pour: Pour };

export type Target = { kind: "seat"; seat: number } | { kind: "pass" } | { kind: "drinks" } | { kind: "coal" };

// What happened this tick, for the scene to show (popping numbers, sounds later).
export type ShiftEvent =
  | { type: "arrive" | "sit" | "order" | "eat" | "leave"; guest: string }
  | { type: "angry"; guest: string }
  | { type: "served"; guest: string; dish: DishId; tip: number; ratio: number } // ratio: the patience the wait used
  | { type: "drink"; guest: string; pour: Pour }
  | { type: "cooked"; dish: DishId }
  | { type: "take"; n: number }
  | { type: "coal"; level: number }
  | { type: "noCoal" }
  | { type: "scrub"; seat: number; done: boolean; tip: number }
  | { type: "pour"; pour: Pour }
  | { type: "closing" }
  | { type: "soldOut" }
  | { type: "reopened" }
  | { type: "calmed"; guest: string };

export interface ShiftConfig {
  customers: Customer[];
  dishes: TonightDish[];
  stools: number;
  walkMul: number;
  coalPerDish: number; // % of the box each dish Bandal starts burns
  // tonight's friends as the shop opened (staff design 5), and the dice for their pours (tests fix it)
  staff?: PendingService["staff"];
  rand?: () => number;
}

// A friend at work: where they stand, what they carry, what they are busy with and aiming at (a guest's
// id, "seat2", "coal", or "pour:tea" while pouring). The kitchen helper stands by Bandal and never walks.
export interface Helper {
  id: StaffId;
  job: Position;
  stars: number;
  x: number;
  facing: 1 | -1;
  carry: TrayItem[];
  busyMs: number;
  target: string | null;
}

// Everything that changes during the night, plain data so a reload can pick it up again.
export interface ShiftState {
  clock: number;
  arrived: number; // customers (in plan order) who have come in
  guests: Guest[];
  seats: Seat[];
  plates: Partial<Record<DishId, number>>; // plates not ordered yet
  kitchen: { dish: DishId; leftMs: number; started: boolean }[];
  pass: DishId[];
  tray: TrayItem[];
  coal: number;
  x: number;
  facing: 1 | -1;
  busyMs: number;
  pouring: { drink: Exclude<Drink, "none">; fill: number } | null;
  ordersClosed: boolean;
  // who closed the orders: a sell-out reopens when plates are added (shop remake step 4), the others do not
  closedBy: "soldOut" | "player" | "clock" | null;
  left: string[];
  cleaned: string[];
  seated: number; // guests seated so far (spreads them over the stools)
  helpers: Helper[];
  calmUsed: boolean; // Old Baekdu calms one guest a night
}

export function judgePour(fill: number): Pour {
  const off = Math.abs(fill - SV.drinks.line);
  return fill > 1 ? "bad" : off <= SV.drinks.perfect ? "perfect" : off <= SV.drinks.good ? "good" : "bad";
}

export class Shift {
  s: ShiftState;
  readonly cfg: ShiftConfig;
  private prices: Map<DishId, number>;
  // tonight's dishes in menu order, growing when one is added during the night
  private menu: DishId[];
  private readonly fx: StaffEffects;
  private readonly rand: () => number;
  private events: ShiftEvent[] = [];
  // set by the page while more can still be added to the menu: a sold-out night then waits for it (or for
  // the hall to be closed) instead of ending when the last guest leaves
  waitForMenu = false;

  constructor(cfg: ShiftConfig, saved?: ShiftState) {
    this.cfg = cfg;
    this.prices = new Map(cfg.dishes.map((d) => [d.dish, d.price]));
    this.menu = cfg.dishes.map((d) => d.dish);
    this.fx = staffEffects(cfg.staff ?? {});
    this.rand = cfg.rand ?? Math.random;
    this.s = saved ?? {
      clock: 0,
      arrived: 0,
      guests: [],
      seats: seatXs(cfg.stools).map((x) => ({ x, guest: null, dirty: false, scrubs: 0, messBy: null })),
      plates: Object.fromEntries(cfg.dishes.map((d) => [d.dish, d.plates])),
      kitchen: [],
      pass: [],
      tray: [],
      coal: 100,
      x: LAYOUT.pass,
      facing: -1,
      busyMs: 0,
      pouring: null,
      ordersClosed: false,
      closedBy: null,
      left: [],
      cleaned: [],
      seated: 0,
      helpers: [],
      calmUsed: false,
    };
    this.s.closedBy ??= null; // a night saved before this field
    this.s.calmUsed ??= false;
    // tonight's friends, spread along the aisle by the pass (a reloaded night keeps where they were)
    if (!this.s.helpers?.length)
      this.s.helpers = Object.entries(cfg.staff ?? {}).map(([job, f], i): Helper => ({ id: f!.id, job: job as Position, stars: f!.stars, x: job === "kitchen" ? LAYOUT.pass : HELPER_HOME[job as Exclude<Position, "kitchen">] - 20 * i, facing: -1, carry: [], busyMs: 0, target: null }));
  }

  // the events since the last call
  drain(): ShiftEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  platesLeft(): number {
    return Object.values(this.s.plates).reduce((n, v) => n + (v ?? 0), 0);
  }

  speed(run: boolean): number {
    const w = SV.walk;
    return w.speed * this.cfg.walkMul * (run ? w.runMul : 1) * (this.s.tray.length > 0 ? w.carryMul : 1);
  }

  get done(): boolean {
    const s = this.s;
    if (this.waitForMenu && s.closedBy === "soldOut" && s.arrived < this.cfg.customers.length && s.clock < SV.openMs) return false;
    const all = this.s.arrived >= this.cfg.customers.length || this.s.ordersClosed;
    return all && (this.cfg.customers.length > 0 || this.s.ordersClosed) && this.s.guests.every((g) => g.phase === "gone");
  }

  tick(dt: number, move: { x: number; run: boolean } = { x: 0, run: false }) {
    const s = this.s;
    s.clock += dt;
    // closing time: no one else comes in
    if (!s.ordersClosed && s.clock >= SV.openMs) {
      s.ordersClosed = true;
      s.closedBy = "clock";
      this.events.push({ type: "closing" });
    }
    // the waiter: hands busy, pouring, or walking the aisle
    if (s.busyMs > 0) s.busyMs = Math.max(0, s.busyMs - dt);
    else if (s.pouring) {
      s.pouring.fill += dt / SV.drinks.fillMs;
      if (s.pouring.fill > 1) this.pourEnd();
    } else if (move.x !== 0) {
      s.facing = move.x > 0 ? 1 : -1;
      s.x = Math.max(LAYOUT.aisle[0], Math.min(LAYOUT.aisle[1], s.x + (move.x * this.speed(move.run) * dt) / 1000));
    }
    this.arrivals();
    this.cook(dt);
    for (const g of s.guests) this.stepGuest(g, dt);
    this.stepHelpers(dt);
    // nothing left to order: no one else comes in
    if (!s.ordersClosed && this.platesLeft() === 0 && !s.guests.some((g) => g.phase === "queue" || g.phase === "walk" || (g.phase === "seated" && !g.ordered))) {
      s.ordersClosed = true;
      s.closedBy = "soldOut";
      this.events.push({ type: "soldOut" });
    }
  }

  private arrivals() {
    const s = this.s;
    while (!s.ordersClosed && s.arrived < this.cfg.customers.length && this.cfg.customers[s.arrived].arriveMs <= s.clock) {
      const c = this.cfg.customers[s.arrived++];
      s.guests.push({
        id: c.id,
        kind: c.kind,
        dish: c.dish,
        // tonight's friends make guests more patient (charm, rice cakes, Old Baekdu)
        patienceMs: Math.round(c.patienceMs * this.fx.patienceMul),
        drink: c.drink,
        messy: c.messy,
        phase: "queue",
        x: LAYOUT.door,
        seat: null,
        waitedMs: s.clock - c.arriveMs,
        timerMs: 0,
        ordered: false,
        servedMs: null,
        pour: null,
        angry: false,
      });
      this.events.push({ type: "arrive", guest: c.id });
    }
  }

  // Bandal cooks the orders in turn, each burning charcoal as it starts (none left: he waits); a
  // finished plate waits in the kitchen while the pass is full.
  private cook(dt: number) {
    const s = this.s;
    const job = s.kitchen[0];
    if (!job) return;
    if (!job.started) {
      if (s.coal <= 0) return;
      s.coal = Math.max(0, s.coal - this.cfg.coalPerDish * this.fx.coalMul);
      job.started = true;
      if (s.coal === 0) this.events.push({ type: "noCoal" });
    }
    job.leftMs = Math.max(0, job.leftMs - dt);
    if (job.leftMs === 0 && s.pass.length < SV.pass) {
      s.kitchen.shift();
      s.pass.push(job.dish);
      this.events.push({ type: "cooked", dish: job.dish });
    }
  }

  // Plates of a dish already cooking, on the pass or carried, beyond the guests waiting for it.
  private spare(dish: DishId, except?: Guest): number {
    const s = this.s;
    const have = s.kitchen.filter((k) => k.dish === dish).length + s.pass.filter((d) => d === dish).length + s.tray.filter((t) => t.kind === "dish" && t.dish === dish).length;
    const waiting = s.guests.filter((g) => g !== except && g.dish === dish && g.ordered && g.servedMs === null && g.phase === "seated").length;
    return have - waiting;
  }

  // The order a seated guest gives: their dish while plates of it are left, else any dish that still
  // has some; a plate already cooked for someone who left goes to them first. false: sold out.
  private order(g: Guest): boolean {
    const s = this.s;
    const avail = (d: DishId) => (s.plates[d] ?? 0) > 0 || this.spare(d, g) > 0;
    const dish = avail(g.dish) ? g.dish : (this.menu.find(avail) ?? null);
    if (!dish) return false;
    g.dish = dish;
    if (this.spare(dish, g) <= 0) {
      s.plates[dish] = (s.plates[dish] ?? 0) - 1;
      s.kitchen.push({ dish, leftMs: Math.round(RECIPES[dish].cookMs * this.fx.cookMul), started: false });
    }
    this.events.push({ type: "order", guest: g.id });
    return true;
  }

  private stepGuest(g: Guest, dt: number) {
    const s = this.s;
    const waiting = g.phase === "queue" || g.phase === "walk" || g.phase === "seated";
    if (waiting && g.servedMs === null) {
      g.waitedMs += dt;
      if (g.waitedMs >= g.patienceMs) {
        // Old Baekdu talks the first one down: half their patience back, once a night
        if (this.fx.calm && !s.calmUsed) {
          s.calmUsed = true;
          g.waitedMs = g.patienceMs * 0.5;
          this.events.push({ type: "calmed", guest: g.id });
        } else return this.storm(g);
      }
    }
    switch (g.phase) {
      case "queue": {
        // any free stool, dirty or not, spread along the counter
        const free = s.seats.map((t, i) => (t.guest ? -1 : i)).filter((i) => i >= 0);
        if (free.length > 0) {
          const seat = free[(s.seated++ * 5) % free.length];
          s.seats[seat].guest = g.id;
          g.seat = seat;
          g.phase = "walk";
        }
        break;
      }
      case "walk": {
        const to = s.seats[g.seat!].x;
        g.x = Math.min(to, g.x + (LAYOUT.guestSpeed * dt) / 1000);
        if (g.x >= to) {
          g.phase = "seated";
          g.timerMs = SV.orderDelayMs;
          this.events.push({ type: "sit", guest: g.id });
        }
        break;
      }
      case "seated":
        // a moment to settle in, then the order; leftovers still there by then send them out angry
        if (g.ordered) break;
        g.timerMs -= dt;
        if (g.timerMs > 0) break;
        if (s.seats[g.seat!].dirty) return this.storm(g);
        g.ordered = true;
        if (!this.order(g)) this.goHome(g);
        break;
      case "eating":
        g.timerMs -= dt;
        if (g.timerMs <= 0) {
          if ((g.drink === "cider" || g.drink === "sikhye") && !g.pour) {
            g.phase = "thirsty";
            g.timerMs = AFTER_DRINK_MS;
          } else this.leave(g, g.messy);
        }
        break;
      case "thirsty":
        g.timerMs -= dt;
        if (g.timerMs <= 0) this.leave(g, g.messy);
        break;
      case "leaving":
        g.x -= (LAYOUT.guestSpeed * 1.4 * dt) / 1000;
        if (g.x <= LAYOUT.door - 60) {
          g.phase = "gone";
          this.events.push({ type: "leave", guest: g.id });
        }
        break;
    }
  }

  // Off the stool and out the door; a messy guest leaves leftovers on the counter.
  private leave(g: Guest, mess: boolean) {
    if (g.seat !== null) {
      const seat = this.s.seats[g.seat];
      seat.guest = null;
      if (mess) {
        seat.dirty = true;
        seat.scrubs = 0;
        seat.messBy = g.id;
      }
    }
    g.seat = null;
    g.phase = "leaving";
  }

  // Sold out before they could order: home, unbothered (not counted as left).
  private goHome(g: Guest) {
    this.leave(g, false);
  }

  // Out of patience, or leftovers at the seat: storms out; an order Bandal has not started is called off.
  private storm(g: Guest) {
    const s = this.s;
    if (g.phase === "seated" && g.ordered) {
      const i = s.kitchen.map((k) => (k.started ? null : k.dish)).lastIndexOf(g.dish);
      if (i >= 0 && this.spare(g.dish, g) > 0) {
        s.kitchen.splice(i, 1);
        s.plates[g.dish] = (s.plates[g.dish] ?? 0) + 1;
      }
    }
    g.angry = true;
    s.left.push(g.id);
    this.events.push({ type: "angry", guest: g.id });
    this.leave(g, false);
  }

  // The closest thing within reach of the waiter, if any.
  target(): Target | null {
    const s = this.s;
    const spots: [Target, number][] = [
      [{ kind: "pass" }, LAYOUT.pass],
      [{ kind: "drinks" }, LAYOUT.drinkCart],
      [{ kind: "coal" }, LAYOUT.coalBox],
      ...s.seats.map((t, i): [Target, number] => [{ kind: "seat", seat: i }, t.x]),
    ];
    let best: Target | null = null;
    let dist: number = LAYOUT.reach;
    for (const [t, x] of spots) {
      const d = Math.abs(x - s.x);
      if (d <= dist) {
        best = t;
        dist = d;
      }
    }
    return best;
  }

  // Whether a press of the action key would do something at the target now (the outline glows).
  canAct(t: Target | null = this.target()): boolean {
    const s = this.s;
    if (!t || s.busyMs > 0) return false;
    switch (t.kind) {
      case "pass":
        return s.pass.length > 0 && s.tray.length < CARRY;
      case "coal":
        return s.coal < 100;
      case "drinks":
        return !s.pouring && s.tray.length < CARRY && this.drinkWanted() !== null;
      case "seat": {
        const seat = s.seats[t.seat];
        if (seat.dirty) return true;
        const g = s.guests.find((x) => x.id === seat.guest);
        return !!g && this.giftFor(g) >= 0;
      }
    }
  }

  // The action key (pressed): take a plate, put it down, add charcoal, scrub leftovers. Pouring is
  // pourStart/pourEnd (held).
  act(): boolean {
    const s = this.s;
    const t = this.target();
    if (!t || s.busyMs > 0 || s.pouring || !this.canAct(t)) return false;
    switch (t.kind) {
      case "pass": {
        const n = Math.min(s.pass.length, CARRY - s.tray.length);
        for (const dish of s.pass.splice(0, n)) s.tray.push({ kind: "dish", dish });
        this.events.push({ type: "take", n });
        return true;
      }
      case "coal":
        // past `high` each press adds only a little (Dave's wasabi: better to stop at 80%)
        s.coal = Math.min(100, s.coal + (s.coal < SV.charcoal.high ? SV.charcoal.press : SV.charcoal.pressHigh));
        s.busyMs = SV.charcoal.pressMs;
        this.events.push({ type: "coal", level: s.coal });
        return true;
      case "drinks":
        return this.pourStart();
      case "seat": {
        const seat = s.seats[t.seat];
        if (seat.dirty) {
          seat.scrubs++;
          s.busyMs = SV.scrub.pressMs;
          this.scrubbed(t.seat);
          return true;
        }
        return this.give(s.guests.find((g) => g.id === seat.guest)!);
      }
    }
  }

  // Which carried item the guest takes now (-1: nothing they want): the dish they ordered, the tea they
  // asked for before or during the meal, the cider or sikhye they asked for after it.
  giftFor(g: Guest): number {
    const tray = this.s.tray;
    if (g.phase === "seated" && g.ordered && g.servedMs === null) {
      const i = tray.findIndex((t) => t.kind === "dish" && t.dish === g.dish);
      if (i >= 0) return i;
    }
    if (g.drink === "tea" && !g.pour && g.ordered && (g.phase === "seated" || g.phase === "eating")) return tray.findIndex((t) => t.kind === "drink" && t.drink === "tea");
    if (g.phase === "thirsty") return tray.findIndex((t) => t.kind === "drink" && t.drink === g.drink);
    return -1;
  }

  private give(g: Guest): boolean {
    const i = this.giftFor(g);
    if (i < 0) return false;
    const [item] = this.s.tray.splice(i, 1);
    this.deliver(g, item);
    return true;
  }

  // A plate or a drink reaches its guest (from the waiter or a friend).
  private deliver(g: Guest, item: TrayItem) {
    if (item.kind === "dish") {
      g.servedMs = Math.round(g.waitedMs);
      g.phase = "eating";
      g.timerMs = SV.eatMs;
      const price = this.prices.get(item.dish) ?? 0;
      this.events.push({ type: "served", guest: g.id, dish: item.dish, tip: Math.round(tipFor(price, false) * this.fx.tipMul), ratio: g.servedMs / g.patienceMs });
      this.events.push({ type: "eat", guest: g.id });
    } else {
      g.pour = item.pour;
      this.events.push({ type: "drink", guest: g.id, pour: item.pour });
      if (g.phase === "thirsty") this.leave(g, g.messy);
    }
  }

  // ---- tonight's friends at work (staff design 5) ----

  private stepHelpers(dt: number) {
    for (const h of this.s.helpers) {
      if (h.job === "kitchen") continue;
      if (h.busyMs > 0) {
        h.busyMs = Math.max(0, h.busyMs - dt);
        if (h.busyMs === 0) this.helperDone(h);
        continue;
      }
      // Old Park sees to the charcoal from wherever he works when it runs low
      const job: Position = h.id === "park" && (this.s.coal < 20 || h.target === "coal") ? "coal" : h.job;
      const goal = job === "serve" ? this.serveGoal(h) : job === "drinks" ? this.drinkGoal(h) : job === "coal" ? this.coalGoal(h) : this.cleanGoal(h);
      if (!goal) {
        h.target = null;
        this.walkTo(h, HELPER_HOME[h.job], dt);
        continue;
      }
      if (this.walkTo(h, goal.x, dt)) goal.act();
    }
  }

  private helperSpeed(h: Helper): number {
    return SV.walk.speed * this.cfg.walkMul * (0.5 + statOf(h.id, "serving", h.stars) / 100) * (h.id === "ppareun" ? 1.2 : 1);
  }

  private walkTo(h: Helper, x: number, dt: number): boolean {
    const d = x - h.x;
    if (Math.abs(d) <= 2) return true;
    h.facing = d > 0 ? 1 : -1;
    const step = (this.helperSpeed(h) * dt) / 1000;
    h.x = Math.abs(d) <= step ? x : h.x + Math.sign(d) * step;
    return false;
  }

  private taken(id: string, by: Helper) {
    return this.s.helpers.some((o) => o !== by && o.target === id);
  }

  // guests waiting for a dish that no one is bringing yet
  private waitingFor(dish: DishId, by: Helper): Guest[] {
    const s = this.s;
    const carried = [...s.tray, ...s.helpers.filter((o) => o !== by).flatMap((o) => o.carry)].filter((t) => t.kind === "dish" && t.dish === dish).length;
    const waiting = s.guests.filter((g) => g.phase === "seated" && g.ordered && g.servedMs === null && g.dish === dish && !this.taken(g.id, by));
    return waiting.slice(carried);
  }

  private serveGoal(h: Helper): { x: number; act: () => void } | null {
    const s = this.s;
    const item = h.carry[0];
    if (item && item.kind === "dish") {
      const g = s.guests.find((x) => x.id === h.target && x.phase === "seated" && x.servedMs === null && x.dish === item.dish) ?? this.waitingFor(item.dish, h)[0];
      if (!g || g.seat === null) {
        // no one wants it any more: back on the pass
        if (s.pass.length < SV.pass) s.pass.push(item.dish);
        h.carry.shift();
        return null;
      }
      h.target = g.id;
      return {
        x: s.seats[g.seat].x,
        act: () => {
          h.carry.shift();
          this.deliver(g, item);
          h.target = null;
        },
      };
    }
    const dish = s.pass.find((d) => this.waitingFor(d, h).length > 0);
    if (!dish) return null;
    h.target = null;
    return {
      x: LAYOUT.pass,
      act: () => {
        // Little Kkaebi takes two when there are two to take
        const room = h.id === "kkaebi" ? 2 : 1;
        for (let n = 0; n < room; n++) {
          const i = s.pass.findIndex((d) => this.waitingFor(d, h).length > h.carry.filter((c) => c.kind === "dish" && c.dish === d).length);
          if (i < 0) break;
          h.carry.push({ kind: "dish", dish: s.pass.splice(i, 1)[0] });
        }
      },
    };
  }

  private drinkGoal(h: Helper): { x: number; act: () => void } | null {
    const s = this.s;
    const item = h.carry[0];
    if (item && item.kind === "drink") {
      const wants = (g: Guest) => g.drink === item.drink && !g.pour && (item.drink === "tea" ? g.ordered && (g.phase === "seated" || g.phase === "eating") : g.phase === "thirsty");
      const g = s.guests.find((x) => x.id === h.target && wants(x)) ?? s.guests.find((x) => wants(x) && !this.taken(x.id, h));
      if (!g || g.seat === null) {
        h.carry.shift();
        return null;
      }
      h.target = g.id;
      return {
        x: s.seats[g.seat].x,
        act: () => {
          h.carry.shift();
          this.deliver(g, item);
          h.target = null;
        },
      };
    }
    const drink = this.drinkWanted();
    if (!drink) return null;
    return {
      x: LAYOUT.drinkCart,
      act: () => {
        h.target = `pour:${drink}`;
        h.busyMs = SV.drinks.fillMs;
      },
    };
  }

  // a friend's pour: better hands pour PERFECT more often; Dallae never pours a BAD one, Hongmae pours
  // PERFECT a fifth more often
  private helperPour(h: Helper): Pour {
    const dex = statOf(h.id, "dexterity", h.stars);
    const perfect = Math.min(0.9, dex / 150 + (h.id === "hongmae" ? 0.2 : 0));
    const bad = h.id === "dallae" ? 0 : Math.max(0, 0.3 - dex / 300);
    const r = this.rand();
    return r < perfect ? "perfect" : r < 1 - bad ? "good" : "bad";
  }

  private coalGoal(h: Helper): { x: number; act: () => void } | null {
    const s = this.s;
    if (s.coal >= SV.charcoal.high) {
      if (h.target === "coal") h.target = null;
      return null;
    }
    if (s.coal >= 40 && h.target !== "coal") return null;
    h.target = "coal";
    return {
      x: LAYOUT.coalBox,
      act: () => {
        s.coal = Math.min(100, s.coal + SV.charcoal.press);
        h.busyMs = SV.charcoal.pressMs;
      },
    };
  }

  private cleanGoal(h: Helper): { x: number; act: () => void } | null {
    const s = this.s;
    const w = this.target();
    // the seat the waiter is scrubbing is his
    const waiterAt = w?.kind === "seat" && s.busyMs > 0 ? w.seat : -1;
    const ok = (i: number) => s.seats[i].dirty && i !== waiterAt && !this.taken(`seat${i}`, h);
    const mine = h.target?.startsWith("seat") ? Number(h.target.slice(4)) : -1;
    const i = mine >= 0 && ok(mine) ? mine : s.seats.findIndex((_, n) => ok(n));
    if (i < 0) return null;
    h.target = `seat${i}`;
    return {
      x: s.seats[i].x,
      act: () => {
        const seat = s.seats[i];
        // Auntie Sundeok clears it in one go
        seat.scrubs = h.id === "sundeok" ? SV.scrub.presses : seat.scrubs + 1;
        this.scrubbed(i);
        h.busyMs = Math.max(100, SV.scrub.pressMs * (1.5 - statOf(h.id, "dexterity", h.stars) / 100));
      },
    };
  }

  // a scrub at a seat (the waiter's or a friend's): done once the presses are in
  private scrubbed(i: number) {
    const seat = this.s.seats[i];
    const done = seat.scrubs >= SV.scrub.presses;
    if (done) {
      seat.dirty = false;
      if (seat.messBy) this.s.cleaned.push(seat.messBy);
      seat.messBy = null;
    }
    this.events.push({ type: "scrub", seat: i, done, tip: done ? SV.cleanTip : 0 });
  }

  private helperDone(h: Helper) {
    if (h.target?.startsWith("pour:")) {
      const drink = h.target.slice(5) as Exclude<Drink, "none">;
      const pour = this.helperPour(h);
      h.carry.push({ kind: "drink", drink, pour });
      this.events.push({ type: "pour", pour });
      h.target = null;
    }
  }

  // The drink someone is waiting for that is not being carried yet: tea for seated guests who ordered
  // first, then the after-meal drinks of the thirsty.
  drinkWanted(): Exclude<Drink, "none"> | null {
    const s = this.s;
    // carried by the waiter or a friend, or being poured by a friend
    const carried = (d: Drink) =>
      [...s.tray, ...s.helpers.flatMap((h) => h.carry)].filter((t) => t.kind === "drink" && t.drink === d).length + s.helpers.filter((h) => h.target === `pour:${d}`).length;
    const want = (d: Drink, ok: (g: Guest) => boolean) => s.guests.filter((g) => g.drink === d && !g.pour && ok(g)).length - carried(d);
    if (want("tea", (g) => g.ordered && (g.phase === "seated" || g.phase === "eating")) > 0) return "tea";
    for (const d of ["cider", "sikhye"] as const) if (want(d, (g) => g.phase === "thirsty") > 0) return d;
    return null;
  }

  pourStart(): boolean {
    const s = this.s;
    const drink = this.drinkWanted();
    if (!drink || s.pouring || s.busyMs > 0 || s.tray.length >= CARRY || this.target()?.kind !== "drinks") return false;
    s.pouring = { drink, fill: 0 };
    return true;
  }

  pourEnd(): Pour | null {
    const s = this.s;
    if (!s.pouring) return null;
    const pour = judgePour(s.pouring.fill);
    s.tray.push({ kind: "drink", drink: s.pouring.drink, pour });
    s.pouring = null;
    this.events.push({ type: "pour", pour });
    return pour;
  }

  // Plates added to the menu during the night (shop remake step 4): a new dish joins tonight's list; a
  // night closed by a sell-out opens again before closing time.
  addPlates(dish: DishId, plates: number, price: number) {
    const s = this.s;
    s.plates[dish] = (s.plates[dish] ?? 0) + plates;
    if (!this.menu.includes(dish)) this.menu.push(dish);
    if (!this.prices.has(dish)) this.prices.set(dish, price);
    if (s.ordersClosed && s.closedBy === "soldOut" && s.clock < SV.openMs) {
      s.ordersClosed = false;
      s.closedBy = null;
      this.events.push({ type: "reopened" });
    }
  }

  // First press: no one else comes in. Second: whoever still waits for a dish leaves angry.
  closeOrders() {
    this.s.ordersClosed = true;
    this.s.closedBy = "player";
  }

  closeHall() {
    this.s.ordersClosed = true;
    this.s.closedBy = "player";
    for (const g of this.s.guests) if ((g.phase === "queue" || g.phase === "walk" || g.phase === "seated") && g.servedMs === null) this.storm(g);
  }

  // What goes to the server: every guest who got their dish, with the wait and the pour; the leftovers
  // scrubbed after messy guests.
  report(): { served: ServedEntry[]; left: string[]; cleaned: string[] } {
    const served = this.s.guests
      .filter((g) => g.servedMs !== null)
      .map((g): ServedEntry => ({ customer: g.id, dish: g.dish, waitMs: g.servedMs!, ...(g.pour ? { drink: g.pour } : {}) }));
    const ate = new Set(served.map((e) => e.customer));
    return { served, left: [...this.s.left], cleaned: this.s.cleaned.filter((id) => ate.has(id)) };
  }

  // Tonight's takings so far as the server will count them (the tally at the top).
  earned(): number {
    let gold = 0;
    const ate = new Set<string>();
    for (const g of this.s.guests) {
      if (g.servedMs === null) continue;
      ate.add(g.id);
      const price = this.prices.get(g.dish) ?? 0;
      gold += price + tipFor(price, g.drink === "tea" && g.pour === "perfect");
      if (g.pour && g.drink !== "none") gold += Math.round(SV.drinks.price[g.drink] * (g.pour === "perfect" ? SV.drinks.perfectMul : 1));
    }
    return gold + this.s.cleaned.filter((id) => ate.has(id)).length * SV.cleanTip;
  }
}
