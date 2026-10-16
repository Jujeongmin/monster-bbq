import { describe, expect, it } from "vitest";
import { BALANCE } from "../../../shared/balance";
import { RECIPES } from "../../../shared/content/recipes";
import type { Customer } from "../../../shared/service/plan";
import { LAYOUT, Shift, type ShiftConfig } from "../service/shift";
import { lookAt, type Pose } from "./look";

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
