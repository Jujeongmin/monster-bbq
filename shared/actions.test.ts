import { describe, expect, it } from "vitest";
import { applyAction, koPenalty } from "./actions";
import { newSave } from "./save";

describe("applyAction", () => {
  it("adds a hunt's meat to the bag", () => {
    const r = applyAction(newSave(), { type: "huntResult", meat: { premium: 2, normal: 1 } });
    expect(r.error).toBeUndefined();
    expect(r.save.meat).toEqual({ premium: 2, normal: 1 });
  });
  it("rejects forged or broken hunt results and keeps the save", () => {
    for (const meat of [{ premium: -1, normal: 0 }, { premium: 1.5, normal: 0 }, { premium: "3", normal: 0 }, { premium: 15, normal: 6 }, null]) {
      const r = applyAction(newSave(), { type: "huntResult", meat });
      expect(r.error).toBe("bad_hunt");
      expect(r.save).toEqual(newSave());
    }
  });
  it("sells all meat at the set prices", () => {
    const s = { ...newSave(), gold: 10, meat: { premium: 2, normal: 3 } };
    expect(applyAction(s, { type: "sellAll" }).save).toEqual({ ...s, gold: 10 + 2 * 30 + 3 * 15, meat: { premium: 0, normal: 0 } });
  });
  it("moves to the next day", () => {
    expect(applyAction(newSave(), { type: "endDay" }).save.day).toBe(2);
  });
  it("rejects unknown actions", () => {
    expect(applyAction(newSave(), { type: "giveMeGold", gold: 1e9 }).error).toBe("bad_action");
    expect(applyAction(newSave(), "sellAll").error).toBe("bad_action");
  });
});

describe("koPenalty", () => {
  it("keeps half of each grade, rounded down", () => {
    expect(koPenalty({ premium: 3, normal: 4 })).toEqual({ premium: 1, normal: 2 });
  });
});
