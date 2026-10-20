import { describe, expect, it } from "vitest";
import { BALANCE } from "../../../shared/balance";
import { RECIPES } from "../../../shared/content/recipes";
import type { Customer } from "../../../shared/service/plan";
import { LAYOUT, Shift, type ShiftConfig } from "../service/shift";
import { lookAt, patienceTier, promptOf, serveGrade, type Pose } from "./look";

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
const run = (sh: Shift, ms: number) => {
  for (let t = 0; t < ms; t += 50) sh.tick(50, { x: 0, run: false });
};
const SETTLE = 2000 + SV.orderDelayMs;
function serveFirst(sh: Shift) {
  run(sh, SETTLE + RECIPES.grilled_belly.cookMs + 100);
  sh.s.x = LAYOUT.pass;
  expect(sh.act()).toBe(true);
  sh.s.x = sh.s.seats[0].x;
  expect(sh.act()).toBe(true);
}
const HOLD: { poseUntil: number; busy: Pose } = { poseUntil: 0, busy: "grind" };

describe("what the 3D night shows (lookAt)", () => {
  it("hides the stool under a seated guest and shows it when the seat is empty", () => {
    const sh = new Shift(cfg([guest("c0", 0)]));
    expect(lookAt(sh, 0, 0, HOLD).seats.every((s) => s.stool)).toBe(true);
    run(sh, 1500);
    expect(lookAt(sh, 0, 0, HOLD).seats[0].stool).toBe(false);
  });
  it("puts the guest's dish on the counter while they eat, and a mess after a messy guest leaves", () => {
    const sh = new Shift(cfg([guest("c0", 0, { messy: true })]));
    serveFirst(sh);
    expect(lookAt(sh, 0, 0, HOLD).seats[0].plate).toBe("dish_grilled_belly");
    run(sh, SV.eatMs + 2000);
    expect(lookAt(sh, 0, 0, HOLD).seats[0]).toMatchObject({ plate: null, mess: true });
  });
  it("asks with a bubble: the dish with patience filling up, shaking past three quarters", () => {
    const sh = new Shift(cfg([guest("c0", 0, { patienceMs: 10_000 })]));
    run(sh, SETTLE);
    sh.s.guests[0].waitedMs = 8_000;
    expect(lookAt(sh, 0, 0, HOLD).guests[0].bubble).toMatchObject({ icon: "dish_grilled_belly", patience: 0.8, shake: true });
  });
  it("poses the waiter: carry when walking with a plate, serve right after handing over, pour while pouring", () => {
    const sh = new Shift(cfg([guest("c0", 0)]));
    run(sh, SETTLE + RECIPES.grilled_belly.cookMs + 100);
    sh.s.x = LAYOUT.pass;
    sh.act();
    expect(lookAt(sh, 0, 1, HOLD).waiter).toMatchObject({ pose: "carry", carried: "dish_grilled_belly" });
    expect(lookAt(sh, 100, 0, { poseUntil: 300, busy: "grind" }).waiter.pose).toBe("serve");
    sh.s.tray = [];
    sh.s.pouring = { drink: "tea", fill: 0.3 };
    expect(lookAt(sh, 0, 0, HOLD)).toMatchObject({ waiter: { pose: "pour" }, pour: 0.3 });
  });
  it("draws walking guests in front of seated ones", () => {
    const sh = new Shift(cfg([guest("c0", 0), guest("c1", 1600)]));
    run(sh, 1800); // c0 sat down by 1500, c1 is still walking in
    const [a, b] = lookAt(sh, 0, 0, HOLD).guests;
    expect(b.z).toBeGreaterThan(a.z);
  });
  it("looks the same from a reloaded night (loadShift) as from the live one", () => {
    const sh = new Shift(cfg([guest("c0", 0, { messy: true })]));
    serveFirst(sh);
    const back = new Shift(cfg([guest("c0", 0, { messy: true })]), JSON.parse(JSON.stringify(sh.s)));
    expect(lookAt(back, 0, 0, HOLD)).toEqual(lookAt(sh, 0, 0, HOLD));
  });
});

describe("what E does at the nearest thing (promptOf)", () => {
  it("offers to take a plate at the pass, and says why not when the hands are full or nothing is ready", () => {
    const sh = new Shift(cfg([guest("c0", 0), guest("c1", 0)]));
    run(sh, SETTLE + 100);
    sh.s.x = LAYOUT.pass;
    expect(promptOf(sh)).toMatchObject({ at: { kind: "pass" }, verb: "take", ok: false, why: "cooking" });
    run(sh, RECIPES.grilled_belly.cookMs);
    expect(promptOf(sh)).toEqual({ at: { kind: "pass" }, verb: "take", ok: true, why: null });
    sh.act();
    run(sh, RECIPES.grilled_belly.cookMs + 100);
    expect(promptOf(sh)).toMatchObject({ verb: "take", ok: false, why: "handsFull" });
  });
  it("offers to give the guest their dish, or says another dish is in hand", () => {
    const sh = new Shift(cfg([guest("c0", 0)]));
    run(sh, SETTLE + RECIPES.grilled_belly.cookMs + 100);
    sh.s.x = LAYOUT.pass;
    sh.act();
    sh.s.x = sh.s.seats[0].x;
    expect(promptOf(sh)).toMatchObject({ at: { kind: "seat", seat: 0 }, verb: "give", ok: true, why: null });
    sh.s.tray = [{ kind: "dish", dish: "garlic_neck" }];
    expect(promptOf(sh)).toMatchObject({ verb: "give", ok: false, why: "otherDish" });
  });
  it("offers to scrub a messy seat and to add charcoal below 100", () => {
    const sh = new Shift(cfg([guest("c0", 0, { messy: true })]));
    serveFirst(sh);
    run(sh, SV.eatMs + 2000);
    sh.s.x = sh.s.seats[0].x;
    expect(promptOf(sh)).toMatchObject({ at: { kind: "seat", seat: 0 }, verb: "scrub", ok: true });
    sh.s.x = LAYOUT.coalBox;
    sh.s.coal = 50;
    expect(promptOf(sh)).toMatchObject({ at: { kind: "coal" }, verb: "coal", ok: true });
  });
  it("offers to pour only when a guest wants a drink", () => {
    const sh = new Shift(cfg([guest("c0", 0)]));
    sh.s.x = LAYOUT.drinkCart;
    expect(promptOf(sh)).toMatchObject({ at: { kind: "drinks" }, verb: "pour", ok: false, why: "noDrink" });
  });
  it("shows nothing out of reach, at a full charcoal box, or at an empty seat", () => {
    const sh = new Shift(cfg([]));
    sh.s.x = sh.s.seats[1].x;
    expect(promptOf(sh)).toBeNull();
    sh.s.x = LAYOUT.coalBox;
    sh.s.coal = 100;
    expect(promptOf(sh)).toBeNull();
  });
  it("colours patience green, then yellow from half, red from three quarters", () => {
    expect([0, 0.49, 0.5, 0.74, 0.75, 1].map(patienceTier)).toEqual(["ok", "ok", "warn", "warn", "late", "late"]);
  });
});

it("names a serve fast under 0.4 of the patience, good under 0.75, late after (a reaction, no money)", () => {
  expect([0, 0.39, 0.4, 0.74, 0.75].map(serveGrade)).toEqual(["fast", "fast", "good", "good", "late"]);
});

it("offers the menu at an empty pass when nothing is cooking", () => {
  const sh = new Shift(cfg([]));
  sh.s.x = LAYOUT.pass;
  expect(promptOf(sh)).toEqual({ at: { kind: "pass" }, verb: "menu", ok: true, why: null });
});

it("shows each friend on shift where they work", () => {
  const sh = new Shift(cfg([guest("c0", 0)], { staff: { serve: { id: "kkaebi", stars: 0 }, kitchen: { id: "jang", stars: 0 }, clean: { id: "sundeok", stars: 0 } } }));
  const idle = lookAt(sh, 0, 0, HOLD).helpers;
  expect(idle.map((h) => [h.id, h.job])).toEqual([["kkaebi", "serve"], ["jang", "kitchen"], ["sundeok", "clean"]]);
  expect(idle.every((h) => h.pose === "stand" && h.carried === null)).toBe(true);
  // the serving friend carries the cooked plate to the guest
  for (let t = 0; t < SETTLE + RECIPES.grilled_belly.cookMs + 100; t += 50) sh.tick(50, { x: 0, run: false });
  for (let t = 0; t < 4000 && !sh.s.helpers[0].carry.length; t += 50) sh.tick(50, { x: 0, run: false });
  const carrying = lookAt(sh, 0, 0, HOLD).helpers[0];
  expect(carrying.carried).toBe("dish_grilled_belly");
  expect(carrying.x).toBe(sh.s.helpers[0].x);
  // the cleaning friend scrubbing a messy seat
  sh.s.seats[2].dirty = true;
  const cleaner = sh.s.helpers[2];
  for (let t = 0; t < 10_000 && cleaner.busyMs === 0; t += 50) sh.tick(50, { x: 0, run: false });
  expect(lookAt(sh, 0, 0, HOLD).helpers[2].pose).toBe("scrub");
});
