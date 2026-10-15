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

const E = BALANCE.growth;
const at = (table: number[], lv: number) => table[Math.max(0, Math.min(table.length - 1, lv - 1))];

// What the upgrades do, in one place: the hunt and kitchen screens and the server checks all ask here.
export function huntStats(save: Pick<SaveData, "upgrades">) {
  return {
    meleeDamage: at(E.meleeDamage, level(save, "melee")),
    rangedDamage: at(E.rangedDamage, level(save, "ranged")),
    rangedRange: at(E.rangedRange, level(save, "ranged")),
    maxHp: at(E.maxHp, level(save, "armor")),
  };
}
export const bagSlots = (save: Pick<SaveData, "upgrades">) => at(E.bag, level(save, "bag"));
export const menuSlots = (save: Pick<SaveData, "upgrades">) => at(E.menu, level(save, "menu"));
export const seatBonus = (save: Pick<SaveData, "upgrades">) => at(E.seats, level(save, "seats"));
export const lunchSlots = (save: Pick<SaveData, "upgrades">) => at(E.lunch, level(save, "lunchbox"));
// how forgiving a station is: burning and boiling over come this many times later
export const toolQuality = (save: Pick<SaveData, "upgrades">, method: "grill" | "boil") => at(E.quality, level(save, method === "grill" ? "grillQuality" : "potQuality"));
