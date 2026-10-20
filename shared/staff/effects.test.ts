import { describe, expect, it } from "vitest";
import { staffEffects } from "./effects";

describe("what tonight's friends change (staffEffects)", () => {
  it("changes nothing with no one on shift", () => {
    expect(staffEffects({})).toEqual({ cookMul: 1, patienceMul: 1, extraGuests: 0, tipMul: 1, coalMul: 1, calm: false });
  });
  it("cooks faster with a kitchen helper, never below half the time", () => {
    expect(staffEffects({ kitchen: { id: "park", stars: 0 } }).cookMul).toBeCloseTo(0.88);
    expect(staffEffects({ kitchen: { id: "jang", stars: 0 } }).cookMul).toBe(0.5);
    // Mumyeong helps the kitchen from the serving position too
    expect(staffEffects({ serve: { id: "mumyeong", stars: 0 } }).cookMul).toBeCloseTo(0.6);
  });
  it("adds everyone's charm to patience, more with Granny Ggultteok and Old Baekdu", () => {
    const e = staffEffects({ drinks: { id: "ggultteok", stars: 0 }, clean: { id: "baekdu", stars: 0 } });
    expect(e.patienceMul).toBeCloseTo(1.565);
    expect(e.calm).toBe(true);
  });
  it("brings Baekhwa's extra guests and tips, and Soedol's slower charcoal", () => {
    expect(staffEffects({ serve: { id: "baekhwa", stars: 0 } })).toMatchObject({ extraGuests: 2, tipMul: 1.3 });
    expect(staffEffects({ coal: { id: "soedol", stars: 0 } }).coalMul).toBe(0.8);
  });
});
