// The side weapon the hunter takes out (hunt v3 design 4.4): one per hunt, chosen before leaving, with a
// fixed number of shots for the whole hunt. The slingshot stuns, the sleep dart puts to sleep (★★★ when
// bagged), the net gun catches a small monster outright (★★★), the firecracker scatters and startles.
export const SIDE_WEAPONS = ["sling", "sleepGun", "netGun", "firecracker"] as const;
export type SideWeaponId = (typeof SIDE_WEAPONS)[number];

export function isSideWeaponId(v: unknown): v is SideWeaponId {
  return typeof v === "string" && (SIDE_WEAPONS as readonly string[]).includes(v);
}
