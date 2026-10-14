import { isDishId, isMethod, type DishId, type Method } from "./content/dishes";
import { isItemId, parseItemKey, type ItemId } from "./content/items";
import type { CookOutcome, CookResult, Recipe } from "./kitchen/cook";

export type Zone = "forest";

// A hunt the server has started and not yet settled: its seed decides the whole hunting ground.
export interface PendingHunt {
  id: string;
  seed: number;
  zone: Zone;
  startedAt: number;
}

// The whole save of one account, kept in its Global User State under "save" (spec 7).
export interface SaveData {
  version: 3;
  day: number;
  gold: number;
  // item key (see itemKey) -> count
  items: Record<string, number>;
  hunt: PendingHunt | null;
  // the recipes this player has found (the full table is the server's)
  cookbook: Partial<Record<DishId, Recipe>>;
  // dishes not found yet whose cookbook hint line is open (a related ingredient was gained)
  hints: DishId[];
  // tonight's menu
  menu: DishId[];
  // cooking tools owned; a dish goes on the menu only if its method's tool is here
  tools: Method[];
  lastCook: CookResult | null;
}

export function newSave(): SaveData {
  return { version: 3, day: 1, gold: 0, items: {}, hunt: null, cookbook: {}, hints: [], menu: [], tools: ["grill"], lastCook: null };
}

function count(v: unknown, min = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : min;
}

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
  return { id: h.id, seed: h.seed, zone: h.zone, startedAt: h.startedAt };
}

function readCookbook(raw: unknown): Partial<Record<DishId, Recipe>> {
  const out: Partial<Record<DishId, Recipe>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, r] of Object.entries(raw as Record<string, Partial<Recipe> | null>)) {
    if (!isDishId(id) || !r || !isMethod(r.method) || !Array.isArray(r.items)) continue;
    const items = r.items as unknown[];
    if (items.length < 1 || items.length > 3 || !items.every(isItemId) || new Set(items).size !== items.length) continue;
    out[id] = { method: r.method, items: [...(items as ItemId[])] };
  }
  return out;
}

// A list of known values, each once, in stored order.
function readList<T>(raw: unknown, ok: (v: unknown) => v is T): T[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(ok))] : [];
}

function readOutcome(o: Record<string, unknown> | null): CookOutcome | null {
  if (!o || typeof o !== "object") return null;
  if ((o.kind === "new" || o.kind === "known") && isDishId(o.dish)) return { kind: o.kind, dish: o.dish };
  if (o.kind === "near" && (o.hint === "method" || o.hint === "extra")) return { kind: "near", hint: o.hint };
  if (o.kind === "near" && o.hint === "missing" && (o.taste === "meat" || o.taste === "veg" || o.taste === "sweet")) return { kind: "near", hint: "missing", taste: o.taste };
  if (o.kind === "fail" && isMethod(o.method)) return { kind: "fail", method: o.method };
  return null;
}

function readLastCook(raw: unknown): CookResult | null {
  const r = raw as { attemptId?: unknown; outcome?: unknown } | null;
  if (!r || typeof r !== "object" || typeof r.attemptId !== "string") return null;
  const outcome = readOutcome(r.outcome as Record<string, unknown> | null);
  return outcome ? { attemptId: r.attemptId, outcome } : null;
}

// Whatever is stored (or nothing): a usable save. Version 1 (meat counted by grade only) moves into
// items as pork belly, version 2 gets an empty kitchen; unknown versions and garbage start over; broken
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
  if (r.version !== 2 && r.version !== 3) return newSave();
  const tools = readList(r.tools, isMethod);
  return {
    version: 3,
    day: count(r.day, 1),
    gold: count(r.gold),
    items: readItems(r.items),
    hunt: readHunt(r.hunt),
    cookbook: readCookbook(r.cookbook),
    hints: readList(r.hints, isDishId),
    menu: readList(r.menu, isDishId),
    tools: tools.length > 0 ? tools : ["grill"],
    lastCook: readLastCook(r.lastCook),
  };
}
