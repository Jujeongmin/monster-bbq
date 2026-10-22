// The game's one frame, sized in pixels from the window (not with vw/vh: iPhone Safari in Verse8's iframe got
// those wrong). It is 16:9 at the least and widens with a wider screen up to a long phone's 19.5:9, so a phone
// held sideways is filled edge to edge with more of the scene, not black bars (user, 2026-10-22, like Dave
// the Diver mobile); a squarer window (a tablet) keeps 16:9 with bars above and below. The UI's pixel scale
// (--s) is the frame height in whole multiples of the game's 360 px, so pixel art and fonts stay crisp.
export const MAX_ASPECT = 19.5 / 9;
const MIN_ASPECT = 16 / 9;

export function frameSize(w: number, h: number): { width: number; height: number; s: number } {
  const wide = h > 0 && w / h >= MIN_ASPECT;
  const height = Math.max(1, Math.floor(wide ? h : (w * 9) / 16));
  const width = Math.max(1, Math.floor(wide ? Math.min(w, h * MAX_ASPECT) : w));
  return { width, height, s: Math.max(1, Math.floor(height / 360)) };
}

// A text box has the focus: on a phone its keyboard is up and the window has shrunk under it. The frame
// keeps its size meanwhile, or the whole game would squash into the strip above the keys (user, 2026-10-22).
export function isTyping(el: { tagName: string; isContentEditable?: boolean } | null): boolean {
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || !!el.isContentEditable);
}
