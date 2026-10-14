import { BALANCE } from "./balance";
import { isMethod, type DishId } from "./content/dishes";
import { isUpgradeId, TOOL_UPGRADES } from "./content/upgrades";
import { isLocked, level, nextCost } from "./growth";
import { itemKey, parseItemKey, type ItemId } from "./content/items";
import { addToBag } from "./hunt/bag";
import { dropFor } from "./hunt/drops";
import { planHunt } from "./hunt/plan";
import { hintsFor, judgeCook, servings, type Recipe } from "./kitchen/cook";
import { planService } from "./service/plan";
import { dishScore, serveValue } from "./service/settle";
import type { SaveData, Zone } from "./save";

// What a hunt report lists, in the order things happened (spec 7: the client says what it took,
// the server re-creates the hunt from its seed to check it and decides the drops itself).
export type HuntEvent = { kill: string; grade: "premium" | "normal" } | { gather: string };

export type Action =
  | { type: "startHunt"; zone: Zone }
  | { type: "finishHunt"; huntId: string; events: HuntEvent[]; ko: boolean }
  | { type: "cook"; attemptId: string; items: string[]; method: string }
  | { type: "setMenu"; dishes: string[] }
  | { type: "startService" }
  | { type: "finishService"; serviceId: string; served: { customer: string; keys: string[]; accuracy: number }[]; left: string[] }
  | { type: "buyUpgrade"; id: string }
  | { type: "sellAll" }
  | { type: "endDay" };

// What only the server may decide or know: its clock, its dice and the recipe answers (null where the
// table is not available, e.g. a production build without the server: cooking is then refused).
export interface ActionContext {
  now: number;
  random: () => number;
  recipes: Record<DishId, Recipe> | null;
}

// What each stack fetches at the temporary shop (BALANCE.economy.itemPrice; premium parts their own
// price), the best-paying first; unknown keys fetch nothing and are left out.
export function saleLines(items: Record<string, number>): { key: string; n: number; gold: number }[] {
  const lines: { key: string; n: number; gold: number }[] = [];
  for (const [key, n] of Object.entries(items)) {
    const item = parseItemKey(key);
    if (!item) continue;
    const price = BALANCE.economy.itemPrice[item.id];
    lines.push({ key, n, gold: n * (item.grade === "premium" ? (price.premium ?? price.normal) : price.normal) });
  }
  return lines.sort((a, b) => b.gold - a.gold);
}

export function saleValue(items: Record<string, number>): number {
  return saleLines(items).reduce((sum, l) => sum + l.gold, 0);
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

// One try in the research kitchen: up to maxIngredients items of different kinds the player has, and a
// method. Each item is used up whatever comes out (spec 4). A resent try (same attemptId as the last
// one) changes nothing, so a lost reply never costs the ingredients twice.
function cook(save: SaveData, a: Record<string, unknown>, recipes: Record<DishId, Recipe> | null): { save: SaveData; error?: string } {
  if (!recipes) return { save, error: "unavailable" };
  const { attemptId, items: keys, method } = a;
  if (typeof attemptId !== "string" || attemptId.length < 1 || attemptId.length > 40) return { save, error: "bad_cook" };
  if (save.lastCook?.attemptId === attemptId) return { save };
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > BALANCE.kitchen.maxIngredients || !isMethod(method)) return { save, error: "bad_cook" };
  const ids: ItemId[] = [];
  for (const key of keys) {
    const item = typeof key === "string" ? parseItemKey(key) : null;
    if (!item || ids.includes(item.id) || (save.items[key as string] ?? 0) < 1) return { save, error: "bad_cook" };
    ids.push(item.id);
  }
  const items = { ...save.items };
  for (const key of keys as string[]) {
    items[key] -= 1;
    if (items[key] === 0) delete items[key];
  }
  const outcome = judgeCook(ids, method, recipes, save.cookbook);
  const found = outcome.kind === "new" ? outcome.dish : null;
  return {
    save: {
      ...save,
      items,
      cookbook: found ? { ...save.cookbook, [found]: recipes[found] } : save.cookbook,
      hints: found ? save.hints.filter((h) => h !== found) : save.hints,
      lastCook: { attemptId, outcome },
    },
  };
}

const MAX_SERVED = 60;

// The night's report checked against the customers the seed brought (cooking-service design 5): each
// served customer real, once, already arrived, given their order made of ingredients the player has;
// accuracy 0..1 (the server cannot see the cooking); not faster than minMsPerServe a plate. Pays,
// takes the ingredients, moves reputation (customers not served count as gone) and keeps a summary.
// The same report sent again after it was settled changes nothing.
function finishService(save: SaveData, a: Record<string, unknown>, now: number, recipes: Record<DishId, Recipe> | null): { save: SaveData; error?: string } {
  if (!recipes) return { save, error: "unavailable" };
  if (typeof a.serviceId === "string" && a.serviceId === save.lastService?.id) return { save };
  const svc = save.service;
  const bad = { save, error: "bad_service" };
  if (!svc || a.serviceId !== svc.id || !Array.isArray(a.served) || !Array.isArray(a.left) || a.served.length > MAX_SERVED || a.left.length > MAX_SERVED) return bad;
  const customers = new Map(planService(svc.seed, { day: save.day, reputation: save.reputation, menu: svc.menu }).map((c) => [c.id, c]));
  const elapsed = now - svc.startedAt;
  const seen = new Set<string>();
  const used: Record<string, number> = {};
  let sales = 0;
  let tips = 0;
  let happy = 0;
  let latest = 0;
  for (const raw of a.served as unknown[]) {
    const e = raw as { customer?: unknown; keys?: unknown; accuracy?: unknown } | null;
    if (!e || typeof e !== "object" || typeof e.customer !== "string" || seen.has(e.customer)) return bad;
    const c = customers.get(e.customer);
    if (!c || !Array.isArray(e.keys) || typeof e.accuracy !== "number" || !(e.accuracy >= 0 && e.accuracy <= 1)) return bad;
    const ids: ItemId[] = [];
    for (const key of e.keys as unknown[]) {
      const item = typeof key === "string" ? parseItemKey(key) : null;
      if (!item || ids.includes(item.id)) return bad;
      ids.push(item.id);
      used[key as string] = (used[key as string] ?? 0) + 1;
    }
    const recipe = recipes[c.dish].items;
    if (ids.length !== recipe.length || !recipe.every((id) => ids.includes(id))) return bad;
    seen.add(e.customer);
    latest = Math.max(latest, c.arriveMs);
    const v = serveValue(c.dish, dishScore(e.accuracy, e.keys as string[]));
    sales += v.gold;
    tips += v.tip;
    if (v.happy) happy++;
  }
  for (const id of a.left as unknown[]) {
    if (typeof id !== "string" || !customers.has(id) || seen.has(id)) return bad;
  }
  if (new Set(a.left as string[]).size !== (a.left as string[]).length) return bad;
  if (elapsed < latest || elapsed < seen.size * BALANCE.service.minMsPerServe) return bad;
  const items = { ...save.items };
  for (const [k, n] of Object.entries(used)) {
    if ((items[k] ?? 0) < n) return bad;
    items[k] -= n;
    if (items[k] === 0) delete items[k];
  }
  const gone = customers.size - seen.size;
  const reputation = Math.max(0, save.reputation + happy * BALANCE.service.rep.happy + gone * BALANCE.service.rep.left);
  return {
    save: {
      ...save,
      items,
      gold: save.gold + sales + tips,
      reputation,
      stage: "settle",
      service: null,
      lastService: { id: svc.id, served: seen.size, left: gone, sales, tips, happy, repDelta: reputation - save.reputation },
    },
  };
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
      // a related ingredient in hand opens a dish's cookbook hint (spec 4)
      const ids = Object.keys(gained).map((k) => parseItemKey(k)!.id);
      const hints = ctx.recipes ? hintsFor(ids, ctx.recipes, save.cookbook, save.hints) : save.hints;
      return { save: { ...save, items, hunt: null, hints, stage: "kitchen" } };
    }
    case "cook":
      return cook(save, a, ctx.recipes);
    case "setMenu": {
      const d = a.dishes;
      const ok =
        Array.isArray(d) &&
        d.length <= BALANCE.kitchen.menuSlots &&
        new Set(d).size === d.length &&
        d.every((id) => {
          const r = typeof id === "string" ? save.cookbook[id as DishId] : undefined;
          return r !== undefined && save.tools.includes(r.method);
        });
      if (!ok) return { save, error: "bad_menu" };
      return { save: { ...save, menu: [...(d as DishId[])] } };
    }
    case "startService": {
      if (save.stage !== "kitchen") return { save, error: "wrong_stage" };
      if (save.menu.length === 0) return { save, error: "no_menu" };
      if (!save.menu.some((d) => save.cookbook[d] && servings(save.cookbook[d]!, save.items) > 0)) return { save, error: "no_ingredients" };
      const seed = Math.floor(ctx.random() * 2 ** 31);
      const id = `s${ctx.now.toString(36)}${Math.floor(ctx.random() * 1e9).toString(36)}`;
      return { save: { ...save, service: { id, seed, startedAt: ctx.now, menu: [...save.menu] } } };
    }
    case "finishService":
      return finishService(save, a, ctx.now, ctx.recipes);
    case "buyUpgrade": {
      if (!isUpgradeId(a.id)) return { save, error: "bad_action" };
      const cost = nextCost(save, a.id);
      if (cost === null) return { save, error: "max_level" };
      if (isLocked(save, a.id)) return { save, error: "locked" };
      if (save.gold < cost) return { save, error: "no_gold" };
      const method = TOOL_UPGRADES[a.id];
      const tools = method && !save.tools.includes(method) ? [...save.tools, method] : save.tools;
      return { save: { ...save, gold: save.gold - cost, upgrades: { ...save.upgrades, [a.id]: level(save, a.id) + 1 }, tools } };
    }
    case "sellAll":
      return { save: { ...save, gold: save.gold + saleValue(save.items), items: {} } };
    case "endDay":
      // from the settle screen, or from the kitchen when the shop stays shut tonight; never mid-hunt
      if (save.stage === "hunt") return { save, error: "wrong_stage" };
      return { save: { ...save, day: save.day + 1, stage: "hunt" } };
    default:
      return { save, error: "bad_action" };
  }
}
