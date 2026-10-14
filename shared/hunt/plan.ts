import { BALANCE } from "../balance";
import type { ItemId } from "../content/items";
import { MONSTERS, type MonsterId } from "../content/monsters";
import { OBJECT_KINDS, SMALL_OBJECTS, TREES, type ObjectKind } from "../content/objects";
import type { Zone } from "../save";
import type { Rect } from "./geometry";
import { scatter, seededRandom } from "./scatter";

// One hunt's whole hunting ground, decided by the seed the server hands out. The client draws it and
// the server re-creates it to check the report (spec 7), so everything random here comes from the seed.
export interface HuntPlan {
  objects: { kind: ObjectKind; x: number; y: number; foot: Rect }[];
  // wave 0 is there from the start; wave n refills as monsters are taken
  spawns: { id: string; monster: MonsterId; x: number; y: number; wave: number; flock?: string }[];
  nodes: { id: string; item: ItemId; x: number; y: number }[];
}

export const HUNT_START = { x: 128, y: 128 };

const ROSTER: Record<Zone, { solo: [MonsterId, number][]; flocks: number; flockSize: number; waves: number; forage: [ItemId, number][] }> = {
  forest: {
    solo: [["boar", 3], ["rabbit", 3], ["bee", 2]],
    flocks: 2,
    flockSize: 3,
    waves: 3,
    forage: [["shiitake", 4], ["wild_garlic", 3], ["perilla", 3]],
  },
};

export function planHunt(seed: number, zone: Zone): HuntPlan {
  const world = BALANCE.hunt.world;
  const area = { minX: 30, maxX: world.w - 30, minY: 60, maxY: world.h - 10 };
  const start = { ...HUNT_START, r: 110 };
  const pick = seededRandom(seed ^ 0x5bd1e995);

  // trees spread out, then bushes and rocks in the gaps; the start area stays open
  const objects: HuntPlan["objects"] = [];
  const place = (p: { x: number; y: number }, kind: ObjectKind) => {
    const { foot } = OBJECT_KINDS[kind];
    objects.push({ kind, x: p.x, y: p.y, foot: { x0: p.x - foot.w / 2, x1: p.x + foot.w / 2, y0: p.y - foot.h, y1: p.y } });
  };
  const treeSpots = scatter(seed, area, 46, 78, [start]);
  for (const p of treeSpots) place(p, TREES[Math.floor(pick() * TREES.length)]);
  for (const p of scatter(seed + 2, area, 34, 60, [start, ...treeSpots.map((t) => ({ x: t.x, y: t.y, r: 46 }))]))
    place(p, SMALL_OBJECTS[Math.floor(pick() * SMALL_OBJECTS.length)]);

  const clearOf = (x: number, y: number, r: number) =>
    !objects.some((o) => x > o.foot.x0 - r && x < o.foot.x1 + r && y > o.foot.y0 - r && y < o.foot.y1 + r);
  // a free spot from a scatter of candidates; falls back to the last candidate (never inside a base)
  const spots = (s: number, n: number, minDist: number, keepAway: number, r: number) =>
    scatter(s, area, n * 4, minDist, [{ ...HUNT_START, r: keepAway }]).filter((p) => clearOf(p.x, p.y, r)).slice(0, n);

  const roster = ROSTER[zone];
  const spawns: HuntPlan["spawns"] = [];
  let n = 0;
  for (let wave = 0; wave < roster.waves; wave++) {
    const solos = roster.solo.flatMap(([m, c]) => Array.from({ length: c }, () => m));
    const soloSpots = spots(seed + 100 + wave, solos.length, 90, 170, 12);
    solos.forEach((monster, i) => {
      const p = soloSpots[i % soloSpots.length];
      spawns.push({ id: `s${n++}`, monster, x: p.x, y: p.y, wave });
    });
    const centres = spots(seed + 200 + wave, roster.flocks, 160, 190, 40);
    centres.forEach((c, f) => {
      const flock = `f${wave}-${f}`;
      for (let k = 0; k < roster.flockSize; k++) {
        // members around the centre, nudged until clear of tree bases
        let x = c.x;
        let y = c.y;
        for (let tries = 0; tries < 12; tries++) {
          const a = pick() * Math.PI * 2;
          const d = 10 + pick() * 24;
          x = c.x + Math.cos(a) * d;
          y = c.y + Math.sin(a) * d;
          if (clearOf(x, y, MONSTERS.chicken.radius)) break;
          x = c.x;
          y = c.y;
        }
        spawns.push({ id: `s${n++}`, monster: "chicken", x, y, wave, flock });
      }
    });
  }

  const forage = roster.forage.flatMap(([item, c]) => Array.from({ length: c }, () => item));
  const nodeSpots = spots(seed + 300, forage.length, 70, 60, 6);
  const nodes = forage.map((item, i) => ({ id: `n${i}`, item, x: nodeSpots[i % nodeSpots.length].x, y: nodeSpots[i % nodeSpots.length].y }));

  return { objects, spawns, nodes };
}
