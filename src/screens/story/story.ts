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
// `pic`: the cut's picture (art/test/story/<pic>.png once drawn; the scene stands in with approved art).
// `caption`: one plain line at the top tying the cut to the one before (2026-10-20: the cuts read as
// unconnected). `at`: where each speaker stands in the picture (percent of its width, height), marked while
// they talk, so the line in the bar is seen to come from them.
export interface Cut {
  pic: "phone" | "parcel" | "shop" | "lid0" | "lid1" | "lid" | "bandal" | "lidback" | "dusk";
  caption?: StringKey;
  at?: Partial<Record<Speaker, [number, number]>>;
  lines: StoryLine[];
}

// the story's own pictures: left out of the loading screen (a returning player never sees them), each scene
// fetching its own before it starts (Cutscene)
export const isStoryArt = (path: string): boolean => path.startsWith("test/story/");
export const sceneArt = (cuts: Cut[]): string[] => [...new Set(cuts.map((c) => `test/story/${c.pic}.png`))];

export const SCENES: Record<StoryId, Cut[]> = {
  prologue: [
    { pic: "phone", caption: "story.cap.phone", lines: [{ who: "hero", face: "tired", key: "story.p1" }] },
    { pic: "parcel", caption: "story.cap.parcel", at: { hero: [50, 8] }, lines: [{ who: "hero", face: "tired", key: "story.p2a" }, { who: "letter", face: "normal", key: "story.p2b" }] },
    { pic: "shop", caption: "story.cap.shop", lines: [] },
    // the lid wakes in three beats (2026-10-20): still under the dust, one eye snaps open, up and shouting
    { pic: "lid0", lines: [] },
    { pic: "lid1", caption: "story.cap.lid1", lines: [] },
    { pic: "lid", at: { lid: [62, 26], hero: [27, 40] }, lines: [{ who: "lid", face: "angry", key: "story.p4" }] },
    { pic: "bandal", caption: "story.cap.bandal", at: { bandal: [53, 6], hero: [17, 46] }, lines: [{ who: "bandal", face: "idle", key: "story.p5" }] },
    {
      pic: "lidback",
      caption: "story.cap.lidback",
      at: { lid: [60, 38], hero: [47, 24] },
      lines: [
        { who: "lid", face: "normal", key: "story.p6a" },
        { who: "hero", face: "fine", key: "story.p6b" },
        { who: "lid", face: "smug", key: "story.p6c" },
      ],
    },
  ],
  prologue_dusk: [{ pic: "dusk", caption: "story.cap.dusk", at: { lid: [12, 30] }, lines: [{ who: "lid", face: "smug", key: "story.p7" }] }],
};

// The scene due now, if any: only on day 1 (a save already past it never sees the prologue), the prologue
// on the first morning before setting out, its dusk cut on the first evening once the prologue was seen.
// `watched`: scenes played to the end on this page, over at once though the server may not have saved
// them yet (a busy or failed save must not leave the last cut stuck on screen).
export function storyDue(save: Pick<SaveData, "day" | "hunt" | "story">, phase: Phase, watched: StoryId[] = []): StoryId | null {
  if (save.day !== 1 || save.hunt) return null;
  const seen = (id: StoryId) => save.story.includes(id) || watched.includes(id);
  if (phase === "hunt" && !seen("prologue")) return "prologue";
  if (phase === "kitchen" && seen("prologue") && !seen("prologue_dusk")) return "prologue_dusk";
  return null;
}

// A scene watched here that the save does not have yet: the one to send.
export function storyUnsaved(save: Pick<SaveData, "story">, watched: StoryId[]): StoryId | null {
  return watched.find((id) => !save.story.includes(id)) ?? null;
}
