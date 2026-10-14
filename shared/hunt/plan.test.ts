import { describe, expect, it } from "vitest";
import { MONSTERS } from "../content/monsters";
import { HUNT_START, planHunt } from "./plan";

const footOverlaps = (plan: ReturnType<typeof planHunt>, x: number, y: number, r: number) =>
  plan.objects.some((o) => x > o.foot.x0 - r && x < o.foot.x1 + r && y > o.foot.y0 - r && y < o.foot.y1 + r);

describe("planHunt", () => {
  it("lays out the same hunting ground for the same seed", () => {
    expect(planHunt(42, "forest")).toEqual(planHunt(42, "forest"));
  });
  it("lays out a different ground for a different seed", () => {
    expect(planHunt(42, "forest").spawns).not.toEqual(planHunt(43, "forest").spawns);
  });
  it("gives every spawn and gathering spot its own id", () => {
    const p = planHunt(7, "forest");
    const ids = [...p.spawns.map((s) => s.id), ...p.nodes.map((n) => n.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("starts with the forest roster and keeps two refill waves of it", () => {
    const p = planHunt(7, "forest");
    const wave0 = p.spawns.filter((s) => s.wave === 0);
    const count = (m: string) => wave0.filter((s) => s.monster === m).length;
    expect([count("boar"), count("rabbit"), count("bee"), count("chicken")]).toEqual([3, 3, 2, 6]);
    expect(p.spawns.filter((s) => s.wave === 1).length).toBe(wave0.length);
    expect(p.spawns.filter((s) => s.wave === 2).length).toBe(wave0.length);
    expect(p.nodes.length).toBe(10);
  });
  it("keeps monsters and gathering spots off tree bases and out of the start area", () => {
    for (const seed of [1, 2, 3]) {
      const p = planHunt(seed, "forest");
      for (const s of p.spawns) {
        expect(footOverlaps(p, s.x, s.y, MONSTERS[s.monster].radius)).toBe(false);
        expect(Math.hypot(s.x - HUNT_START.x, s.y - HUNT_START.y)).toBeGreaterThanOrEqual(150);
      }
      for (const n of p.nodes) expect(footOverlaps(p, n.x, n.y, 6)).toBe(false);
    }
  });
  it("keeps a chicken flock together", () => {
    const p = planHunt(9, "forest");
    const flocks = new Map<string, { x: number; y: number }[]>();
    for (const s of p.spawns.filter((s) => s.flock)) flocks.set(s.flock!, [...(flocks.get(s.flock!) ?? []), s]);
    expect(flocks.size).toBe(6);
    for (const members of flocks.values()) {
      expect(members.length).toBe(3);
      for (const a of members) for (const b of members) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(80);
    }
  });
});
