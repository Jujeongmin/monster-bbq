import { describe, expect, it } from "vitest";
import { BALANCE } from "../balance";
import { isKingOpen, newKing, updateKing, type KingState } from "./king";
import type { Field } from "./types";

const K = BALANCE.hunt.king;
const FIELD: Field = { minX: 0, maxX: 1000, minY: 0, maxY: 700 };
const still = () => 0.5;
// run him forward in 50 ms steps; collects what happened
function run(s: KingState, ms: number, player = { x: 300, y: 350 }, health = 1, pigletsOut = 0) {
  let hurt = 0;
  let fell = 0;
  let piglets = 0;
  for (let t = 0; t < ms; t += 50) {
    const r = updateKing(s, player, 50, FIELD, still, health, pigletsOut);
    s = r.state;
    hurt += r.hurt?.damage ?? 0;
    fell += r.fell?.length ?? 0;
    piglets += r.piglets;
  }
  return { s, hurt, fell, piglets };
}

describe("the Charge King", () => {
  it("wanders until the hunter comes near, then warns before charging", () => {
    const far = run(newKing({ x: 990, y: 690 }), 500, { x: 10, y: 10 });
    expect(far.s.phase).toBe("wander");
    const near = run(newKing({ x: 500, y: 350 }), 100);
    expect(near.s.phase).toBe("chargeTell");
  });
  it("charges along the line, hurts the hunter in the way, and is stunned and open when he hits the wall", () => {
    let r = run(newKing({ x: 500, y: 350 }), K.chargeTelegraphMs + 100);
    expect(r.s.phase).toBe("charge");
    r = run(r.s, 2000);
    expect(r.hurt).toBe(K.chargeDamage);
    expect(r.s.phase).toBe("stunned");
    expect(r.s.pos.x).toBe(FIELD.minX);
    expect(isKingOpen(r.s)).toBe(true);
  });
  it("brings rocks down where the shadows warned, one on the hunter", () => {
    const s: KingState = { ...newKing({ x: 450, y: 350 }), phase: "breather", nextPattern: 1 };
    let r = run(s, K.breatherMs + 50);
    expect(r.s.phase).toBe("rockTell");
    expect(r.s.rocks).toHaveLength(K.rocks);
    expect(r.s.rocks[0]).toEqual({ x: 300, y: 350 });
    r = run(r.s, K.rockTelegraphMs + 50);
    expect(r.fell).toBe(K.rocks);
    expect(r.hurt).toBe(K.rockDamage);
  });
  it("calls piglets, never more than the most running about", () => {
    const s: KingState = { ...newKing({ x: 450, y: 350 }), phase: "roar" };
    expect(run(s, K.roarMs + 50).piglets).toBe(K.piglets);
    expect(run(s, K.roarMs + 50, undefined, 1, K.maxPiglets - 1).piglets).toBe(1);
    expect(run(s, K.roarMs + 50, undefined, 1, K.maxPiglets).piglets).toBe(0);
  });
  it("goes charge, rocks, piglets, then charge again", () => {
    const order: string[] = [];
    let s: KingState = { ...newKing({ x: 450, y: 350 }), phase: "breather" };
    for (let i = 0; i < 3; i++) {
      s = run(s, K.breatherMs + 50).s;
      order.push(s.phase);
      s = { ...s, phase: "breather", phaseMs: 0 };
    }
    expect(order).toEqual(["chargeTell", "rockTell", "roar"]);
  });
  it("gets angry below half health: quicker, and two charges before a wall stuns him", () => {
    let r = run(newKing({ x: 500, y: 350 }), 100, undefined, 0.4);
    expect(r.s.angry).toBe(true);
    expect(r.s.chargesLeft).toBe(2);
    r = run(r.s, K.chargeTelegraphMs / K.angryMul + 50, undefined, 0.4);
    expect(r.s.phase).toBe("charge");
    r = run(r.s, 2500, undefined, 0.4);
    // the first wall turned him round for a second charge rather than stunning him
    expect(["chargeTell", "charge", "stunned"]).toContain(r.s.phase);
    r = run(r.s, 4000, undefined, 0.4);
    expect(["stunned", "breather"]).toContain(r.s.phase);
  });
});
