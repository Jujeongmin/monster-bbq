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
  side: PadSpot;
  use: PadSpot;
}

// Where the hunt's touch pad sits on a w x h screen at size `scale` (padPrefs): the stick's home at the
// bottom left; slash in the bottom-right corner, the side weapon left of it, use above that. Each radius is
// the piece's own half width (the art is 48, 40, 40 and 34 art px across, drawn two game px per art px);
// the stick's is how far its knob travels. Gaps to the edges stay put while the pieces grow.
export function padLayout(scale: number, w: number, h: number): PadLayout {
  const base = 48 * scale;
  const slash = { radius: 40 * scale, x: 0, y: 0 };
  slash.x = w - 22 - slash.radius;
  slash.y = h - 22 - slash.radius;
  const sideR = 40 * scale;
  const side = { radius: sideR, x: slash.x - slash.radius - 6 - sideR, y: h - 8 - sideR };
  const useR = 34 * scale;
  const use = { radius: useR, x: side.x + 2, y: side.y - sideR - 4 - useR };
  return { stick: { x: 29 + base, y: h - 31 - base, radius: 36 * scale }, slash, side, use };
}

// Where a floating stick appears for a thumb pressed at `at`: right there, pulled in just enough that the
// whole dish (half width `half`) stays on the screen and below `top` (the HUD in the corner).
export function floatStick(at: Vec, half: number, w: number, h: number, top: number): Vec {
  return { x: Math.min(Math.max(at.x, half), w - half), y: Math.min(Math.max(at.y, top + half), h - half) };
}
