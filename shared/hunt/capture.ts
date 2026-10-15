import { BALANCE } from "../balance";

// The capture gauge (hunt v3 design 4.2): a harpooned monster struggles; each tap fills the gauge, it
// drains faster the more health the monster has left (so the way to do it is a light slash, then the
// harpoon). Full = caught (★★), never before minMs, the time the server allows a capture; empty = the
// rope breaks.
const C = BALANCE.hunt.capture;

export interface Capture {
  fill: number;
  ms: number;
}

export const startCapture = (): Capture => ({ fill: C.start, ms: 0 });

export function tapCapture(c: Capture, harpoonLevel: number): Capture {
  const tap = C.tap[Math.max(0, Math.min(C.tap.length - 1, harpoonLevel - 1))];
  return { ...c, fill: Math.min(1, c.fill + tap) };
}

export function stepCapture(c: Capture, dtMs: number, hpFrac: number): { c: Capture; result: "going" | "caught" | "broke" } {
  // full: it holds there (no drain) until the capture has taken minMs
  if (c.fill >= 1) {
    const ms = c.ms + dtMs;
    return { c: { fill: 1, ms }, result: ms >= C.minMs ? "caught" : "going" };
  }
  const fill = Math.max(0, c.fill - (C.decayPerSec * (0.5 + hpFrac) * dtMs) / 1000);
  const next = { fill, ms: c.ms + dtMs };
  return { c: next, result: fill <= 0 ? "broke" : "going" };
}
