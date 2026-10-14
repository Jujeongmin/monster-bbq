import { parseItemKey } from "./content/items";

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
  version: 2;
  day: number;
  gold: number;
  // item key (see itemKey) -> count
  items: Record<string, number>;
  hunt: PendingHunt | null;
}

export function newSave(): SaveData {
  return { version: 2, day: 1, gold: 0, items: {}, hunt: null };
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

// Whatever is stored (or nothing): a usable save. Version 1 (meat counted by grade only) moves into
// items as pork belly; unknown versions and garbage start over; broken fields are repaired, so a bad
// save never stops the game.
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
  if (r.version !== 2) return newSave();
  return { version: 2, day: count(r.day, 1), gold: count(r.gold), items: readItems(r.items), hunt: readHunt(r.hunt) };
}
