import { BALANCE } from "./balance";
import { UPGRADE_IDS, type UpgradeId } from "./content/upgrades";
import type { SideWeaponId } from "./content/sideWeapons";
import type { ItemId } from "./content/items";
import type { SaveData } from "./save";
import { starLevel, starMul } from "./awaken";

// Upgrade levels (growth design 2): everything starts at level 1.
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
// Awakening stars (06b-1) multiply the knife's and harpoon's damage and divide what gets through the apron.
export function huntStats(save: Pick<SaveData, "upgrades"> & Partial<Pick<SaveData, "stars">>) {
  return {
    meleeDamage: Math.round(at(E.meleeDamage, level(save, "melee")) * starMul(starLevel(save, "melee"))),
    rangedDamage: Math.round(at(E.rangedDamage, level(save, "ranged")) * starMul(starLevel(save, "ranged"))),
    rangedRange: at(E.rangedRange, level(save, "ranged")),
    maxHp: at(E.maxHp, level(save, "tank")),
    damageTaken: at(E.damageTaken, level(save, "armor")) / starMul(starLevel(save, "armor")),
  };
}
export const bagSlots = (save: Pick<SaveData, "upgrades">) => at(E.bag, level(save, "bag"));
export const menuSlots = (save: Pick<SaveData, "upgrades">) => at(E.menu, level(save, "menu"));
// The night shop (plan 07b): stools at the counter, the straw shoes' pace, the charcoal each dish burns
// (% of the box, the big bin's level)
export const stools = (save: Pick<SaveData, "upgrades">) => at(E.seats, level(save, "seats"));
export const walkMul = (save: Pick<SaveData, "upgrades">) => at(E.shoes, level(save, "shoes"));
export const coalPerDish = (save: Pick<SaveData, "upgrades">) => at(BALANCE.service.charcoal.perDish, level(save, "coalBin"));
export const lunchSlots = (save: Pick<SaveData, "upgrades">) => at(E.lunch, level(save, "lunchbox"));

// Side weapons (hunt v3 design 4.4): owned from level 1; shots per hunt by level.
export const ownsSide = (save: Pick<SaveData, "upgrades">, id: SideWeaponId): boolean => level(save, id) >= 1;
export const ammoOf = (save: Pick<SaveData, "upgrades">, id: SideWeaponId): number => (ownsSide(save, id) ? at(E.ammo[id], level(save, id)) : 0);
export const sleepFallMs = (save: Pick<SaveData, "upgrades">): number => at(E.sleepFallMs, Math.max(1, level(save, "sleepGun")));

// The deep floors' materials the next level costs on top of its gold (plan 08c); none at the top.
export function nextMats(save: Pick<SaveData, "upgrades">, id: UpgradeId): { item: ItemId; n: number }[] {
  const lv = level(save, id);
  if (lv >= maxLevel(id)) return [];
  return BALANCE.upgrades[id].mats?.[lv - baseLevel(id)] ?? [];
}

// How far the lantern lights the cave (0 without one).
export const lightRadius = (save: Pick<SaveData, "upgrades">): number => (level(save, "lantern") >= 1 ? at(E.light, level(save, "lantern")) : 0);
