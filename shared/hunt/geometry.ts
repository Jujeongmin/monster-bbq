import type { Field, Vec } from "./types";

export function clampToField(p: Vec, f: Field): Vec {
  return {
    x: Math.min(f.maxX, Math.max(f.minX, p.x)),
    y: Math.min(f.maxY, Math.max(f.minY, p.y)),
  };
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Length-1 version of v; `fallback` for a zero vector.
export function unit(v: Vec, fallback: Vec = { x: 1, y: 0 }): Vec {
  const len = Math.hypot(v.x, v.y);
  return len === 0 ? fallback : { x: v.x / len, y: v.y / len };
}

export function stepToward(from: Vec, to: Vec, maxDist: number): { pos: Vec; arrived: boolean } {
  const d = distance(from, to);
  if (d <= maxDist) return { pos: { x: to.x, y: to.y }, arrived: true };
  const k = maxDist / d;
  return { pos: { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }, arrived: false };
}

// Direct control (keys or stick): `input` components are -1..1. Diagonals are not faster than straight
// moves; y moves at `depthSpeedRatio` of the x speed (1 for a flat top-down map).
export function moveByInput(pos: Vec, input: Vec, speed: number, dtMs: number, field: Field, depthSpeedRatio: number): Vec {
  const len = Math.hypot(input.x, input.y);
  const k = len > 1 ? 1 / len : 1;
  const dist = (speed * dtMs) / 1000;
  return clampToField({ x: pos.x + input.x * k * dist, y: pos.y + input.y * k * dist * depthSpeedRatio }, field);
}

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

// Solid obstacles (tree clumps, bushes): a body of `radius` overlapping one is pushed out through
// the nearest side.
export function pushOutOfRects(p: Vec, rects: Rect[], radius: number): Vec {
  let { x, y } = p;
  for (const r of rects) {
    const x0 = r.x0 - radius;
    const x1 = r.x1 + radius;
    const y0 = r.y0 - radius;
    const y1 = r.y1 + radius;
    if (x <= x0 || x >= x1 || y <= y0 || y >= y1) continue;
    const exits = [
      { d: x - x0, x: x0, y },
      { d: x1 - x, x: x1, y },
      { d: y - y0, x, y: y0 },
      { d: y1 - y, x, y: y1 },
    ];
    const best = exits.reduce((a, b) => (b.d < a.d ? b : a));
    x = best.x;
    y = best.y;
  }
  return { x, y };
}

// Obstacles drawn in a ground tile that is repeated over the world, mirrored on every other column
// and row (so the tiling never shows a seam): the tile-local rectangles in world coordinates.
export function mirroredTileRects(local: Rect[], tile: number, worldW: number, worldH: number): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i * tile < worldW; i++) {
    for (let j = 0; j * tile < worldH; j++) {
      const ox = i * tile;
      const oy = j * tile;
      for (const r of local) {
        const [x0, x1] = i % 2 ? [tile - r.x1, tile - r.x0] : [r.x0, r.x1];
        const [y0, y1] = j % 2 ? [tile - r.y1, tile - r.y0] : [r.y0, r.y1];
        out.push({ x0: ox + x0, x1: ox + x1, y0: oy + y0, y1: oy + y1 });
      }
    }
  }
  return out;
}
