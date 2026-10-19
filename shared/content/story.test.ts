import { describe, expect, it } from "vitest";
import { applyAction } from "../actions";
import { newSave } from "../save";

const ctx = { now: 0, random: () => 0.5 };

describe("story scenes in the save", () => {
  it("remembers a scene seen once, whatever the stage, and changes nothing else", () => {
    const s0 = newSave();
    const r = applyAction(s0, { type: "seeStory", id: "prologue" }, ctx);
    expect(r.error).toBeUndefined();
    expect(r.save).toEqual({ ...s0, story: ["prologue"] });
    expect(applyAction(r.save, { type: "seeStory", id: "prologue" }, ctx).save.story).toEqual(["prologue"]);
  });
  it("refuses a scene that does not exist", () => {
    expect(applyAction(newSave(), { type: "seeStory", id: "free_gold" }, ctx).error).toBe("bad_action");
  });
});
