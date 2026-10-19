// The story's scenes the save remembers seeing (design 6, prologue A approved 2026-10-19): the prologue
// before the first hunt and its last cut at the first dusk. The page decides when each plays; the server
// only keeps which were seen (nothing is paid or unlocked by it).
export const STORY_IDS = ["prologue", "prologue_dusk"] as const;
export type StoryId = (typeof STORY_IDS)[number];
export const isStoryId = (v: unknown): v is StoryId => typeof v === "string" && (STORY_IDS as readonly string[]).includes(v);
