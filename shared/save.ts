import { isDishId, type DishId } from "./content/dishes";
import { isItemId, parseItemKey, type ItemId } from "./content/items";
import { RECIPES } from "./content/recipes";
import { BALANCE } from "./balance";
import type { Period } from "./content/floors";
import { isSideWeaponId, type SideWeaponId } from "./content/sideWeapons";
import { isUpgradeId, type UpgradeId } from "./content/upgrades";
import { MAX_DISH_LEVEL, MAX_SETS, type MenuLine, type TonightDish } from "./kitchen/dish";

export type Zone = "forest";

// A hunt the server has started and not yet settled: its seed decides every floor's monsters and
// gathering spots; `period` is the morning or the afternoon hunt (hunt v3 design 3).
export interface PendingHunt {
  id: string;
  seed: number;
  zone: Zone;
  period: Period;
  // the side weapon taken out (its shots are the whole hunt's)
  side: SideWeaponId;
  startedAt: number;
}

// Tonight's service as the server opened it: its seed decides the customers; the ingredients were taken
// when it opened (openShop) and became these plates.
export interface PendingService {
  id: string;
  seed: number;
  startedAt: number;
  dishes: TonightDish[];
}

// The last settled service, for the settle screen (and to ignore a resent report).
export interface ServiceSummary {
  id: string;
  served: number;
  left: number;
  sales: number;
  tips: number;
  // what the drinks brought in, grills scrubbed (plan 07b; older summaries read both as 0)
  drinks: number;
  cleaned: number;
  happy: number;
  repDelta: number;
}

// Where the day is (hunt v3 design 3): the morning hunt, lunch (after it; the afternoon hunt starts from
// here), the evening kitchen, the settle screen. The server moves it along, so a reload cannot skip ahead
// or hunt a third time in one day.
export type Stage = "hunt" | "lunch" | "kitchen" | "settle";

const isStage = (v: unknown): v is Stage => v === "hunt" || v === "lunch" || v === "kitchen" || v === "settle";

// The whole save of one account, kept in its Global User State under "save" (spec 7).
export interface SaveData {
  version: 8;
  day: number;
  stage: Stage;
  gold: number;
  // item key (see itemKey) -> count
  items: Record<string, number>;
  hunt: PendingHunt | null;
  // every ingredient ever brought home: the cookbook shows these on the dish silhouettes
  seenItems: ItemId[];
  // researched dishes -> level (1..MAX_DISH_LEVEL)
  dishes: Partial<Record<DishId, number>>;
  // last night's menu, offered again on the menu board
  menu: MenuLine[];
  reputation: number;
  // upgrade levels bought (missing = the starting level, see shared/growth)
  upgrades: Partial<Record<UpgradeId, number>>;
  // dishes packed for the next hunt (emptied when it is settled)
  lunchbox: DishId[];
  service: PendingService | null;
  lastService: ServiceSummary | null;
  // the key to the Charge King's den (the tusk boss drops it, plan 08d) and the notebook pages the
  // bosses gave back ("forest" = chapter 1)
  bossKey: boolean;
  pages: string[];
}

export function newSave(): SaveData {
  return {
    version: 8,
    day: 1,
    stage: "hunt",
    gold: 0,
    items: {},
    hunt: null,
    seenItems: [],
    dishes: {},
    menu: [],
    reputation: 0,
    upgrades: {},
    lunchbox: [],
    service: null,
    lastService: null,
    bossKey: false,
    pages: [],
  };
}

function count(v: unknown, min = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : min;
}

const isWhole = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

function readItems(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, n] of Object.entries(raw)) {
    if (!parseItemKey(key) || typeof n !== "number" || !Number.isFinite(n)) continue;
    const c = Math.floor(n);
    if (c > 0) out[key] = c;
  }
  return out;
}

function readHunt(raw: unknown): PendingHunt | null {
  const h = raw as Partial<PendingHunt> | null;
  if (!h || typeof h !== "object") return null;
  if (typeof h.id !== "string" || typeof h.seed !== "number" || h.zone !== "forest" || typeof h.startedAt !== "number") return null;
  // a hunt saved before hunt v3 (or with an unknown time of day) is the morning hunt
  const period = h.period === "afternoon" ? "afternoon" : "morning";
  // a hunt saved before side weapons carried the slingshot
  const side = isSideWeaponId(h.side) ? h.side : "sling";
  return { id: h.id, seed: h.seed, zone: h.zone, period, side, startedAt: h.startedAt };
}

// A list of known values, each once, in stored order.
function readList<T>(raw: unknown, ok: (v: unknown) => v is T): T[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(ok))] : [];
}

function readDishes(raw: unknown): Partial<Record<DishId, number>> {
  const out: Partial<Record<DishId, number>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, lv] of Object.entries(raw)) if (isDishId(id) && isWhole(lv, 1, MAX_DISH_LEVEL)) out[id] = lv;
  return out;
}

// Menu lines of researched dishes, each dish once, 1..MAX_SETS sets.
function readMenu(raw: unknown, dishes: Partial<Record<DishId, number>>): MenuLine[] {
  const out: MenuLine[] = [];
  if (!Array.isArray(raw)) return out;
  for (const l of raw as { dish?: unknown; sets?: unknown }[]) {
    if (!l || typeof l !== "object" || !isDishId(l.dish) || !dishes[l.dish] || !isWhole(l.sets, 1, MAX_SETS) || out.some((o) => o.dish === l.dish)) continue;
    out.push({ dish: l.dish, sets: l.sets });
  }
  return out;
}

function readTonight(raw: unknown): TonightDish[] {
  const out: TonightDish[] = [];
  if (!Array.isArray(raw)) return out;
  for (const d of raw as { dish?: unknown; plates?: unknown; price?: unknown }[]) {
    if (!d || typeof d !== "object" || !isDishId(d.dish) || !isWhole(d.plates, 0, 10_000) || !isWhole(d.price, 0, 1_000_000) || out.some((o) => o.dish === d.dish)) continue;
    out.push({ dish: d.dish, plates: d.plates, price: d.price });
  }
  return out;
}

function readService(raw: unknown): PendingService | null {
  const r = raw as Partial<PendingService> | null;
  if (!r || typeof r !== "object" || typeof r.id !== "string" || typeof r.seed !== "number" || typeof r.startedAt !== "number") return null;
  return { id: r.id, seed: r.seed, startedAt: r.startedAt, dishes: readTonight(r.dishes) };
}

function readUpgrades(raw: unknown): Partial<Record<UpgradeId, number>> {
  const out: Partial<Record<UpgradeId, number>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, lv] of Object.entries(raw)) {
    if (!isUpgradeId(id) || typeof lv !== "number" || !Number.isInteger(lv)) continue;
    const u = BALANCE.upgrades[id];
    if (lv >= u.base && lv <= u.base + u.costs.length) out[id] = lv;
  }
  return out;
}

function readSummary(raw: unknown): ServiceSummary | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || typeof r.id !== "string") return null;
  const nums = ["served", "left", "sales", "tips", "happy", "repDelta"] as const;
  if (!nums.every((k) => typeof r[k] === "number" && Number.isFinite(r[k]))) return null;
  const opt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return { id: r.id, served: r.served as number, left: r.left as number, sales: r.sales as number, tips: r.tips as number, drinks: opt(r.drinks), cleaned: opt(r.cleaned), happy: r.happy as number, repDelta: r.repDelta as number };
}

// The upgrades that went with hands-on cooking (restaurant v2) and what each of their levels cost.
const RETIRED_UPGRADES: Record<string, { base: number; costs: number[] }> = {
  pot: { base: 0, costs: [600] },
  wok: { base: 0, costs: [1500] },
  fryer: { base: 0, costs: [3000] },
  board: { base: 0, costs: [5000] },
  grillQuality: { base: 1, costs: [500, 2000] },
  potQuality: { base: 1, costs: [500, 2000] },
};

// The gold a stored upgrade table spent on retired upgrades (levels past the last one count as the last).
export function refundRetired(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  let gold = 0;
  for (const [id, u] of Object.entries(RETIRED_UPGRADES)) {
    const lv = (raw as Record<string, unknown>)[id];
    if (typeof lv !== "number" || !Number.isInteger(lv)) continue;
    const bought = Math.max(0, Math.min(u.costs.length, lv - u.base));
    gold += u.costs.slice(0, bought).reduce((a, b) => a + b, 0);
  }
  return gold;
}

// A version 2-4 save as version 5 fields (restaurant v2 design 3): found recipes open at level 1, their
// ingredients and the fridge's count as seen, last night's menu stays as one set a dish, the gold spent
// on retired upgrades comes back. An open service is closed: version 4 took the ingredients only when it
// was settled, so nothing is lost, and the day goes back to the kitchen.
function fromV4(r: Record<string, unknown>): Record<string, unknown> {
  const book = r.cookbook && typeof r.cookbook === "object" ? (r.cookbook as Record<string, unknown>) : {};
  const found = Object.keys(book).filter((id): id is DishId => isDishId(id) && !!book[id] && typeof book[id] === "object");
  const items = readItems(r.items);
  const seen = new Set<ItemId>([...Object.keys(items).map((k) => parseItemKey(k)!.id), ...found.flatMap((d) => RECIPES[d].items)]);
  const open = !!r.service && typeof r.service === "object";
  const stage = open ? "kitchen" : isStage(r.stage) ? r.stage : "hunt";
  return {
    version: 5,
    day: r.day,
    stage,
    gold: count(r.gold) + refundRetired(r.upgrades),
    items,
    hunt: r.hunt,
    seenItems: [...seen],
    dishes: Object.fromEntries(found.map((d) => [d, 1])),
    menu: readList(r.menu, isDishId)
      .filter((d) => found.includes(d))
      .map((dish) => ({ dish, sets: 1 })),
    reputation: r.reputation,
    upgrades: r.upgrades,
    lunchbox: r.lunchbox,
    service: null,
    lastService: r.lastService,
  };
}

// Whatever is stored (or nothing): a usable save. Version 1 (meat counted by grade only) moves into
// items as pork belly; versions 2-4 move to 5 (fromV4); unknown versions and garbage start over; broken
// fields are repaired, so a bad save never stops the game.
export function readSave(raw: unknown): SaveData {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return newSave();
  if (r.version === 1) {
    const meat = (r.meat ?? {}) as { premium?: unknown; normal?: unknown };
    return readSave({
      version: 2,
      day: r.day,
      gold: r.gold,
      items: { "boar_belly:premium": count(meat.premium), "boar_belly:normal": count(meat.normal) },
      hunt: null,
    });
  }
  if (r.version === 2 || r.version === 3 || r.version === 4) return readSave(fromV4(r));
  // version 6 (hunt v3) only adds the lunch stage and the hunt's time of day, both read with defaults
  if (r.version === 5) return readSave({ ...r, version: 6 });
  // version 7 (plan 08c): the stamina the armour gave moves to the stamina tank; the armour now takes
  // damage off and starts over at level 1
  if (r.version === 6) {
    const up = r.upgrades && typeof r.upgrades === "object" ? (r.upgrades as Record<string, unknown>) : {};
    return readSave({ ...r, version: 7, upgrades: up.armor === undefined ? up : { ...up, tank: up.armor, armor: 1 } });
  }
  // version 8 (plan 08d) adds the den's key and the pages given back, both read with defaults
  if (r.version === 7) return readSave({ ...r, version: 8 });
  if (r.version !== 8) return newSave();
  const dishes = readDishes(r.dishes);
  return {
    version: 8,
    day: count(r.day, 1),
    stage: isStage(r.stage) ? r.stage : "hunt",
    gold: count(r.gold),
    items: readItems(r.items),
    hunt: readHunt(r.hunt),
    seenItems: readList(r.seenItems, isItemId),
    dishes,
    menu: readMenu(r.menu, dishes),
    reputation: count(r.reputation),
    upgrades: readUpgrades(r.upgrades),
    // the same dish may be packed twice, so no de-duplication here
    lunchbox: Array.isArray(r.lunchbox) ? r.lunchbox.filter(isDishId) : [],
    service: readService(r.service),
    lastService: readSummary(r.lastService),
    bossKey: r.bossKey === true,
    pages: readList(r.pages, (p): p is string => p === "forest"),
  };
}
