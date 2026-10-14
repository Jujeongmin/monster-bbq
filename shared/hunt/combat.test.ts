import { describe, expect, it } from "vitest";
import {
  EMPTY_HIT_LOG,
  approachPoint,
  computeHit,
  decidePlayerAction,
  inAttackRange,
  meatGrade,
  nextComboStep,
  recordHit,
  type HitTuning,
  type WeaponStats,
} from "./combat";

const melee: WeaponStats = { kind: "melee", range: 26, damage: 10, cooldownMs: 550, swingMs: 450 };
const ranged: WeaponStats = { kind: "ranged", range: 140, damage: 5, cooldownMs: 700, swingMs: 450 };
const tuning: HitTuning = {
  comboSteps: 3,
  comboWindowMs: 900,
  finisherMult: 1.8,
  counterMult: 1.5,
  backAttackMult: 1.25,
  knockback: 4,
  finisherKnockback: 18,
};

describe("inAttackRange", () => {
  it("hits a target on the same lane within reach", () => {
    expect(inAttackRange({ x: 100, y: 190 }, { x: 120, y: 194 }, melee, 8)).toBe(true);
  });
  it("misses a target that is close but on another lane", () => {
    expect(inAttackRange({ x: 100, y: 190 }, { x: 110, y: 205 }, melee, 8)).toBe(false);
  });
  it("misses a target on the lane but out of reach", () => {
    expect(inAttackRange({ x: 100, y: 190 }, { x: 140, y: 190 }, melee, 8)).toBe(false);
  });
});

describe("approachPoint", () => {
  it("stands on the target's lane, a little inside reach, on the attacker's side", () => {
    expect(approachPoint({ x: 0, y: 170 }, { x: 100, y: 200 }, melee)).toEqual({ x: 100 - 26 * 0.8, y: 200 });
    expect(approachPoint({ x: 300, y: 170 }, { x: 100, y: 200 }, melee)).toEqual({ x: 100 + 26 * 0.8, y: 200 });
  });
  it("only changes lane when already close enough on x", () => {
    expect(approachPoint({ x: 60, y: 170 }, { x: 100, y: 200 }, ranged)).toEqual({ x: 60, y: 200 });
  });
});

describe("decidePlayerAction", () => {
  const here = { x: 100, y: 190 };
  it("idles with no order", () => {
    expect(decidePlayerAction(here, { kind: "none" }, melee, 8)).toEqual({ kind: "idle" });
  });
  it("walks to a tapped point and idles once there", () => {
    expect(decidePlayerAction(here, { kind: "moveTo", to: { x: 150, y: 200 } }, melee, 8)).toEqual({ kind: "move", to: { x: 150, y: 200 } });
    expect(decidePlayerAction(here, { kind: "moveTo", to: here }, melee, 8)).toEqual({ kind: "idle" });
  });
  it("attacks a target in reach and walks toward one out of reach", () => {
    expect(decidePlayerAction(here, { kind: "attack", target: { x: 115, y: 190 } }, melee, 8)).toEqual({ kind: "attack" });
    expect(decidePlayerAction(here, { kind: "attack", target: { x: 200, y: 210 } }, melee, 8)).toEqual({
      kind: "move",
      to: { x: 200 - 26 * 0.8, y: 210 },
    });
  });
});

describe("nextComboStep", () => {
  it("advances 1 -> 2 -> 3 on the same target inside the window, then wraps to 1", () => {
    expect(nextComboStep(0, 0, true, "melee", tuning)).toBe(1);
    expect(nextComboStep(1, 600, true, "melee", tuning)).toBe(2);
    expect(nextComboStep(2, 600, true, "melee", tuning)).toBe(3);
    expect(nextComboStep(3, 600, true, "melee", tuning)).toBe(1);
  });
  it("restarts at 1 after the window or on a new target", () => {
    expect(nextComboStep(2, 1200, true, "melee", tuning)).toBe(1);
    expect(nextComboStep(2, 300, false, "melee", tuning)).toBe(1);
  });
  it("never combos with the ranged weapon", () => {
    expect(nextComboStep(1, 300, true, "ranged", tuning)).toBe(1);
  });
});

describe("computeHit", () => {
  const base = { weapon: melee, comboStep: 1, targetVulnerable: false, attackerX: 90, targetX: 100, targetFacing: -1 as const };
  it("deals plain weapon damage with a small push on a normal hit", () => {
    expect(computeHit(base, tuning)).toEqual({ damage: 10, finisher: false, counter: false, backAttack: false, knockback: 4 });
  });
  it("makes the last combo step a finisher that hits harder and sends the target flying", () => {
    expect(computeHit({ ...base, comboStep: 3 }, tuning)).toEqual({ damage: 18, finisher: true, counter: false, backAttack: false, knockback: 18 });
  });
  it("adds the counter bonus when the target is open after its charge", () => {
    expect(computeHit({ ...base, targetVulnerable: true }, tuning).damage).toBe(15);
  });
  it("adds the back attack bonus when hitting from behind the target's facing", () => {
    // target faces right (+1) and the attacker stands to its left: behind it
    const r = computeHit({ ...base, targetFacing: 1 }, tuning);
    expect(r.backAttack).toBe(true);
    expect(r.damage).toBe(13);
  });
  it("stacks bonuses multiplicatively and rounds", () => {
    expect(computeHit({ ...base, comboStep: 3, targetVulnerable: true, targetFacing: 1 }, tuning).damage).toBe(34);
  });
});

describe("meatGrade", () => {
  it("is premium when a melee blow finished it and it took at most 2 ranged hits", () => {
    const log = recordHit(recordHit(recordHit(EMPTY_HIT_LOG, "ranged"), "ranged"), "melee");
    expect(meatGrade(log, 2)).toBe("premium");
  });
  it("is normal when a ranged hit finished it", () => {
    expect(meatGrade(recordHit(recordHit(EMPTY_HIT_LOG, "melee"), "ranged"), 2)).toBe("normal");
  });
  it("is normal when it took 3 or more ranged hits even if melee finished it", () => {
    let log = EMPTY_HIT_LOG;
    for (let i = 0; i < 3; i++) log = recordHit(log, "ranged");
    expect(meatGrade(recordHit(log, "melee"), 2)).toBe("normal");
  });
});
