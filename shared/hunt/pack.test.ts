import { describe, expect, it } from "vitest";
import { angerPack, isPackVulnerable, newPackMember, updatePackMember, type PackTuning } from "./pack";

const field = { minX: 0, maxX: 1000, minY: 0, maxY: 800 };
const t: PackTuning = { wanderSpeed: 18, wanderRadius: 40, chaseSpeed: 70, peckRange: 18, windupMs: 350, peckMs: 150, recoverMs: 700, hitRadius: 16 };
const half = () => 0.5;

describe("pack member (wild chicken)", () => {
  it("pecks around home and ignores a passing hunter until the flock is angered", () => {
    const s = updatePackMember(newPackMember({ x: 300, y: 300 }), { x: 320, y: 300 }, 100, t, field, half).state;
    expect(s.phase).toBe("wander");
    expect(Math.hypot(s.pos.x - 300, s.pos.y - 300)).toBeLessThanOrEqual(40);
  });
  it("angers every calm member of the flock at once", () => {
    const flock = [newPackMember({ x: 300, y: 300 }), newPackMember({ x: 320, y: 310 }), { ...newPackMember({ x: 310, y: 290 }), phase: "recover" as const }];
    expect(angerPack(flock).map((m) => m.phase)).toEqual(["chase", "chase", "recover"]);
  });
  it("chases the hunter, then winds up a peck when close", () => {
    const chasing = { ...newPackMember({ x: 300, y: 300 }), phase: "chase" as const };
    const moved = updatePackMember(chasing, { x: 400, y: 300 }, 100, t, field, half).state;
    expect(moved.pos.x).toBeCloseTo(307);
    expect(updatePackMember({ ...chasing, pos: { x: 390, y: 300 } }, { x: 400, y: 300 }, 16, t, field, half).state.phase).toBe("windup");
  });
  it("pecks once, then catches its breath (open for counters), then chases again", () => {
    const winding = { ...newPackMember({ x: 390, y: 300 }), phase: "windup" as const, phaseMs: 340, peckDir: { x: 1, y: 0 } };
    const pecking = updatePackMember(winding, { x: 400, y: 300 }, 16, t, field, half).state;
    expect(pecking.phase).toBe("peck");
    const first = updatePackMember(pecking, { x: 400, y: 300 }, 16, t, field, half);
    expect(first.hit).toBe(true);
    expect(updatePackMember(first.state, { x: 400, y: 300 }, 16, t, field, half).hit).toBe(false);
    const recovering = updatePackMember({ ...first.state, phaseMs: 140 }, { x: 400, y: 300 }, 16, t, field, half).state;
    expect(recovering.phase).toBe("recover");
    expect(isPackVulnerable(recovering)).toBe(true);
    expect(updatePackMember({ ...recovering, phaseMs: 690 }, { x: 400, y: 300 }, 16, t, field, half).state.phase).toBe("chase");
  });
});
