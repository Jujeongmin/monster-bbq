import type { Method } from "./dishes";

// What gold can improve (growth design 2). Costs, locks and effects live in BALANCE.upgrades.
export const UPGRADE_IDS = ["melee", "ranged", "armor", "bag", "menu", "pot", "wok", "fryer", "board", "grillQuality", "potQuality", "seats", "lunchbox"] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];

export function isUpgradeId(v: unknown): v is UpgradeId {
  return typeof v === "string" && (UPGRADE_IDS as readonly string[]).includes(v);
}

// Cooking tools bought as upgrades, and the method each one brings.
export const TOOL_UPGRADES: Partial<Record<UpgradeId, Method>> = { pot: "boil", wok: "stirfry", fryer: "fry", board: "season" };
