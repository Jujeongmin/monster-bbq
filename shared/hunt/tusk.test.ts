import { describe, expect, it } from "vitest";
import { BALANCE } from "../balance";
import { FLOORS } from "../content/floors";
import { planFloor } from "./plan";
import { isTuskVulnerable, mashTusk, newTusk, updateTusk, type TuskState } from "./tusk";

const T = BALANCE.hunt.tusk;
const field = FLOORS[2].field;
const run = (s: TuskState, ms: number, player = { x: s.pos.x + 60, y: s.pos.y }) => {
  let st = s;
  let hurt = 0;
  let grabbed = false;
  for (let t = 0; t < ms; t += 16) {
    const r = updateTusk(st, player, 16, field, () => 0.5);
    st = r.state;
    if (r.hurt) hurt += r.hurt.damage;
    grabbed ||= r.grabbed;
  }
  return { st, hurt, grabbed };
};

describe("the tusk boss (hunt v3 design 4.7)", () => {
  it("appears on floor 2 for some hunts only, the same for the same seed, never on floor 1", () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
    const withBoss = seeds.filter((s) => planFloor(s, 2, "morning").spawns.some((x) => x.monster === "tusk"));
    expect(withBoss.length).toBeGreaterThan(10);
    expect(withBoss.length).toBeLessThan(40);
    expect(seeds.some((s) => planFloor(s, 1, "morning").spawns.some((x) => x.monster === "tusk"))).toBe(false);
    expect(planFloor(withBoss[0], 2, "morning")).toEqual(planFloor(withBoss[0], 2, "morning"));
  });
  it("opens with three charges in a row, then catches its breath (open to counters)", () => {
    const s = newTusk({ x: 600, y: 500 });
    const { st } = run(s, 3 * (T.telegraphMs + T.chargeMs + T.chargeGapMs) + 200);
    expect(st.phase).toBe("recover");
    expect(isTuskVulnerable(st)).toBe(true);
  });
  it("cycles its patterns: charges, then the slam, then the grab", () => {
    let s: TuskState = { ...newTusk({ x: 600, y: 500 }), nextPattern: 1 };
    s = run(s, 300).st;
    expect(s.pattern).toBe("slam");
    s = { ...newTusk({ x: 600, y: 500 }), nextPattern: 2 };
    s = run(s, 300).st;
    expect(s.pattern).toBe("grab");
  });
  it("hurts on the slam only within its circle", () => {
    const near = run({ ...newTusk({ x: 600, y: 500 }), nextPattern: 1 }, T.slamTelegraphMs + 400, { x: 640, y: 500 });
    const far = run({ ...newTusk({ x: 600, y: 500 }), nextPattern: 1 }, T.slamTelegraphMs + 400, { x: 600 + T.aggroRange - 5, y: 500 });
    expect(near.hurt).toBeGreaterThanOrEqual(T.slamDamage);
    expect(far.hurt).toBe(0);
  });
  it("pins the hunter on the grab: enough mashes free him, too few cost dearly", () => {
    const grabbing: TuskState = { ...newTusk({ x: 600, y: 500 }), phase: "grab", phaseMs: 0, pattern: "grab" };
    let freed = grabbing;
    for (let i = 0; i < T.grabMashes; i++) freed = mashTusk(freed);
    expect(freed.phase).toBe("recover");
    const late = run(grabbing, T.grabMs + 50);
    expect(late.hurt).toBeGreaterThanOrEqual(T.grabDamage);
  });
});
