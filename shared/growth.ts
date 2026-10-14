import { BALANCE } from "./balance";
import { UPGRADE_IDS, type UpgradeId } from "./content/upgrades";
import type { SaveData } from "./save";

// Upgrade levels (growth design 2): gear starts at level 1, cooking tools at 0 (not owned).
export { UPGRADE_IDS };
export type { UpgradeId };

export const baseLevel = (id: UpgradeId): number => BALANCE.upgrades[id].base;
export const maxLevel = (id: UpgradeId): number => baseLevel(id) + BALANCE.upgrades[id].costs.length;
export const level = (save: Pick<SaveData, "upgrades">, id: UpgradeId): number => save.upgrades[id] ?? baseLevel(id);

// The price of the next level, or null at the top.
export function nextCost(save: Pick<SaveData, "upgrades">, id: UpgradeId): number | null {
  const lv = level(save, id);
  return lv >= maxLevel(id) ? null : BALANCE.upgrades[id].costs[lv - baseLevel(id)];
}

// A level that needs something from later chapters (boss parts, story) cannot be bought yet.
export const isLocked = (save: Pick<SaveData, "upgrades">, id: UpgradeId): boolean => (BALANCE.upgrades[id].locked ?? []).includes(level(save, id) + 1);
