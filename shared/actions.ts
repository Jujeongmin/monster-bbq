import { BALANCE } from "./balance";
import { itemKey, parseItemKey } from "./content/items";
import type { SaveData } from "./save";

// Plan 02's hunt report (pork belly by grade); replaced by startHunt/finishHunt in plan 03 Task 6.
type Meat = { premium: number; normal: number };
export type Action = { type: "huntResult"; meat: Meat } | { type: "sellAll" } | { type: "endDay" };

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

function add(items: Record<string, number>, key: string, n: number): Record<string, number> {
  return n > 0 ? { ...items, [key]: (items[key] ?? 0) + n } : items;
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

// The server's rules for every change to a save (the in-page LocalTransport runs the same code).
// `action` comes from the client, so it is checked here; a rejected action leaves the save as it was.
export function applyAction(save: SaveData, action: unknown): { save: SaveData; error?: string } {
  const a = action as { type?: unknown; meat?: Partial<Meat> | null } | null;
  if (!a || typeof a !== "object") return { save, error: "bad_action" };
  switch (a.type) {
    case "huntResult": {
      const m = a.meat;
      if (!m || !isCount(m.premium) || !isCount(m.normal) || m.premium + m.normal > BALANCE.economy.maxMeatPerHunt) return { save, error: "bad_hunt" };
      const items = add(add(save.items, itemKey("boar_belly", "premium"), m.premium), itemKey("boar_belly", "normal"), m.normal);
      return { save: { ...save, items } };
    }
    case "sellAll":
      return { save: { ...save, gold: save.gold + saleValue(save.items), items: {} } };
    case "endDay":
      return { save: { ...save, day: save.day + 1 } };
    default:
      return { save, error: "bad_action" };
  }
}

// Knocked out on the hunt: half of each grade is lost (spec 3).
export function koPenalty(meat: Meat): Meat {
  return { premium: Math.floor(meat.premium / 2), normal: Math.floor(meat.normal / 2) };
}
