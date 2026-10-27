import type { Vec } from "../../shared/hunt/types";

// On-screen stick: thumb offset from the base -> -1..1 vector. Inside `deadZone` (fraction of the
// radius) it is still; past it the push is distance / radius, capped at the rim.
export function joystickVector(base: Vec, thumb: Vec, radius: number, deadZone: number): Vec {
  const dx = thumb.x - base.x;
  const dy = thumb.y - base.y;
  const len = Math.hypot(dx, dy);
  const dead = radius * deadZone;
  if (len <= dead) return { x: 0, y: 0 };
  const push = Math.min(1, len / radius);
  return { x: (dx / len) * push, y: (dy / len) * push };
}

export interface PadSpot {
  x: number;
  y: number;
  radius: number;
}
export interface PadLayout {
  stick: PadSpot;
  slash: PadSpot;
  harpoon: PadSpot;
  side: PadSpot;
  use: PadSpot;
}

// Where the hunt's touch pad sits on a w x h screen at size `scale` (padPrefs): the stick's home at the
// bottom left; slash in the bottom-right corner, the harpoon left of it (a button of its own, so a monster
// on the hunter's left can be harpooned too: user 2026-10-27), the side weapon above the harpoon, use (it
// shows only near something) left of the harpoon. Each radius is the piece's own half width (the art is 48,
// 40, 40 and 34 art px across, drawn two game px per art px); the stick's is how far its knob travels. Gaps
// to the edges stay put while the pieces grow.
export function padLayout(scale: number, w: number, h: number): PadLayout {
  const base = 48 * scale;
  const r = 40 * scale;
  const slash = { radius: r, x: w - 22 - r, y: h - 22 - r };
  const harpoon = { radius: r, x: slash.x - r - 6 - r, y: h - 8 - r };
  const side = { radius: r, x: harpoon.x + 2, y: harpoon.y - r - 4 - r };
  const useR = 34 * scale;
  const use = { radius: useR, x: harpoon.x - r - 6 - useR, y: h - 8 - useR };
  return { stick: { x: 29 + base, y: h - 31 - base, radius: 36 * scale }, slash, harpoon, side, use };
}

// Where a floating stick appears for a thumb pressed at `at`: right there, pulled in just enough that the
// whole dish (half width `half`) stays on the screen and below `top` (the HUD in the corner).
export function floatStick(at: Vec, half: number, w: number, h: number, top: number): Vec {
  return { x: Math.min(Math.max(at.x, half), w - half), y: Math.min(Math.max(at.y, top + half), h - half) };
}
