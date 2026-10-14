import { describe, expect, it } from "vitest";
import { scatter, seededRandom } from "./scatter";

const area = { minX: 0, maxX: 1000, minY: 0, maxY: 800 };

describe("seededRandom", () => {
  it("gives the same sequence for the same seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("stays within 0..1", () => {
    const r = seededRandom(7);
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("scatter", () => {
  it("places the same points for the same seed", () => {
    expect(scatter(1, area, 20, 60, [])).toEqual(scatter(1, area, 20, 60, []));
  });
  it("keeps every pair at least minDist apart", () => {
    const pts = scatter(3, area, 40, 70, []);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThanOrEqual(70);
  });
  it("leaves the keep-clear circles empty", () => {
    const clear = [{ x: 500, y: 400, r: 150 }];
    for (const p of scatter(5, area, 60, 50, clear)) expect(Math.hypot(p.x - 500, p.y - 400)).toBeGreaterThanOrEqual(150);
  });
  it("stays inside the area", () => {
    for (const p of scatter(9, area, 50, 40, [])) {
      expect(p.x).toBeGreaterThanOrEqual(area.minX);
      expect(p.x).toBeLessThanOrEqual(area.maxX);
      expect(p.y).toBeGreaterThanOrEqual(area.minY);
      expect(p.y).toBeLessThanOrEqual(area.maxY);
    }
  });
});
