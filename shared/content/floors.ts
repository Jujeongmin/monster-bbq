import type { Field, Vec } from "../hunt/types";
import type { ItemId } from "./items";
import type { MonsterId } from "./monsters";
import { CAVE_OBJECTS, SMALL_OBJECTS, SWAMP_OBJECTS, TREES, type ObjectKind } from "./objects";

// The forest's floors (hunt v3 design 3): each a fixed ground (its layout comes from layoutSeed until the
// floor's own picture replaces it, stage 4), its exits (Bandal's carts: the only way home), the way down,
// how fast stamina drains there and who lives there in the morning and the afternoon. Floors 3-4 (boots,
// lantern) come in stage 3. The numbers are the user-approved draft (plan 08a), tuned in play.
export type FloorId = 1 | 2 | 3 | 4;
export type Period = "morning" | "afternoon";

export interface FloorExit {
  id: string;
  x: number;
  y: number;
}

export interface Roster {
  solo: [MonsterId, number][];
  // groups that move and fight together (chickens on floor 1, bats in the cave)
  flock: { monster: MonsterId; count: number; size: number } | null;
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
  // the gear needed to come down to this floor (hunt v3 design 4.5): boots for the swamp, a lantern for
  // the cave
  needs: "boots" | "lantern" | null;
  // the ground's tile and the things standing on it
  ground: "grass" | "swamp" | "cave";
  objects: { trees: ObjectKind[]; smalls: ObjectKind[] };
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
      { id: "1-e0", x: 300, y: 150 },
      { id: "1-e1", x: 1420, y: 180 },
      { id: "1-e2", x: 760, y: 960 },
    ],
    down: { x: 1380, y: 880 },
    needs: null,
    ground: "grass",
    objects: { trees: TREES, smalls: SMALL_OBJECTS },
    drainPerSec: 0.25,
    layoutSeed: 0x51f15e,
    roster: {
      morning: { solo: [["rabbit", 3]], flock: { monster: "chicken", count: 2, size: 3 }, waves: 3, forage: [["shiitake", 2], ["wild_garlic", 3], ["perilla", 3]] },
      afternoon: { solo: [["rabbit", 4]], flock: { monster: "chicken", count: 1, size: 3 }, waves: 3, forage: [["shiitake", 2], ["wild_garlic", 3], ["perilla", 3]] },
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
    down: { x: 1400, y: 560 },
    needs: null,
    ground: "grass",
    objects: { trees: TREES, smalls: SMALL_OBJECTS },
    drainPerSec: 0.4,
    layoutSeed: 0x2d0e7a,
    roster: {
      morning: { solo: [["boar", 3], ["bee", 2], ["rabbit", 1]], flock: null, waves: 3, forage: [["shiitake", 3]] },
      afternoon: { solo: [["boar", 3], ["bee", 3]], flock: null, waves: 3, forage: [["shiitake", 3]] },
    },
  },
  // the misty swamp (hunt v3 design 3): boots to come down; frogs and snakes; its ground art comes in
  // plan 08c Task 2 (until then the forest's)
  3: {
    world: { w: W, h: H },
    field: FIELD,
    start: { x: 160, y: 160 },
    exits: [
      { id: "3-e0", x: 1380, y: 900 },
      { id: "3-e1", x: 220, y: 940 },
    ],
    down: { x: 1380, y: 200 },
    needs: "boots",
    ground: "swamp",
    objects: SWAMP_OBJECTS,
    drainPerSec: 0.55,
    layoutSeed: 0x3a5f11,
    roster: {
      morning: { solo: [["frog", 3], ["snake", 3]], flock: null, waves: 3, forage: [] },
      afternoon: { solo: [["frog", 3], ["snake", 3]], flock: null, waves: 3, forage: [] },
    },
  },
  // the mossy cave: a lantern to come down, and only its light to see by; bats in flocks, glow-shroom
  // crabs, ore and glow-shrooms on the walls
  4: {
    world: { w: W, h: H },
    field: FIELD,
    start: { x: 1380, y: 200 },
    exits: [{ id: "4-e0", x: 220, y: 900 }],
    down: null,
    needs: "lantern",
    ground: "cave",
    objects: CAVE_OBJECTS,
    drainPerSec: 0.7,
    layoutSeed: 0x4c0a7e,
    roster: {
      morning: { solo: [["crab", 3]], flock: { monster: "bat", count: 2, size: 4 }, waves: 3, forage: [["iron_ore", 4], ["glow_mushroom", 3]] },
      afternoon: { solo: [["crab", 3]], flock: { monster: "bat", count: 2, size: 4 }, waves: 3, forage: [["iron_ore", 4], ["glow_mushroom", 3]] },
    },
  },
};

export function isFloorId(v: unknown): v is FloorId {
  return v === 1 || v === 2 || v === 3 || v === 4;
}

// The exit closest to `pos` on a floor (the HUD arrow points at it).
export function nearestExit(pos: Vec, floor: FloorId): FloorExit {
  let best = FLOORS[floor].exits[0];
  for (const e of FLOORS[floor].exits) if (Math.hypot(e.x - pos.x, e.y - pos.y) < Math.hypot(best.x - pos.x, best.y - pos.y)) best = e;
  return best;
}
