import { describe, expect, it } from "vitest";
import { newSave } from "../../../shared/save";
import { ko } from "../../i18n/ko";
import { SCENES, storyDue } from "./story";

describe("the prologue", () => {
  it("plays on the first morning before the first hunt, its dusk cut on the first evening", () => {
    const s = newSave();
    expect(storyDue(s, "hunt")).toBe("prologue");
    expect(storyDue({ ...s, story: ["prologue"] }, "hunt")).toBeNull();
    expect(storyDue({ ...s, story: ["prologue"] }, "lunch")).toBeNull();
    expect(storyDue({ ...s, story: ["prologue"] }, "kitchen")).toBe("prologue_dusk");
    expect(storyDue({ ...s, story: ["prologue", "prologue_dusk"] }, "kitchen")).toBeNull();
  });
  it("never plays for a save past day 1, nor in the middle of a hunt", () => {
    expect(storyDue({ ...newSave(), day: 4 }, "hunt")).toBeNull();
    expect(storyDue({ ...newSave(), hunt: { id: "h", seed: 1, startedAt: 0, zone: "forest", period: "morning", side: "sling" } }, "hunt")).toBeNull();
  });
  it("has the approved seven cuts, every line written", () => {
    const cuts = [...SCENES.prologue, ...SCENES.prologue_dusk];
    expect(cuts.map((c) => c.pic)).toEqual(["phone", "parcel", "shop", "lid", "bandal", "lidback", "dusk"]);
    for (const c of cuts) for (const l of c.lines) expect(ko[l.key]).toBeTruthy();
  });
});
