import { BALANCE } from "./balance";
import { isDishId, isSignature, type DishId } from "./content/dishes";
import { awakenCost, canAwaken, isAwakenTarget, MAX_STARS, sleepDartsFor, starLevel } from "./awaken";
import { isUpgradeId } from "./content/upgrades";
import { RECIPES } from "./content/recipes";
import { ammoOf, bagSlots, isLocked, level, lunchSlots, menuSlots, nextCost, nextMats, ownsSide, sleepFallMs } from "./growth";
import { TAKE_HOWS, takeParts, type TakeHow } from "./hunt/stars";
import { isSideWeaponId, type SideWeaponId } from "./content/sideWeapons";
import { itemKey, parseItemKey, type ItemId } from "./content/items";
import { addToBag } from "./hunt/bag";
import { dropFor } from "./hunt/drops";
import { planFloor, type FloorPlan } from "./hunt/plan";
import { FLOORS, isFloorId, type FloorId } from "./content/floors";
import { levelCost, MAX_SETS, planShop, takeSets, type MenuLine } from "./kitchen/dish";
import { settleService } from "./service/settle";
import { vipLevel } from "./shop";
import { isStoryId } from "./content/story";
import type { SaveData, Zone } from "./save";

// What a hunt report lists, in the order things happened (hunt v3 design 5.3): each monster taken and how
// (the server turns that into parts by stars), each gathering spot, each way down to that floor. The
// server re-creates each floor from the seed to check it and decides the drops itself.
export type HuntEvent = { take: string; how: TakeHow } | { gather: string } | { down: FloorId };

export type Action =
  | { type: "startHunt"; zone: Zone; side: SideWeaponId }
  | { type: "finishHunt"; huntId: string; events: HuntEvent[]; exit: string | null; ko: boolean }
  | { type: "skipHunt" }
  | { type: "research"; dish: string }
  | { type: "upgradeDish"; dish: string; from?: number }
  | { type: "openShop"; menu: { dish: string; sets: number }[] }
  | { type: "finishService"; serviceId: string; served: { customer: string; dish: string; waitMs: number; drink?: string }[]; left: string[]; cleaned?: string[] }
  | { type: "buyUpgrade"; id: string }
  | { type: "packLunch"; dishes: string[] }
  | { type: "endDay" }
  | { type: "awaken"; target: string; from: number }
  | { type: "claimVipDaily" }
  | { type: "seeStory"; id: string };

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

// What a knockout takes: the other half of every stack (the hunt summary shows it).
export function koLost(items: Record<string, number>): Record<string, number> {
  const kept = koPenalty(items);
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(items)) if (n - (kept[k] ?? 0) > 0) out[k] = n - (kept[k] ?? 0);
  return out;
}

const MAX_EVENTS = 200;

// Re-creates the hunt floor by floor from its seed and follows the report: every way down taken from the
// floor the hunter is on to the next one that exists; every kill a real spawn of the current floor, taken
// once, the floor's r-th refill only after r+1 kills on that floor; every gathering spot of the current
// floor, taken once; home through an exit of the last floor (or knocked out, with no exit); not faster
// than minMsPerKill a kill and minMsPerFloor a way down. Monsters come by how they were taken (stars):
// sleep and the net only with that gun taken out and within its shots, and a capture or a sleep only as
// fast as the gauge fills or the dart works. Items go into the bag in report order until it
// is full. The den below the cave takes the key; the Charge King no sooner than minBossMs after coming
// down to him. Returns the items gained and which bosses were taken, or null for a report that cannot
// be true.
function settleHunt(save: SaveData, a: Record<string, unknown>, now: number): { bag: Record<string, number>; tusk: boolean; king: boolean } | null {
  const hunt = save.hunt;
  if (!hunt || a.huntId !== hunt.id || !Array.isArray(a.events) || a.events.length > MAX_EVENTS || typeof a.ko !== "boolean") return null;
  if (a.ko ? a.exit !== null : typeof a.exit !== "string") return null;
  const plans = new Map<FloorId, FloorPlan>();
  const planOf = (f: FloorId) => plans.get(f) ?? plans.set(f, planFloor(hunt.seed, f, hunt.period)).get(f)!;
  let floor: FloorId = 1;
  const taken = new Set<string>();
  const killsOn = new Map<FloorId, number>();
  let kills = 0;
  let descents = 0;
  let captures = 0;
  let sleeps = 0;
  let dartsUsed = 0;
  let netsUsed = 0;
  let bag: Record<string, number> = {};
  let tusk = false;
  let king = false;
  for (const raw of a.events as unknown[]) {
    const e = raw as { take?: unknown; how?: unknown; gather?: unknown; down?: unknown } | null;
    if (!e || typeof e !== "object") return null;
    const plan = planOf(floor);
    if (e.down !== undefined) {
      if (!FLOORS[floor].down || e.down !== floor + 1 || !isFloorId(e.down)) return null;
      // the swamp needs boots, the cave a lantern (hunt v3 design 4.5)
      const needs = FLOORS[e.down].needs;
      if (needs === "key" ? !save.bossKey : needs && level(save, needs) < 1) return null;
      floor = e.down;
      descents++;
    } else if (typeof e.take === "string") {
      const spawn = plan.spawns.find((s) => s.id === e.take);
      if (!spawn || taken.has(e.take) || !TAKE_HOWS.includes(e.how as TakeHow)) return null;
      const how = e.how as TakeHow;
      // sleeping and netting need that gun taken out, and only as many as its shots allow
      if (how === "sleep") {
        if (hunt.side !== "sleepGun") return null;
        // an awakened sleep gun takes fewer darts a monster (06b-1)
        dartsUsed += sleepDartsFor(spawn.monster, starLevel(save, "sleepGun"));
        if (dartsUsed > ammoOf(save, "sleepGun")) return null;
      }
      if (how === "net" && (hunt.side !== "netGun" || ++netsUsed > ammoOf(save, "netGun"))) return null;
      const refill = plan.spawns.filter((s) => s.wave > 0).indexOf(spawn);
      const onFloor = killsOn.get(floor) ?? 0;
      if (refill >= 0 && onFloor < refill + 1) return null;
      taken.add(e.take);
      killsOn.set(floor, onFloor + 1);
      kills++;
      if (how === "capture") captures++;
      if (how === "sleep") sleeps++;
      if (spawn.monster === "tusk") tusk = true;
      if (spawn.monster === "king") king = true;
      const got = takeParts(dropFor(hunt.seed, spawn), how, spawn.monster === "tusk" || spawn.monster === "king");
      for (let i = 0; i < got.count; i++) bag = addToBag(bag, got.key, bagSlots(save)).bag;
    } else if (typeof e.gather === "string") {
      const node = plan.nodes.find((n) => n.id === e.gather);
      if (!node || taken.has(e.gather)) return null;
      taken.add(e.gather);
      bag = addToBag(bag, itemKey(node.item), bagSlots(save)).bag;
    } else return null;
  }
  if (!a.ko && !FLOORS[floor].exits.some((x) => x.id === a.exit)) return null;
  const minMs = kills * BALANCE.hunt.minMsPerKill + descents * BALANCE.hunt.minMsPerFloor + captures * BALANCE.hunt.capture.minMs + sleeps * sleepFallMs(save) + (king ? BALANCE.hunt.king.minBossMs : 0);
  if (now - hunt.startedAt < minMs) return null;
  return { bag: a.ko ? koPenalty(bag) : bag, tusk, king };
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

// Awakening (06b-1): `from` is the star the screen saw, so a retry after a lost reply, or a second tap,
// finds the star already past it and changes nothing. Not while a hunt or a service is on (their
// settling checks use the stats they started with).
function awaken(save: SaveData, a: Record<string, unknown>): { save: SaveData; error?: string } {
  if (!isAwakenTarget(a.target)) return { save, error: "bad_action" };
  const now = starLevel(save, a.target);
  if (typeof a.from !== "number" || !Number.isInteger(a.from) || a.from > now) return { save, error: "bad_action" };
  if (a.from < now) return { save };
  if (save.hunt || save.service) return { save, error: "wrong_stage" };
  if (now >= MAX_STARS) return { save, error: "max_stars" };
  if (!canAwaken(save, a.target)) return { save, error: "not_owned" };
  const cost = awakenCost(now + 1);
  if (save.gold < cost.gold) return { save, error: "no_gold" };
  if (save.charcoal < cost.charcoal) return { save, error: "no_charcoal" };
  return { save: { ...save, gold: save.gold - cost.gold, charcoal: save.charcoal - cost.charcoal, stars: { ...save.stars, [a.target]: now + 1 } } };
}

// The VIP's charcoal (06b-1 design 3): once a game day, in the morning before the hunt.
function claimVipDaily(save: SaveData): { save: SaveData; error?: string } {
  const lv = vipLevel(save.vip.spent);
  if (lv === 0) return { save, error: "no_vip" };
  if (save.vip.day === save.day) return { save, error: "claimed" };
  if (save.stage !== "hunt" || save.hunt) return { save, error: "wrong_stage" };
  return { save: { ...save, charcoal: save.charcoal + lv * BALANCE.shop.vipDaily, vip: { ...save.vip, day: save.day } } };
}

// Research (restaurant v2 design 3): a dish opens once every ingredient of it has been brought home.
// A second press (or a retry after a lost reply) finds it known and changes nothing.
function research(save: SaveData, a: Record<string, unknown>): { save: SaveData; error?: string } {
  if (!isDishId(a.dish)) return { save, error: "bad_action" };
  if (save.stage !== "kitchen" || save.service) return { save, error: "wrong_stage" };
  if (save.dishes[a.dish]) return { save };
  // a signature dish opens only when its boss gives the page back
  if (isSignature(a.dish)) return { save, error: "signature" };
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
  const plan = planShop(save.items, save.dishes, lines, save.stars);
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
      if (a.zone !== "forest" || !isSideWeaponId(a.side)) return { save, error: "bad_action" };
      // the morning hunt from the day's start, the afternoon hunt from lunch (hunt v3 design 3)
      if (save.stage !== "hunt" && save.stage !== "lunch") return { save, error: "wrong_stage" };
      // already out (a retry after a lost reply): the same hunt stands, never a second seed
      if (save.hunt) return { save };
      if (!ownsSide(save, a.side)) return { save, error: "locked" };
      const period = save.stage === "hunt" ? "morning" : "afternoon";
      const seed = Math.floor(ctx.random() * 2 ** 31);
      const id = `h${ctx.now.toString(36)}${Math.floor(ctx.random() * 1e9).toString(36)}`;
      return { save: { ...save, hunt: { id, seed, zone: a.zone, period, side: a.side, startedAt: ctx.now } } };
    }
    case "finishHunt": {
      const settled = settleHunt(save, a, ctx.now);
      if (!settled) return { save, error: "bad_hunt" };
      const gained = settled.bag;
      const items = { ...save.items };
      for (const [k, n] of Object.entries(gained)) items[k] = (items[k] ?? 0) + n;
      // what came home shows on the cookbook's silhouettes from now on (restaurant v2 design 3)
      const ids = Object.keys(gained).map((k) => parseItemKey(k)!.id);
      const seenItems = [...new Set<ItemId>([...save.seenItems, ...ids])];
      // after the morning hunt comes lunch; after the afternoon one, the evening kitchen
      const stage = save.hunt!.period === "morning" ? "lunch" : "kitchen";
      // the tusk boss drops the den's key; the Charge King gives the forest's page back the first time,
      // and his signature dish opens (never lowering a level it already has) — plan 08d
      const firstKing = settled.king && !save.pages.includes("forest");
      const pages = firstKing ? [...save.pages, "forest"] : save.pages;
      const dishes = firstKing ? { ...save.dishes, king_galbi: Math.max(1, save.dishes.king_galbi ?? 0) } : save.dishes;
      // and the chapter boss's charcoal, the first time (06b-1)
      const charcoal = save.charcoal + (firstKing ? BALANCE.shop.bossCharcoal : 0);
      return { save: { ...save, items, hunt: null, seenItems, stage, lunchbox: [], bossKey: save.bossKey || settled.tusk, pages, dishes, charcoal } };
    }
    case "skipHunt":
      // staying home this afternoon: straight on to the evening kitchen
      // a retry after a lost reply finds the evening kitchen already reached and changes nothing
      if (save.stage === "kitchen" && !save.hunt) return { save };
      if (save.stage !== "lunch" || save.hunt) return { save, error: "wrong_stage" };
      return { save: { ...save, stage: "kitchen" } };
    case "research":
      return research(save, a);
    case "awaken":
      return awaken(save, a);
    case "claimVipDaily":
      return claimVipDaily(save);
    case "seeStory":
      // a scene watched (or skipped): remembered once, nothing else changes
      if (!isStoryId(a.id)) return { save, error: "bad_action" };
      return { save: save.story.includes(a.id) ? save : { ...save, story: [...save.story, a.id] } };
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
      // and the deep floors' materials (plan 08c)
      const items = { ...save.items };
      for (const m of nextMats(save, a.id)) {
        const key = itemKey(m.item);
        if ((items[key] ?? 0) < m.n) return { save, error: "no_materials" };
        items[key] -= m.n;
        if (items[key] === 0) delete items[key];
      }
      return { save: { ...save, gold: save.gold - cost, items, upgrades: { ...save.upgrades, [a.id]: level(save, a.id) + 1 } } };
    }
    case "packLunch":
      return packLunch(save, a);
    case "endDay":
      // from the settle screen, or from the kitchen when the shop stays shut tonight; never mid-hunt,
      // never at lunch (the afternoon is still to come) and never while tonight's service is still open
      if (save.stage === "hunt" || save.stage === "lunch" || save.service) return { save, error: "wrong_stage" };
      return { save: { ...save, day: save.day + 1, stage: "hunt" } };
    default:
      return { save, error: "bad_action" };
  }
}
