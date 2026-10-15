import { BALANCE } from "../balance";
import type { DishId } from "../content/dishes";
import { ITEMS, parseItemKey } from "../content/items";

// What a served plate is worth (design 4: dish score = cooking accuracy x meat grade).
const SV = BALANCE.service;

// Cooking accuracy lifted by the share of premium parts among the monster parts on the plate.
export function dishScore(accuracy: number, keys: string[]): number {
  const parts = keys.map(parseItemKey).filter((i) => i && ITEMS[i.id].kind === "part");
  const premium = parts.filter((i) => i!.grade === "premium").length;
  return accuracy * (1 + (parts.length ? (SV.premiumBonus * premium) / parts.length : 0));
}

// Most of the price for any plate, the rest for skill; tips only for great plates.
export function serveValue(dish: DishId, score: number): { gold: number; tip: number; happy: boolean } {
  const price = SV.dishPrice[dish];
  const gold = Math.round(price * (0.6 + 0.4 * Math.min(1, Math.max(0, score))));
  const tip = Math.round(price * SV.tipRate * Math.min(1, Math.max(0, (score - 0.8) / 0.45)));
  return { gold, tip, happy: score >= SV.happyAt };
}
