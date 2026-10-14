import { BALANCE } from "./balance";
import { itemKey, parseItemKey } from "./content/items";
import { addToBag } from "./hunt/bag";
import { dropFor } from "./hunt/drops";
import { planHunt } from "./hunt/plan";
import type { SaveData, Zone } from "./save";

// What a hunt report lists, in the order things happened (spec 7: the client says what it took,
// the server re-creates the hunt from its seed to check it and decides the drops itself).
export type HuntEvent = { kill: string; grade: "premium" | "normal" } | { gather: string };

export type Action =
  | { type: "startHunt"; zone: Zone }
  | { type: "finishHunt"; huntId: string; events: HuntEvent[]; ko: boolean }
  | { type: "sellAll" }
  | { type: "endDay" };

// What only the server may decide: its clock and its dice.
export interface ActionContext {
  now: number;
  random: () => number;
}

// What the items fetch at the temporary shop (BALANCE.economy.itemPrice; premium parts their own price).
export function saleValue(items: Record<string, number>): number {
  let gold = 0;
  for (const [key, n] of Object.entries(items)) {
    const item = parseItemKey(key);
    if (!item) continue;
    const price = BALANCE.economy.itemPrice[item.id];
    gold += n * (item.grade === "premium" ? (price.premium ?? price.normal) : price.normal);
  }
  return gold;
}

// Knocked out on the hunt: half of every stack is lost, rounded down (spec 3).
export function koPenalty(items: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(items)) if (Math.floor(n / 2) > 0) out[k] = Math.floor(n / 2);
  return out;
}

const MAX_EVENTS = 200;

// Re-creates the hunt from its seed and checks the report: every kill a real spawn, taken once, the
// r-th refill (refills appear one per kill, in plan order) only after r+1 kills; every gathering spot real and taken once;
// not faster than BALANCE.hunt.minMsPerKill per kill. Items go into the bag in report order until it
// is full. Returns the items gained, or null for a report that cannot be true.
function settleHunt(save: SaveData, a: Record<string, unknown>, now: number): Record<string, number> | null {
  const hunt = save.hunt;
  if (!hunt || a.huntId !== hunt.id || !Array.isArray(a.events) || a.events.length > MAX_EVENTS || typeof a.ko !== "boolean") return null;
  const plan = planHunt(hunt.seed, hunt.zone);
  const spawns = new Map(plan.spawns.map((s) => [s.id, s]));
  const nodes = new Map(plan.nodes.map((n) => [n.id, n]));
  const refillOrder = new Map(plan.spawns.filter((s) => s.wave > 0).map((s, i) => [s.id, i]));
  const taken = new Set<string>();
  let kills = 0;
  let bag: Record<string, number> = {};
  for (const raw of a.events as unknown[]) {
    const e = raw as { kill?: unknown; grade?: unknown; gather?: unknown } | null;
    if (!e || typeof e !== "object") return null;
    if (typeof e.kill === "string") {
      const spawn = spawns.get(e.kill);
      if (!spawn || taken.has(e.kill) || (e.grade !== "premium" && e.grade !== "normal")) return null;
      const refill = refillOrder.get(e.kill);
      if (refill !== undefined && kills < refill + 1) return null;
      taken.add(e.kill);
      kills++;
      bag = addToBag(bag, itemKey(dropFor(hunt.seed, spawn), e.grade), BALANCE.hunt.bagSlots).bag;
    } else if (typeof e.gather === "string") {
      const node = nodes.get(e.gather);
      if (!node || taken.has(e.gather)) return null;
      taken.add(e.gather);
      bag = addToBag(bag, itemKey(node.item), BALANCE.hunt.bagSlots).bag;
    } else return null;
  }
  if (now - hunt.startedAt < kills * BALANCE.hunt.minMsPerKill) return null;
  return a.ko ? koPenalty(bag) : bag;
}

// The server's rules for every change to a save (the in-page LocalTransport runs the same code).
// `action` comes from the client, so it is checked here; a rejected action leaves the save as it was.
export function applyAction(save: SaveData, action: unknown, ctx: ActionContext): { save: SaveData; error?: string } {
  const a = action as Record<string, unknown> | null;
  if (!a || typeof a !== "object") return { save, error: "bad_action" };
  switch (a.type) {
    case "startHunt": {
      if (a.zone !== "forest") return { save, error: "bad_action" };
      const seed = Math.floor(ctx.random() * 2 ** 31);
      const id = `h${ctx.now.toString(36)}${Math.floor(ctx.random() * 1e9).toString(36)}`;
      return { save: { ...save, hunt: { id, seed, zone: a.zone, startedAt: ctx.now } } };
    }
    case "finishHunt": {
      const gained = settleHunt(save, a, ctx.now);
      if (!gained) return { save, error: "bad_hunt" };
      const items = { ...save.items };
      for (const [k, n] of Object.entries(gained)) items[k] = (items[k] ?? 0) + n;
      return { save: { ...save, items, hunt: null } };
    }
    case "sellAll":
      return { save: { ...save, gold: save.gold + saleValue(save.items), items: {} } };
    case "endDay":
      return { save: { ...save, day: save.day + 1 } };
    default:
      return { save, error: "bad_action" };
  }
}
