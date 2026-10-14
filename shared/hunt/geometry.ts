import type { Field, Vec } from "./types";

export function clampToField(p: Vec, f: Field): Vec {
  return {
    x: Math.min(f.maxX, Math.max(f.minX, p.x)),
    y: Math.min(f.maxY, Math.max(f.minY, p.y)),
  };
}

// Belt-scroller depth: two things can only hit each other when they stand on (nearly) the same line.
export function sameLane(a: Vec, b: Vec, tolerance: number): boolean {
  return Math.abs(a.y - b.y) <= tolerance;
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function stepToward(from: Vec, to: Vec, maxDist: number): { pos: Vec; arrived: boolean } {
  const d = distance(from, to);
  if (d <= maxDist) return { pos: { x: to.x, y: to.y }, arrived: true };
  const k = maxDist / d;
  return { pos: { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }, arrived: false };
}

// Direct control (keys or stick): `input` components are -1..1. Diagonals are not faster than straight
// moves, and depth (y) moves at `depthSpeedRatio` of the sideways speed, like a belt scroller.
export function moveByInput(pos: Vec, input: Vec, speed: number, dtMs: number, field: Field, depthSpeedRatio: number): Vec {
  const len = Math.hypot(input.x, input.y);
  const k = len > 1 ? 1 / len : 1;
  const dist = (speed * dtMs) / 1000;
  return clampToField({ x: pos.x + input.x * k * dist, y: pos.y + input.y * k * dist * depthSpeedRatio }, field);
}
