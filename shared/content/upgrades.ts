// What gold can improve (growth design 2). Costs, locks and effects live in BALANCE.upgrades. The cooking
// tools and their quality went with hands-on cooking (restaurant v2); saves get that gold back
// (shared/save.ts refundRetired).
// The side weapons (hunt v3 design 4.4) are upgrades too: level 0 = not bought yet.
export const UPGRADE_IDS = ["melee", "ranged", "armor", "bag", "menu", "seats", "lunchbox", "sling", "sleepGun", "netGun", "firecracker", "boots", "lantern", "tank"] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];

export function isUpgradeId(v: unknown): v is UpgradeId {
  return typeof v === "string" && (UPGRADE_IDS as readonly string[]).includes(v);
}
