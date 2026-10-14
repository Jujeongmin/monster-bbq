import { describe, expect, it } from "vitest";
import { EMPTY_HIT_LOG, computeHit, coneTargets, meatGrade, nextComboStep, recordHit, type HitTuning, type WeaponStats } from "./combat";

const melee: WeaponStats = { kind: "melee", range: 30, damage: 10, cooldownMs: 550, swingMs: 450 };
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

describe("coneTargets", () => {
  const me = { x: 100, y: 100 };
  const right = { x: 1, y: 0 };
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();
  const ahead = { id: "ahead", pos: { x: 125, y: 100 } };
  const aheadUp = { id: "aheadUp", pos: { x: 118, y: 88 } };
  const side = { id: "side", pos: { x: 100, y: 125 } };
  const behind = { id: "behind", pos: { x: 80, y: 100 } };
  const far = { id: "far", pos: { x: 200, y: 100 } };

  it("hits everything within reach inside the cone toward the aim", () => {
    expect(ids(coneTargets(me, right, [ahead, aheadUp, side, behind, far], 30, Math.PI / 3))).toEqual(["ahead", "aheadUp"]);
  });
  it("turns with the aim", () => {
    expect(ids(coneTargets(me, { x: 0, y: 1 }, [ahead, side, behind], 30, Math.PI / 3))).toEqual(["side"]);
  });
  it("hits nothing when nobody is in the cone", () => {
    expect(coneTargets(me, right, [side, behind, far], 30, Math.PI / 3)).toEqual([]);
  });
});

describe("nextComboStep", () => {
  it("advances 1 -> 2 -> 3 inside the window, then wraps to 1", () => {
    expect(nextComboStep(0, 0, true, "melee", tuning)).toBe(1);
    expect(nextComboStep(1, 600, true, "melee", tuning)).toBe(2);
    expect(nextComboStep(2, 600, true, "melee", tuning)).toBe(3);
    expect(nextComboStep(3, 600, true, "melee", tuning)).toBe(1);
  });
  it("restarts at 1 after the window", () => {
    expect(nextComboStep(2, 1200, true, "melee", tuning)).toBe(1);
  });
  it("never combos with the ranged weapon", () => {
    expect(nextComboStep(1, 300, true, "ranged", tuning)).toBe(1);
  });
});

describe("computeHit", () => {
  // target at (100,100) facing left; attacker in front of it, to its left
  const base = { weapon: melee, comboStep: 1, targetVulnerable: false, attackerPos: { x: 90, y: 100 }, targetPos: { x: 100, y: 100 }, targetFacing: { x: -1, y: 0 } };
  it("deals plain weapon damage with a small push on a normal hit", () => {
    expect(computeHit(base, tuning)).toEqual({ damage: 10, finisher: false, counter: false, backAttack: false, knockback: 4 });
  });
  it("makes the last combo step a finisher that hits harder and sends the target flying", () => {
    expect(computeHit({ ...base, comboStep: 3 }, tuning)).toEqual({ damage: 18, finisher: true, counter: false, backAttack: false, knockback: 18 });
  });
  it("adds the counter bonus when the target is open", () => {
    expect(computeHit({ ...base, targetVulnerable: true }, tuning).damage).toBe(15);
  });
  it("adds the back attack bonus when hitting from behind the way the target faces", () => {
    const r = computeHit({ ...base, targetFacing: { x: 0.6, y: 0.8 } }, tuning);
    expect(r.backAttack).toBe(true);
    expect(r.damage).toBe(13);
  });
  it("stacks bonuses multiplicatively and rounds", () => {
    expect(computeHit({ ...base, comboStep: 3, targetVulnerable: true, targetFacing: { x: 1, y: 0 } }, tuning).damage).toBe(34);
  });
  it("never makes a ranged hit a finisher", () => {
    expect(computeHit({ ...base, weapon: ranged, comboStep: 3 }, tuning).finisher).toBe(false);
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
