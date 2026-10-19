import type { StoryId } from "../../../shared/content/story";
import type { SaveData } from "../../../shared/save";
import type { StringKey } from "../../i18n";
import type { Phase } from "../hud/hud";

// The prologue (design 6, candidate A approved 2026-10-19; the grandson only for now): the four approved
// cuts and three more bringing in Bandal, the lid as the weapon and the yokai guests. Cuts 1-6 play on the
// first morning before the first hunt, cut 7 at the first dusk. Every line is a string key (ko/en).
export type Speaker = "hero" | "lid" | "bandal" | "letter";
export interface StoryLine {
  who: Speaker;
  face: string;
  key: StringKey;
}
// `pic`: the cut's picture (art/test/story/<pic>.png once drawn; the scene stands in with approved art)
export interface Cut {
  pic: "phone" | "parcel" | "shop" | "lid" | "bandal" | "lidback" | "dusk";
  lines: StoryLine[];
}

export const SCENES: Record<StoryId, Cut[]> = {
  prologue: [
    { pic: "phone", lines: [{ who: "hero", face: "tired", key: "story.p1" }] },
    { pic: "parcel", lines: [{ who: "hero", face: "tired", key: "story.p2a" }, { who: "letter", face: "normal", key: "story.p2b" }] },
    { pic: "shop", lines: [] },
    { pic: "lid", lines: [{ who: "lid", face: "angry", key: "story.p4" }] },
    { pic: "bandal", lines: [{ who: "bandal", face: "idle", key: "story.p5" }] },
    {
      pic: "lidback",
      lines: [
        { who: "lid", face: "normal", key: "story.p6a" },
        { who: "hero", face: "fine", key: "story.p6b" },
        { who: "lid", face: "smug", key: "story.p6c" },
      ],
    },
  ],
  prologue_dusk: [{ pic: "dusk", lines: [{ who: "lid", face: "smug", key: "story.p7" }] }],
};

// The scene due now, if any: only on day 1 (a save already past it never sees the prologue), the prologue
// on the first morning before setting out, its dusk cut on the first evening once the prologue was seen.
export function storyDue(save: Pick<SaveData, "day" | "hunt" | "story">, phase: Phase): StoryId | null {
  if (save.day !== 1 || save.hunt) return null;
  if (phase === "hunt" && !save.story.includes("prologue")) return "prologue";
  if (phase === "kitchen" && save.story.includes("prologue") && !save.story.includes("prologue_dusk")) return "prologue_dusk";
  return null;
}
