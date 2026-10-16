// The bag in the hunt HUD (user, 2026-10-16: Dave's weight readout instead of a line of text): how full the
// gauge is and how it warns, heavy from four fifths and full at the top.
export function bagLevel(count: number, slots: number): { fill: number; state: "ok" | "heavy" | "full" } {
  const fill = slots > 0 ? Math.min(1, count / slots) : 1;
  return { fill, state: fill >= 1 ? "full" : fill >= 0.8 ? "heavy" : "ok" };
}
