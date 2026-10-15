import { describe, expect, it } from "vitest";
import { plateResult } from "./notes";

describe("plateResult", () => {
  it("averages the pieces' accuracy", () => {
    expect(plateResult([{ accuracy: 1, notes: [] }, { accuracy: 0.5, notes: [] }]).accuracy).toBeCloseTo(0.75);
  });
  it("leads with the worst mistake when there is one", () => {
    const r = plateResult([
      { accuracy: 1, notes: ["perfect", "onceFlip"] },
      { accuracy: 0.4, notes: ["manyFlips", "burnt"] },
    ]);
    expect(r.note).toBe("burnt");
  });
  it("otherwise leads with the best praise", () => {
    expect(plateResult([{ accuracy: 1, notes: ["onceFlip"] }, { accuracy: 1, notes: ["perfect", "fatFried"] }]).note).toBe("perfect");
    expect(plateResult([{ accuracy: 0.9, notes: ["onceFlip", "fatFried"] }]).note).toBe("fatFried");
  });
  it("has nothing to say about an empty plate or a plain one", () => {
    expect(plateResult([])).toEqual({ accuracy: 0, note: null });
    expect(plateResult([{ accuracy: 0.8, notes: [] }]).note).toBeNull();
  });
});
