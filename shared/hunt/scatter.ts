import type { Field, Vec } from "./types";

// Small deterministic PRNG (mulberry32): the same seed always lays out the same hunting ground,
// on the client and later on the server.
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Up to `count` points inside `area`, each at least `minDist` from the others and outside every
// keep-clear circle. Gives up on a point after a fixed number of tries, so dense requests return fewer.
export function scatter(seed: number, area: Field, count: number, minDist: number, keepClear: { x: number; y: number; r: number }[]): Vec[] {
  const rand = seededRandom(seed);
  const out: Vec[] = [];
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const p = { x: area.minX + rand() * (area.maxX - area.minX), y: area.minY + rand() * (area.maxY - area.minY) };
      if (out.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < minDist)) continue;
      if (keepClear.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < c.r)) continue;
      out.push(p);
      break;
    }
  }
  return out;
}
