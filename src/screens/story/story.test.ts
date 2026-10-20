import { describe, expect, it } from "vitest";
import { newSave } from "../../../shared/save";
import { ko } from "../../i18n/ko";
import { SCENES, storyDue, storyUnsaved } from "./story";

describe("the prologue", () => {
  it("ends on the last tap even before the server has saved it, and is sent until it is", () => {
    const s = newSave();
    // watched here, not saved yet (the server busy or the reply lost): over, and still to send
    expect(storyDue(s, "hunt", ["prologue"])).toBeNull();
    expect(storyUnsaved(s, ["prologue"])).toBe("prologue");
    expect(storyUnsaved({ ...s, story: ["prologue"] }, ["prologue"])).toBeNull();
    // the dusk cut still follows a prologue watched here
    expect(storyDue(s, "kitchen", ["prologue"])).toBe("prologue_dusk");
  });

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
  it("has the approved cuts (the lid now waking in three), every line and caption written", () => {
    const cuts = [...SCENES.prologue, ...SCENES.prologue_dusk];
    expect(cuts.map((c) => c.pic)).toEqual(["phone", "parcel", "shop", "lid0", "lid1", "lid", "bandal", "lidback", "dusk"]);
    for (const c of cuts) for (const k of [...c.lines.map((l) => l.key), ...(c.caption ? [c.caption] : [])]) expect(ko[k]).toBeTruthy();
  });
});

describe("the prologue reads in order (2026-10-20)", () => {
  it("wakes the lid in three cuts: still, one eye open, then up and shouting", () => {
    expect(SCENES.prologue.map((c) => c.pic)).toEqual(["phone", "parcel", "shop", "lid0", "lid1", "lid", "bandal", "lidback"]);
  });
  it("ties the cuts together with a caption, and marks where each speaker stands in the picture", () => {
    for (const pic of ["phone", "parcel", "shop", "lid1", "bandal", "lidback"]) expect(SCENES.prologue.find((c) => c.pic === pic)!.caption).toBe(`story.cap.${pic}`);
    expect(SCENES.prologue_dusk[0].caption).toBe("story.cap.dusk");
    for (const cut of [...SCENES.prologue, ...SCENES.prologue_dusk])
      for (const l of cut.lines) if (l.who === "lid" || l.who === "bandal") expect(cut.at?.[l.who], `${cut.pic} ${l.who}`).toBeDefined();
  });
});
