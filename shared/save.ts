// The whole save of one account, kept in its Global User State under "save" (spec 7).
export interface SaveData {
  version: 1;
  day: number;
  gold: number;
  meat: { premium: number; normal: number };
}

export function newSave(): SaveData {
  return { version: 1, day: 1, gold: 0, meat: { premium: 0, normal: 0 } };
}

function count(v: unknown, min = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : min;
}

// Whatever is stored (or nothing): a usable save. Unknown versions and garbage start over; broken
// fields are repaired, so a bad save never stops the game.
export function readSave(raw: unknown): SaveData {
  const r = raw as Partial<SaveData> | null;
  if (!r || typeof r !== "object" || r.version !== 1) return newSave();
  const meat = (r.meat ?? {}) as Partial<SaveData["meat"]>;
  return { version: 1, day: count(r.day, 1), gold: count(r.gold), meat: { premium: count(meat.premium), normal: count(meat.normal) } };
}
