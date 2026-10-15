import { parseItemKey, slotsOf } from "../content/items";

// The hunting bag: item key -> count, limited to a number of slots in total (upgrades: bag). A deep-floor
// material takes two slots (hunt v3 design 3), everything else one.
const weight = (key: string): number => {
  const item = parseItemKey(key);
  return item ? slotsOf(item.id) : 1;
};

export function bagCount(bag: Record<string, number>): number {
  return Object.entries(bag).reduce((a, [k, n]) => a + n * weight(k), 0);
}

export function addToBag(bag: Record<string, number>, key: string, slots: number): { bag: Record<string, number>; added: boolean } {
  if (bagCount(bag) + weight(key) > slots) return { bag, added: false };
  return { bag: { ...bag, [key]: (bag[key] ?? 0) + 1 }, added: true };
}
