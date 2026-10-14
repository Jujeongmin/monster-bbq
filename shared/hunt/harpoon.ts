import { clampToField, distance, stepToward, unit } from "./geometry";
import type { Field, Vec } from "./types";

// Dave-style harpoon: aimed anywhere on screen, flies in a straight line, and reels in what it hits.
export interface Harpoon {
  origin: Vec;
  // unit vector
  dir: Vec;
  traveled: number;
  tip: Vec;
}

// Aimed at the hand itself (a tap on the hunter), it goes straight ahead toward `facing`.
export function fireHarpoon(origin: Vec, aim: Vec, facing: 1 | -1 = 1): Harpoon {
  const dx = aim.x - origin.x;
  const dy = aim.y - origin.y;
  const len = Math.hypot(dx, dy);
  const dir = len === 0 ? { x: facing, y: 0 } : { x: dx / len, y: dy / len };
  return { origin, dir, traveled: 0, tip: { ...origin } };
}

export function stepHarpoon(h: Harpoon, speed: number, dtMs: number): Harpoon {
  const traveled = h.traveled + (speed * dtMs) / 1000;
  return { ...h, traveled, tip: { x: h.origin.x + h.dir.x * traveled, y: h.origin.y + h.dir.y * traveled } };
}

export function harpoonDone(h: Harpoon, range: number): boolean {
  return h.traveled >= range;
}

// The target whose body (feet position lifted by bodyOffsetY) the tip touches; the closest if several.
export function harpoonHit<T extends { pos: Vec }>(tip: Vec, targets: T[], bodyOffsetY: number, radius: number): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const t of targets) {
    const d = distance(tip, { x: t.pos.x, y: t.pos.y - bodyOffsetY });
    if (d <= radius && d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

// Pulls a harpooned target to `stopDist` from the hunter, on the side it is coming from.
export function reelStep(target: Vec, hunter: Vec, pullSpeed: number, dtMs: number, stopDist: number, field: Field): { pos: Vec; done: boolean } {
  const dir = unit({ x: target.x - hunter.x, y: target.y - hunter.y });
  const goal = { x: hunter.x + dir.x * stopDist, y: hunter.y + dir.y * stopDist };
  const step = stepToward(target, goal, (pullSpeed * dtMs) / 1000);
  return { pos: clampToField(step.pos, field), done: step.arrived };
}
