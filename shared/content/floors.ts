import type { Field, Vec } from "../hunt/types";
import type { ItemId } from "./items";
import type { MonsterId } from "./monsters";

// The forest's floors (hunt v3 design 3): each a fixed ground (its layout comes from layoutSeed until the
// floor's own picture replaces it, stage 4), its exits (Bandal's carts: the only way home), the way down,
// how fast stamina drains there and who lives there in the morning and the afternoon. Floors 3-4 (boots,
// lantern) come in stage 3. The numbers are the user-approved draft (plan 08a), tuned in play.
export type FloorId = 1 | 2;
export type Period = "morning" | "afternoon";

export interface FloorExit {
  id: string;
  x: number;
  y: number;
}

export interface Roster {
  solo: [MonsterId, number][];
  flocks: number;
  flockSize: number;
  // wave 0 is there from the start; each later wave refills as monsters are taken on this floor
  waves: number;
  forage: [ItemId, number][];
}

export interface FloorDef {
  world: { w: number; h: number };
  field: Field;
  // where the hunter arrives: floor 1 from the forest path, deeper floors at the foot of the way down
  start: Vec;
  exits: FloorExit[];
  // the way down to the next floor, or null on the deepest floor there is
  down: Vec | null;
  drainPerSec: number;
  layoutSeed: number;
  roster: Record<Period, Roster>;
}

const W = 1536;
const H = 1024;
const FIELD: Field = { minX: 16, maxX: W - 16, minY: 24, maxY: H - 16 };

export const FLOORS: Record<FloorId, FloorDef> = {
  1: {
    world: { w: W, h: H },
    field: FIELD,
    start: { x: 128, y: 128 },
    exits: [
      { id: "1-e0", x: 96, y: 72 },
      { id: "1-e1", x: 1420, y: 180 },
      { id: "1-e2", x: 760, y: 960 },
    ],
    down: { x: 1380, y: 880 },
    drainPerSec: 0.25,
    layoutSeed: 0x51f15e,
    roster: {
      morning: { solo: [["rabbit", 3]], flocks: 2, flockSize: 3, waves: 3, forage: [["shiitake", 2], ["wild_garlic", 3], ["perilla", 3]] },
      afternoon: { solo: [["rabbit", 4]], flocks: 1, flockSize: 3, waves: 3, forage: [["shiitake", 2], ["wild_garlic", 3], ["perilla", 3]] },
    },
  },
  2: {
    world: { w: W, h: H },
    field: FIELD,
    start: { x: 180, y: 880 },
    exits: [
      { id: "2-e0", x: 1380, y: 150 },
      { id: "2-e1", x: 900, y: 960 },
    ],
    down: null,
    drainPerSec: 0.4,
    layoutSeed: 0x2d0e7a,
    roster: {
      morning: { solo: [["boar", 3], ["bee", 2], ["rabbit", 1]], flocks: 0, flockSize: 0, waves: 3, forage: [["shiitake", 3]] },
      afternoon: { solo: [["boar", 3], ["bee", 3]], flocks: 0, flockSize: 0, waves: 3, forage: [["shiitake", 3]] },
    },
  },
};

export function isFloorId(v: unknown): v is FloorId {
  return v === 1 || v === 2;
}

// The exit closest to `pos` on a floor (the HUD arrow points at it).
export function nearestExit(pos: Vec, floor: FloorId): FloorExit {
  let best = FLOORS[floor].exits[0];
  for (const e of FLOORS[floor].exits) if (Math.hypot(e.x - pos.x, e.y - pos.y) < Math.hypot(best.x - pos.x, best.y - pos.y)) best = e;
  return best;
}
