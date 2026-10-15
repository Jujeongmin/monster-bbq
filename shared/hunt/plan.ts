import { BALANCE } from "../balance";
import { FLOORS, type FloorId, type Period } from "../content/floors";
import type { ItemId } from "../content/items";
import { MONSTERS, type MonsterId } from "../content/monsters";
import { OBJECT_KINDS, type ObjectKind } from "../content/objects";
import type { Rect } from "./geometry";
import { scatter, seededRandom } from "./scatter";

// One floor of the forest as one hunt finds it (hunt v3 design 3). The ground (trees, bushes, rocks) is
// the floor's own and never changes (FLOORS layoutSeed); who lives there and what grows there come from
// the hunt's seed, so the server re-creates the same floor to check the report. Every id starts with the
// floor ("1-s0"), so a report cannot pass a monster off as one from another floor.
export interface FloorPlan {
  floor: FloorId;
  objects: { kind: ObjectKind; x: number; y: number; foot: Rect }[];
  // wave 0 is there when the hunter arrives; wave n refills as monsters are taken on this floor
  spawns: { id: string; monster: MonsterId; x: number; y: number; wave: number; flock?: string }[];
  nodes: { id: string; item: ItemId; x: number; y: number }[];
}

// spots kept open for walking in and out: the arrival, the exits, the way down
const KEEP_OPEN = 60;
const START_KEEP_AWAY = 170;
const TREE_COUNT = 18;
const SMALL_COUNT = 12;

export function planFloor(seed: number, floor: FloorId, period: Period): FloorPlan {
  const f = FLOORS[floor];
  const area = { minX: 30, maxX: f.world.w - 30, minY: 60, maxY: f.world.h - 10 };
  const open = [f.start, ...f.exits, ...(f.down ? [f.down] : [])].map((p) => ({ x: p.x, y: p.y, r: KEEP_OPEN }));

  // the fixed ground: trees spread out, then bushes and rocks in the gaps — few and far apart, so the
  // forest stays open to walk and aim in (user, 2026-10-15: it was too crowded)
  const ground = f.layoutSeed;
  const pick = seededRandom(ground ^ 0x5bd1e995);
  const objects: FloorPlan["objects"] = [];
  const place = (p: { x: number; y: number }, kind: ObjectKind) => {
    const { foot } = OBJECT_KINDS[kind];
    objects.push({ kind, x: p.x, y: p.y, foot: { x0: p.x - foot.w / 2, x1: p.x + foot.w / 2, y0: p.y - foot.h, y1: p.y } });
  };
  const treeSpots = scatter(ground, area, TREE_COUNT, 170, open);
  const kinds = f.objects;
  for (const p of treeSpots) place(p, kinds.trees[Math.floor(pick() * kinds.trees.length)]);
  for (const p of scatter(ground + 2, area, SMALL_COUNT, 130, [...open, ...treeSpots.map((t) => ({ x: t.x, y: t.y, r: 70 }))]))
    place(p, kinds.smalls[Math.floor(pick() * kinds.smalls.length)]);

  // who and what: from the hunt's seed, mixed with the floor so each floor differs
  const s0 = seed ^ (floor * 0x9e3779b1);
  const rand = seededRandom(s0 ^ 0x27d4eb2f);
  const clearOf = (x: number, y: number, r: number) =>
    !objects.some((o) => x > o.foot.x0 - r && x < o.foot.x1 + r && y > o.foot.y0 - r && y < o.foot.y1 + r);
  const spots = (s: number, n: number, minDist: number, r: number) =>
    scatter(s, area, n * 4, minDist, [{ ...f.start, r: START_KEEP_AWAY }, ...open]).filter((p) => clearOf(p.x, p.y, r)).slice(0, n);

  const roster = f.roster[period];
  const spawns: FloorPlan["spawns"] = [];
  let n = 0;
  for (let wave = 0; wave < roster.waves; wave++) {
    const solos = roster.solo.flatMap(([m, c]) => Array.from({ length: c }, () => m));
    const soloSpots = spots(s0 + 100 + wave, solos.length, 90, 12);
    solos.forEach((monster, i) => {
      const p = soloSpots[i % soloSpots.length];
      spawns.push({ id: `${floor}-s${n++}`, monster, x: p.x, y: p.y, wave });
    });
    const flock = roster.flock;
    const centres = flock ? spots(s0 + 200 + wave, flock.count, 160, 40) : [];
    centres.forEach((c, k) => {
      const id = `${floor}-f${wave}-${k}`;
      for (let m = 0; m < flock!.size; m++) {
        // members around the centre, nudged until clear of tree bases
        let x = c.x;
        let y = c.y;
        for (let tries = 0; tries < 12; tries++) {
          const a = rand() * Math.PI * 2;
          const d = 10 + rand() * 24;
          x = c.x + Math.cos(a) * d;
          y = c.y + Math.sin(a) * d;
          if (clearOf(x, y, MONSTERS[flock!.monster].radius)) break;
          x = c.x;
          y = c.y;
        }
        spawns.push({ id: `${floor}-s${n++}`, monster: flock!.monster, x, y, wave, flock: id });
      }
    });
  }

  const forage = roster.forage.flatMap(([item, c]) => Array.from({ length: c }, () => item));
  const nodeSpots = spots(s0 + 300, forage.length, 70, 6);
  const nodes = forage.map((item, i) => ({ id: `${floor}-n${i}`, item, x: nodeSpots[i % nodeSpots.length].x, y: nodeSpots[i % nodeSpots.length].y }));

  // the tusk boss (hunt v3 design 4.7): some hunts only, on floor 2, somewhere away from the arrival
  if (floor === 2 && rand() < BALANCE.hunt.tusk.chance) {
    const at = spots(s0 + 400, 1, 0, 24)[0];
    if (at) spawns.push({ id: "2-boss", monster: "tusk", x: at.x, y: at.y, wave: 0 });
  }

  return { floor, objects, spawns, nodes };
}
