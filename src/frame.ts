// The game's one 16:9 frame, sized in pixels from the window (not with vw/vh: iPhone Safari in Verse8's
// iframe got those wrong). The UI's pixel scale (--s) is the frame width in whole multiples of the game's
// 640 px, so pixel art and pixel fonts stay crisp.
export function frameSize(w: number, h: number): { width: number; height: number; s: number } {
  const width = Math.max(1, Math.floor(Math.min(w, (h * 16) / 9)));
  const height = Math.max(1, Math.round((width * 9) / 16));
  return { width, height, s: Math.max(1, Math.floor(width / 640)) };
}

// A text box has the focus: on a phone its keyboard is up and the window has shrunk under it. The frame
// keeps its size meanwhile, or the whole game would squash into the strip above the keys (user, 2026-10-22).
export function isTyping(el: { tagName: string; isContentEditable?: boolean } | null): boolean {
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || !!el.isContentEditable);
}
