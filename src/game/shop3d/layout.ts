import { LAYOUT } from "../service/shift";

// The 3D night shop's room (shop 3D design 4-5). One world unit is one pixel of the 480-wide shop picture
// and, through the orthographic camera, exactly two screen pixels near or far, so pixel art stays crisp.
// The night's rules (shift.ts) keep their 960-wide game pixels; toWorldX maps them in.

export const toWorldX = (gameX: number): number => gameX / 2 - 240;

// half units: whole screen pixels at 2 px a unit
export const snap = (v: number): number => Math.round(v * 2) / 2;

// how far from the camera each layer stands (bigger z = nearer); the drink cart and the charcoal box stand
// just in front of the grandchild's lane (on one depth their pictures fought over the same pixels)
export const Z = { backWall: -90, bandal: -38, pass: -30, station: -12, waiter: -16, counter: 0, stool: 22, seated: 25, walk: 40 } as const;
export const FLOOR_Y = -4;
// the low counter, waist high on the grandchild (19: his carried plate clears it, and its front picture is
// 19 px tall); it runs over the stools' span and stops short of the
// drink cart behind its right end (the cart would be cut off by it)
export const COUNTER = { h: 19, d: 14, x0: toWorldX(LAYOUT.counter[0]) - 10, x1: toWorldX(LAYOUT.counter[1]) - 10 };
// the kitchen's pass, a lower box the grandchild works in front of; Bandal stands behind it
export const PASS = { x: toWorldX(LAYOUT.pass) + 10, w: 80, h: 22, d: 12 };
export const HUNTER_FEET = 7; // the grandchild's 105 px frames (hunt and shop) have the feet on row 98
// fixed, tilted down a little. It does not follow the grandchild (2026-10-20): the room is as wide as the
// view, so following him showed black past the room's ends
export const CAMERA = { pitch: 0.22, follow: 0, rate: 4 };

// Upright pictures lean back with the camera from their bottom edge: `rise` above it, a picture placed at
// z stands this far back. A box in front of a picture must stay behind this line up to the box's top, or
// the box swallows that part of the picture (the grandchild's legs vanished into the pass).
export const leanZ = (z: number, rise: number): number => z - rise * Math.tan(CAMERA.pitch);

// The camera's x: eases toward a third of the way to the grandchild, never past `follow`.
export function cameraX(prev: number, waiterWorldX: number, dt: number): number {
  const goal = Math.max(-CAMERA.follow, Math.min(CAMERA.follow, waiterWorldX * 0.3));
  return prev + (goal - prev) * Math.min(1, dt * CAMERA.rate);
}

// The 960x540 picture on screen: the biggest whole scale that fits, or a fraction only when even 1x does
// not fit.
export function displayScale(viewW: number, viewH: number): number {
  const fit = Math.min(viewW / 960, viewH / 540);
  return fit >= 1 ? Math.floor(fit) : fit;
}
