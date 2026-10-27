import { describe, expect, it } from "vitest";
import { FLOORS } from "../content/floors";
import { MONSTERS } from "../content/monsters";
import { isTutorialHunt, planFloor, type FloorPlan } from "./plan";

const footOverlaps = (plan: FloorPlan, x: number, y: number, r: number) =>
  plan.objects.some((o) => x > o.foot.x0 - r && x < o.foot.x1 + r && y > o.foot.y0 - r && y < o.foot.y1 + r);

describe("planFloor", () => {
  it("puts the first hunt's own rabbit in front of the nearest cart, on floor 1 only (tutorial, user 2026-10-27)", () => {
    expect(isTutorialHunt(1, "morning")).toBe(true);
    expect(isTutorialHunt(1, "afternoon")).toBe(false);
    expect(isTutorialHunt(2, "morning")).toBe(false);
    const tut = planFloor(7, 1, "morning", true).spawns.filter((s) => s.id === "1-tut");
    expect(tut).toEqual([expect.objectContaining({ monster: "rabbit", wave: 0 })]);
    expect(planFloor(7, 1, "morning").spawns.some((s) => s.id === "1-tut")).toBe(false);
    expect(planFloor(7, 2, "morning", true).spawns.some((s) => s.id.endsWith("-tut"))).toBe(false);
    // the rest of the floor is the same with or without it
    expect(planFloor(7, 1, "morning", true).spawns.filter((s) => s.id !== "1-tut")).toEqual(planFloor(7, 1, "morning").spawns);
  });
  it("lays out the same floor for the same seed", () => {
    expect(planFloor(42, 1, "morning")).toEqual(planFloor(42, 1, "morning"));
  });
  it("keeps the ground of a floor fixed and moves only who and what is on it", () => {
    const a = planFloor(42, 1, "morning");
    const b = planFloor(43, 1, "morning");
    expect(a.objects).toEqual(b.objects);
    expect(a.spawns).not.toEqual(b.spawns);
    expect(a.nodes).not.toEqual(b.nodes);
  });
  it("keeps the forest open: about 18 trees and 12 bushes or rocks a floor (user, 2026-10-15: too crowded)", () => {
    for (const floor of [1, 2] as const) {
      const objects = planFloor(1, floor, "morning").objects;
      const trees = objects.filter((o) => o.kind.startsWith("tree")).length;
      expect(trees).toBeLessThanOrEqual(18);
      expect(objects.length - trees).toBeLessThanOrEqual(12);
      expect(objects.length).toBeGreaterThanOrEqual(15);
    }
  });
  it("gives each floor its own ground", () => {
    expect(planFloor(42, 1, "morning").objects).not.toEqual(planFloor(42, 2, "morning").objects);
  });
  it("names every spawn and gathering spot after its floor, each once", () => {
    for (const floor of [1, 2] as const) {
      const p = planFloor(7, floor, "morning");
      const ids = [...p.spawns.map((s) => s.id), ...p.nodes.map((n) => n.id)];
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id.startsWith(`${floor}-`)).toBe(true);
    }
  });
  it("brings the floor's roster for the time of day, with its refill waves", () => {
    const count = (p: FloorPlan, m: string, wave = 0) => p.spawns.filter((s) => s.wave === wave && s.monster === m).length;
    const m1 = planFloor(7, 1, "morning");
    expect([count(m1, "rabbit"), count(m1, "chicken"), count(m1, "boar")]).toEqual([3, 6, 0]);
    const a1 = planFloor(7, 1, "afternoon");
    expect([count(a1, "rabbit"), count(a1, "chicken")]).toEqual([4, 3]);
    const m2 = planFloor(7, 2, "morning");
    expect([count(m2, "boar"), count(m2, "bee"), count(m2, "rabbit"), count(m2, "chicken")]).toEqual([3, 2, 1, 0]);
    const wave0 = m1.spawns.filter((s) => s.wave === 0).length;
    expect(m1.spawns.filter((s) => s.wave === 2).length).toBe(wave0);
    expect(m1.nodes.length).toBe(10); // shiitake 2, wild garlic 3, perilla 5
  });
  it("keeps monsters, gathering spots and trees clear of the start, the exits and the way down", () => {
    for (const floor of [1, 2] as const) {
      const f = FLOORS[floor];
      const keep = [f.start, ...f.exits, ...(f.down ? [f.down] : [])];
      for (const seed of [1, 2, 3]) {
        const p = planFloor(seed, floor, "morning");
        for (const s of p.spawns) {
          expect(footOverlaps(p, s.x, s.y, MONSTERS[s.monster].radius)).toBe(false);
          expect(Math.hypot(s.x - f.start.x, s.y - f.start.y)).toBeGreaterThanOrEqual(150);
        }
        for (const n of p.nodes) expect(footOverlaps(p, n.x, n.y, 6)).toBe(false);
        for (const k of keep) expect(footOverlaps(p, k.x, k.y, 24)).toBe(false);
      }
    }
  });
  it("keeps a chicken flock together", () => {
    const p = planFloor(9, 1, "morning");
    const flocks = new Map<string, { x: number; y: number }[]>();
    for (const s of p.spawns.filter((s) => s.flock)) flocks.set(s.flock!, [...(flocks.get(s.flock!) ?? []), s]);
    expect(flocks.size).toBe(6);
    for (const members of flocks.values()) {
      expect(members.length).toBe(3);
      for (const a of members) for (const b of members) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(80);
    }
  });
});
