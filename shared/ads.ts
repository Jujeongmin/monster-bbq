import { BALANCE } from "./balance";
import { AD_IDS_KEPT, type SaveData } from "./save";

// Rewarded ads (user 2026-10-27): golden charcoal for an ad watched in the shop, a few a day, and the hunt's
// revive (client only: a knock-out is the client's word anyway). The ad ids are Verse8's correlation ids,
// checked by the server against Verse8's verifier where it can reach it (server.ts); here only the rules
// that hold either way: an id pays once and a day pays BALANCE.ads.charcoalPerDay ads.

export const AD_PLACEMENT = { charcoal: "golden-charcoal", revive: "revive-hunter" } as const;

const DAY_MS = 86_400_000;
const KST_MS = 9 * 3_600_000;
// the Korean calendar day of a moment (ads reset at midnight in Korea)
export const kstDay = (now: number): number => Math.floor((now + KST_MS) / DAY_MS);

// a Verse8 ad id: a UUID, or at least something shaped like one
export const isAdId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v);

export function adCharcoalLeft(save: SaveData, now: number): number {
  const used = save.ads.day === kstDay(now) ? save.ads.count : 0;
  return Math.max(0, BALANCE.ads.charcoalPerDay - used);
}

export function claimAdCharcoal(save: SaveData, requestId: unknown, now: number): { save: SaveData; error?: string } {
  if (!isAdId(requestId)) return { save, error: "bad_ad" };
  if (save.ads.ids.includes(requestId)) return { save, error: "ad_claimed" };
  if (adCharcoalLeft(save, now) === 0) return { save, error: "ad_limit" };
  const day = kstDay(now);
  const count = (save.ads.day === day ? save.ads.count : 0) + 1;
  return { save: { ...save, charcoal: save.charcoal + BALANCE.ads.charcoal, ads: { day, count, ids: [...save.ads.ids, requestId].slice(-AD_IDS_KEPT) } } };
}
