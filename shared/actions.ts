import { BALANCE } from "./balance";
import { isDishId, type DishId } from "./content/dishes";
import { isUpgradeId } from "./content/upgrades";
import { RECIPES } from "./content/recipes";
import { bagSlots, isLocked, level, lunchSlots, menuSlots, nextCost } from "./growth";
import { itemKey, parseItemKey, type ItemId } from "./content/items";
import { addToBag } from "./hunt/bag";
import { dropFor } from "./hunt/drops";
import { planHunt } from "./hunt/plan";
import { levelCost, MAX_SETS, planShop, takeSets, type MenuLine } from "./kitchen/dish";
import { settleService } from "./service/settle";
import type { SaveData, Zone } from "./save";

// What a hunt report lists, in the order things happened (spec 7: the client says what it took,
// the server re-creates the hunt from its seed to check it and decides the drops itself).
export type HuntEvent = { kill: string; grade: "premium" | "normal" } | { gather: string };

export type Action =
  | { type: "startHunt"; zone: Zone }
  | { type: "finishHunt"; huntId: string; events: HuntEvent[]; ko: boolean }
  | { type: "research"; dish: string }
  | { type: "upgradeDish"; dish: string; from?: number }
  | { type: "openShop"; menu: { dish: string; sets: number }[] }
  | { type: "finishService"; serviceId: string; served: { customer: string; dish: string }[]; left: string[] }
  | { type: "buyUpgrade"; id: string }
  | { type: "packLunch"; dishes: string[] }
  | { type: "endDay" };

// What only the server may decide: its clock and its dice.
export interface ActionContext {
  now: number;
  random: () => number;
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
      bag = addToBag(bag, itemKey(dropFor(hunt.seed, spawn), e.grade), bagSlots(save)).bag;
    } else if (typeof e.gather === "string") {
      const node = nodes.get(e.gather);
      if (!node || taken.has(e.gather)) return null;
      taken.add(e.gather);
      bag = addToBag(bag, itemKey(node.item), bagSlots(save)).bag;
    } else return null;
  }
  if (now - hunt.startedAt < kills * BALANCE.hunt.minMsPerKill) return null;
  return a.ko ? koPenalty(bag) : bag;
}

// Lunchboxes (growth design 2): found dishes packed from real ingredients (regular grade first, so the
// premium meat stays for paying guests), up to the box's slots, never during a hunt.
function packLunch(save: SaveData, a: Record<string, unknown>): { save: SaveData; error?: string } {
  const bad = { save, error: "bad_lunch" };
  const d = a.dishes;
  if (save.hunt || save.service || !Array.isArray(d) || d.length === 0 || save.lunchbox.length + d.length > lunchSlots(save)) return bad;
  let items = save.items;
  for (const dish of d as unknown[]) {
    if (!isDishId(dish) || !save.dishes[dish]) return bad;
    const took = takeSets(items, dish, 1);
    if (!took) return bad;
    items = took.items;
  }
  return { save: { ...save, items, lunchbox: [...save.lunchbox, ...(d as DishId[])] } };
}

// Pays for a dish's next level (1 = research): gold and sets of its own ingredients (regular first).
function payLevel(save: SaveData, dish: DishId, target: number): { save: SaveData; error?: string } {
  const cost = levelCost(dish, target);
  if (!cost) return { save, error: "max_level" };
  if (save.gold < cost.gold) return { save, error: "no_gold" };
  const took = takeSets(save.items, dish, cost.sets);
  if (!took) return { save, error: "no_ingredients" };
  return { save: { ...save, gold: save.gold - cost.gold, items: took.items, dishes: { ...save.dishes, [dish]: target } } };
}

// Research (restaurant v2 design 3): a dish opens once every ingredient of it has been brought home.
// A second press (or a retry after a lost reply) finds it known and changes nothing.
function research(save: SaveData, a: Record<string, unknown>): { save: SaveData; error?: string } {
  if (!isDishId(a.dish)) return { save, error: "bad_action" };
  if (save.stage !== "kitchen" || save.service) return { save, error: "wrong_stage" };
  if (save.dishes[a.dish]) return { save };
  if (!RECIPES[a.dish].items.every((id) => save.seenItems.includes(id))) return { save, error: "unseen" };
  return payLevel(save, a.dish, 1);
}

function upgradeDish(save: SaveData, a: Record<string, unknown>): { save: SaveData; error?: string } {
  if (!isDishId(a.dish)) return { save, error: "bad_action" };
  if (save.stage !== "kitchen" || save.service) return { save, error: "wrong_stage" };
  const lv = save.dishes[a.dish];
  if (!lv) return { save, error: "unknown_dish" };
  // `from` is the level the client saw: a retry after a lost reply finds the dish already past it and
  // changes nothing, so a slow network never pays for two levels
  if (a.from !== undefined) {
    if (typeof a.from !== "number" || !Number.isInteger(a.from) || a.from > lv) return { save, error: "bad_action" };
    if (a.from < lv) return { save };
  }
  return payLevel(save, a.dish, lv + 1);
}

// Tonight's menu board (restaurant v2 design 3): researched dishes, each once, up to the menu slots,
// 1..MAX_SETS sets each. The sets come out of the fridge now and become tonight's plates; what is left
// at closing is thrown away. The server's seed brings the customers.
function openShop(save: SaveData, a: Record<string, unknown>, ctx: ActionContext): { save: SaveData; error?: string } {
  if (save.stage !== "kitchen") return { save, error: "wrong_stage" };
  // already open (a retry after a lost reply): tonight stands as it was opened, nothing taken twice
  if (save.service) return { save };
  const m = a.menu;
  if (!Array.isArray(m) || m.length === 0) return { save, error: "no_menu" };
  const bad = { save, error: "bad_menu" };
  if (m.length > menuSlots(save)) return bad;
  const lines: MenuLine[] = [];
  for (const raw of m as { dish?: unknown; sets?: unknown }[]) {
    if (!raw || typeof raw !== "object" || !isDishId(raw.dish) || !save.dishes[raw.dish] || lines.some((l) => l.dish === raw.dish)) return bad;
    if (typeof raw.sets !== "number" || !Number.isInteger(raw.sets) || raw.sets < 1 || raw.sets > MAX_SETS) return bad;
    lines.push({ dish: raw.dish, sets: raw.sets });
  }
  const plan = planShop(save.items, save.dishes, lines);
  if (!plan) return { save, error: "no_ingredients" };
  const seed = Math.floor(ctx.random() * 2 ** 31);
  const id = `s${ctx.now.toString(36)}${Math.floor(ctx.random() * 1e9).toString(36)}`;
  return { save: { ...save, items: plan.items, menu: lines, service: { id, seed, startedAt: ctx.now, dishes: plan.dishes } } };
}

// The server's rules for every change to a save (the in-page LocalTransport runs the same code).
// `action` comes from the client, so it is checked here; a rejected action leaves the save as it was.
export function applyAction(save: SaveData, action: unknown, ctx: ActionContext): { save: SaveData; error?: string } {
  const a = action as Record<string, unknown> | null;
  if (!a || typeof a !== "object") return { save, error: "bad_action" };
  switch (a.type) {
    case "startHunt": {
      if (a.zone !== "forest") return { save, error: "bad_action" };
      if (save.stage !== "hunt") return { save, error: "wrong_stage" };
      const seed = Math.floor(ctx.random() * 2 ** 31);
      const id = `h${ctx.now.toString(36)}${Math.floor(ctx.random() * 1e9).toString(36)}`;
      return { save: { ...save, hunt: { id, seed, zone: a.zone, startedAt: ctx.now } } };
    }
    case "finishHunt": {
      const gained = settleHunt(save, a, ctx.now);
      if (!gained) return { save, error: "bad_hunt" };
      const items = { ...save.items };
      for (const [k, n] of Object.entries(gained)) items[k] = (items[k] ?? 0) + n;
      // what came home shows on the cookbook's silhouettes from now on (restaurant v2 design 3)
      const ids = Object.keys(gained).map((k) => parseItemKey(k)!.id);
      const seenItems = [...new Set<ItemId>([...save.seenItems, ...ids])];
      return { save: { ...save, items, hunt: null, seenItems, stage: "kitchen", lunchbox: [] } };
    }
    case "research":
      return research(save, a);
    case "upgradeDish":
      return upgradeDish(save, a);
    case "openShop":
      return openShop(save, a, ctx);
    case "finishService":
      return settleService(save, a, ctx.now);
    case "buyUpgrade": {
      if (!isUpgradeId(a.id)) return { save, error: "bad_action" };
      const cost = nextCost(save, a.id);
      if (cost === null) return { save, error: "max_level" };
      if (isLocked(save, a.id)) return { save, error: "locked" };
      if (save.gold < cost) return { save, error: "no_gold" };
      return { save: { ...save, gold: save.gold - cost, upgrades: { ...save.upgrades, [a.id]: level(save, a.id) + 1 } } };
    }
    case "packLunch":
      return packLunch(save, a);
    case "endDay":
      // from the settle screen, or from the kitchen when the shop stays shut tonight; never mid-hunt and
      // never while tonight's service is still open
      if (save.stage === "hunt" || save.service) return { save, error: "wrong_stage" };
      return { save: { ...save, day: save.day + 1, stage: "hunt" } };
    default:
      return { save, error: "bad_action" };
  }
}
