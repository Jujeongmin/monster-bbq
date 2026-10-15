import { describe, expect, it } from "vitest";
import { BALANCE } from "../balance";
import type { DishId } from "../content/dishes";
import { planService } from "./plan";

const SV = BALANCE.service;
const menu: DishId[] = ["grilled_belly", "garlic_neck"];

describe("planService", () => {
  it("gives the same customers for the same seed and others for another", () => {
    expect(planService(7, { day: 3, reputation: 0, menu })).toEqual(planService(7, { day: 3, reputation: 0, menu }));
    expect(planService(8, { day: 3, reputation: 0, menu })).not.toEqual(planService(7, { day: 3, reputation: 0, menu }));
  });
  it("brings more customers with reputation, within the limits", () => {
    expect(planService(1, { day: 1, reputation: 0, menu })).toHaveLength(SV.baseCustomers);
    expect(planService(1, { day: 1, reputation: SV.perReputation * 2, menu })).toHaveLength(SV.baseCustomers + 2);
    expect(planService(1, { day: 1, reputation: 10_000, menu })).toHaveLength(SV.maxCustomers);
  });
  it("orders only from tonight's menu, arriving in order at the planned gaps, each with its own id", () => {
    const cs = planService(42, { day: 2, reputation: 30, menu });
    expect(new Set(cs.map((c) => c.id)).size).toBe(cs.length);
    expect(cs[0].arriveMs).toBe(SV.firstArriveMs);
    for (let i = 0; i < cs.length; i++) {
      expect(menu).toContain(cs[i].dish);
      expect(cs[i].patienceMs).toBeGreaterThanOrEqual(SV.patienceMs[0]);
      expect(cs[i].patienceMs).toBeLessThanOrEqual(SV.patienceMs[1]);
      expect(cs[i].seat).toBe(i % SV.seats);
      if (i > 0) {
        const gap = cs[i].arriveMs - cs[i - 1].arriveMs;
        expect(gap).toBeGreaterThanOrEqual(SV.gapMs[0]);
        expect(gap).toBeLessThanOrEqual(SV.gapMs[1]);
      }
    }
  });
  it("has nobody to serve with an empty menu", () => {
    expect(planService(1, { day: 1, reputation: 0, menu: [] })).toEqual([]);
  });
});
