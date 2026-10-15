// The research cut-in (restaurant v2 design 6, user-chosen): bars close in, Bandal grills, flips, holds
// out the plate while the dish name stamps down, then smiles to himself and says his line.
// About four seconds, then it waits for a tap (ResearchCutIn); a tap while it plays jumps to the end.
export type BandalFrame = "grill" | "turn" | "serve" | "smile";
export const CUT_IN_MS = 4000;

export function cutInStep(ms: number): { frame: BandalFrame; stamp: boolean; line: boolean; done: boolean } {
  const frame: BandalFrame = ms < 900 ? "grill" : ms < 1800 ? "turn" : ms < 2800 ? "serve" : "smile";
  return { frame, stamp: ms >= 1800, line: ms >= 2800, done: ms >= CUT_IN_MS };
}
