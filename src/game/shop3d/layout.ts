import { LAYOUT } from "../service/shift";

// The 3D night shop's room (shop 3D design 4-5). One world unit is one pixel of the 480-wide shop picture
// and, through the orthographic camera, exactly two screen pixels near or far, so pixel art stays crisp.
// The night's rules (shift.ts) keep their 960-wide game pixels; toWorldX maps them in.

export const toWorldX = (gameX: number): number => gameX / 2 - 240;

// half units: whole screen pixels at 2 px a unit
export const snap = (v: number): number => Math.round(v * 2) / 2;

// how far from the camera each layer stands (bigger z = nearer)
export const Z = { backWall: -90, bandal: -33, pass: -26, waiter: -16, counter: 0, stool: 22, seated: 25, walk: 40 } as const;
export const FLOOR_Y = -4;
// the low counter, waist high on the grandchild; it runs over the stools' span with a little to spare
export const COUNTER = { h: 26, d: 14, x0: toWorldX(LAYOUT.counter[0]) - 10, x1: toWorldX(LAYOUT.counter[1]) + 10 };
// fixed, tilted down a little, following the grandchild along the counter (no free turning)
export const CAMERA = { pitch: 0.22, follow: 25, rate: 4 };

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
