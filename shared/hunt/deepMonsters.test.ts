import { describe, expect, it } from "vitest";
import { BALANCE } from "../balance";
import { FLOORS } from "../content/floors";
import { angerSwarm, flipShell, isLurkerTargetable, newLurker, newShell, newSwarm, newTongue, shellDamageMul, updateLurker, updateShell, updateSwarm, updateTongue } from "./deepMonsters";

const field = FLOORS[3].field;
const D = BALANCE.hunt.deep;
const steps = <S, R extends { state: S }>(s: S, ms: number, f: (s: S) => R, each?: (r: R) => void) => {
  let st = s;
  for (let t = 0; t < ms; t += 16) {
    const r = f(st);
    each?.(r);
    st = r.state;
  }
  return st;
};

describe("frog general: puff, tongue, then open while it reels the tongue in", () => {
  it("warns, lashes the hunter in reach and pulls him, then is open", () => {
    const player = { x: 400 + 80, y: 300 };
    let hurt = 0;
    let pull = 0;
    const s = steps(newTongue({ x: 400, y: 300 }), D.frog.puffMs + D.frog.lashMs + 100, (st) => updateTongue(st, player, 16, field, () => 0.5), (r) => {
      if (r.hurt) hurt += r.hurt.damage;
      if (r.pull) pull += r.pull;
    });
    expect(hurt).toBe(D.frog.damage);
    expect(pull).toBe(D.frog.pull);
    expect(s.phase).toBe("retract");
  });
  it("misses a hunter beyond the tongue", () => {
    let hurt = 0;
    steps(newTongue({ x: 400, y: 300 }), D.frog.puffMs + D.frog.lashMs + 100, (st) => updateTongue(st, { x: 400 + D.frog.reach + 30, y: 300 }, 16, field, () => 0.5), (r) => (hurt += r.hurt?.damage ?? 0));
    expect(hurt).toBe(0);
  });
});

describe("water snake: hidden until it strikes", () => {
  it("cannot be hit while hidden, ripples, bites, then shows itself", () => {
    const s0 = newLurker({ x: 400, y: 300 });
    expect(isLurkerTargetable(s0)).toBe(false);
    let hurt = 0;
    const s = steps(s0, D.snake.rippleMs + 100, (st) => updateLurker(st, { x: 420, y: 300 }, 16, field, () => 0.5), (r) => (hurt += r.hurt?.damage ?? 0));
    expect(hurt).toBe(D.snake.damage);
    expect(s.phase).toBe("exposed");
    expect(isLurkerTargetable(s)).toBe(true);
    expect(steps(s, D.snake.exposedMs + 50, (st) => updateLurker(st, { x: 900, y: 900 }, 16, field, () => 0.5)).phase).toBe("hidden");
  });
});

describe("cave bats: dive in the dark, keep off the light", () => {
  it("folds and dives at the hunter, then is dazed", () => {
    let hurt = 0;
    const s = steps(newSwarm({ x: 400, y: 300 }), D.bat.foldMs + D.bat.diveMs + 50, (st) => updateSwarm(st, { x: 460, y: 300 }, 16, field, 0), (r) => (hurt += r.hurt?.damage ?? 0));
    expect(hurt).toBe(D.bat.damage);
    expect(s.phase).toBe("dazed");
  });
  it("does not dive at a hunter whose lantern lights it", () => {
    const s = steps(newSwarm({ x: 400, y: 300 }), 600, (st) => updateSwarm(st, { x: 460, y: 300 }, 16, field, 130));
    expect(s.phase).toBe("hover");
  });
  it("sets the whole flock diving when one is hit", () => {
    expect(angerSwarm([newSwarm({ x: 1, y: 1 }), newSwarm({ x: 2, y: 2 })]).every((b) => b.phase === "fold")).toBe(true);
  });
});

describe("glow-shroom crab: hard from the front, soft from behind, softest flipped", () => {
  it("takes 30% from the front, all from behind, double when flipped", () => {
    const s = { ...newShell({ x: 400, y: 300 }), facing: { x: 1, y: 0 } };
    expect(shellDamageMul(s, { x: 430, y: 300 })).toBeCloseTo(D.crab.frontMul);
    expect(shellDamageMul(s, { x: 370, y: 300 })).toBe(1);
    expect(shellDamageMul(flipShell(s), { x: 430, y: 300 })).toBe(D.crab.flippedMul);
  });
  it("snaps at a hunter close by after raising its claws", () => {
    let hurt = 0;
    steps(newShell({ x: 400, y: 300 }), D.crab.clawMs + 100, (st) => updateShell(st, { x: 415, y: 300 }, 16, field, () => 0.5), (r) => (hurt += r.hurt?.damage ?? 0));
    expect(hurt).toBe(D.crab.damage);
  });
});
