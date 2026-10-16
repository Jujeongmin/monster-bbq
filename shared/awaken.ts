import { BALANCE } from "./balance";
import { isDishId, type DishId } from "./content/dishes";
import type { MonsterId } from "./content/monsters";
import { isSideWeaponId, type SideWeaponId } from "./content/sideWeapons";
import type { SaveData } from "./save";

// Awakening (06b-1 design 1): hunting gear and dishes take stars 1-20, each multiplying what they do
// by 1.1. Gold and a little charcoal up to star 10, charcoal alone after: the paid growth.
const A = BALANCE.awaken;
export const AWAKEN_GEAR = ["melee", "ranged", "armor", "sling", "sleepGun", "netGun", "firecracker"] as const;
export type AwakenTarget = (typeof AWAKEN_GEAR)[number] | DishId;
export const MAX_STARS = A.charcoal.length;

export const isAwakenTarget = (v: unknown): v is AwakenTarget => (AWAKEN_GEAR as readonly unknown[]).includes(v) || isDishId(v);
export const starLevel = (save: Partial<Pick<SaveData, "stars">>, t: AwakenTarget): number => save.stars?.[t] ?? 0;
export const starMul = (stars: number): number => A.mul ** stars;

// What reaching `toStar` (1..MAX_STARS) costs.
export function awakenCost(toStar: number): { gold: number; charcoal: number } {
  return { gold: toStar <= A.goldUntil ? A.goldPerStarSq * toStar * toStar : 0, charcoal: A.charcoal[toStar - 1] };
}

// Side weapons only once bought, dishes only once researched; the knife, harpoon and apron always.
// (Reads the upgrade level itself: shared/growth imports this file for the stars' effects.)
export function canAwaken(save: Pick<SaveData, "upgrades" | "dishes">, t: AwakenTarget): boolean {
  if (isDishId(t)) return (save.dishes[t] ?? 0) >= 1;
  if (isSideWeaponId(t)) return (save.upgrades[t] ?? BALANCE.upgrades[t].base) >= 1;
  return true;
}

// How much an awakened side weapon does: the slingshot's damage, the firecracker's stun, the net's hold
// (all × this); the sleep gun's darts per monster go down by it (sleepDartsFor).
export const sidePower = (save: Partial<Pick<SaveData, "stars">>, side: SideWeaponId): number => starMul(starLevel(save, side));
export const sleepDartsFor = (monster: MonsterId, sleepStars: number): number => Math.ceil(BALANCE.hunt.sleepHits[monster] / starMul(sleepStars));
