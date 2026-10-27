import { applyAction } from "../../shared/actions";
import { claimAdCharcoal, isAdId } from "../../shared/ads";
import { RANKING, RANKING_TOP, rankEntry, sameRank, type RankEntry, type RankingView } from "../../shared/ranking";
import { readSave, type SaveData } from "../../shared/save";
import { grantPurchase } from "../../shared/shop";

// Monster BBQ game server. The whole save lives in the account's Global User State under SAVE_KEY and
// changes in one write under the account's lock (spec 7: no $asset, so currency and progress never
// half-apply). Every method is a public endpoint: arguments are the client's word and are checked by
// the shared rules.
const SAVE_KEY = "save";

// The power ranking (user 2026-10-21): one line per account in a Global Collection, written here from the
// save after it changed (never from the client's word). A module function, not a Server method, so no client
// can call it. Best effort: a failed write never fails the save; the next change or load writes it again.
async function writeRank(account: string, before: SaveData | null, after: SaveData): Promise<void> {
  const line = rankEntry(after);
  if (before && sameRank(rankEntry(before), line)) return;
  try {
    await $global.addCollectionItem(RANKING, { account, ...line, updatedAt: Date.now() }, { id: account });
  } catch {
    // the ranking is not currency (Verse8 docs): a missed line is only a stale one
  }
}

// What Verse8's ad verifier says of one rewarded ad (docs.verse8.io/ko/docs/ads/server-verification): watched
// to the end, not yet known, not watched, or unknown because the verifier could not be reached (the game
// server may have no fetch: Verse8 documents no outbound HTTP there yet). Read-only, so asking twice is safe.
type AdCheck = "verified" | "pending" | "rejected" | "unknown";
const AD_VERIFIER = "https://ads-verifier.verse8.io/ads/status?requestId=";
async function checkAd(requestId: string): Promise<AdCheck> {
  const get = (globalThis as { fetch?: (url: string) => Promise<{ status: number; json(): Promise<unknown> }> }).fetch;
  if (typeof get !== "function") return "unknown";
  try {
    const res = await get(AD_VERIFIER + encodeURIComponent(requestId));
    if (res.status === 202) return "pending";
    // an id the verifier has never seen was never shown
    if (res.status === 404) return "rejected";
    if (res.status !== 200) return "unknown";
    const body = (await res.json()) as { status?: unknown } | null;
    return body?.status === "verified" ? "verified" : body?.status === "pending" ? "pending" : "rejected";
  } catch {
    return "unknown";
  }
}

const asLine = (item: Record<string, unknown>): RankEntry => ({ name: typeof item.name === "string" ? item.name : "", power: Number(item.power) || 0, vip: Number(item.vip) || 0 });

export class Server {
  async load(): Promise<SaveData> {
    const state = await $global.getMyState();
    const save = readSave(state?.[SAVE_KEY]);
    // a returning player's line, written once a session (their power may predate the ranking)
    if (state?.[SAVE_KEY]) await writeRank($sender.account, null, save);
    return save;
  }

  async act(action: unknown): Promise<SaveData> {
    return $lock(`save:${$sender.account}`, async () => {
      const state = await $global.getMyState();
      const before = readSave(state?.[SAVE_KEY]);
      // the server alone decides the clock and the dice (hunt and service seeds, timing checks)
      const result = applyAction(before, action, { now: Date.now(), random: Math.random });
      if (result.error) throw new Error(result.error);
      await $global.updateMyState({ [SAVE_KEY]: result.save });
      await writeRank($sender.account, before, result.save);
      return result.save;
    });
  }

  // Golden charcoal for a rewarded ad (user 2026-10-27). The ad id is checked with Verse8's verifier; while
  // it is still pending the client asks again a moment later (no timers on the game server), and on its
  // `last` try, or where the verifier cannot be reached, the day's small cap is the only limit (user's
  // choice). One id pays once, under the save's lock (shared/ads.ts).
  async adCharcoal(requestId: unknown, last: unknown): Promise<{ status: "granted" | "pending"; save?: SaveData }> {
    if (!isAdId(requestId)) throw new Error("bad_ad");
    const check = await checkAd(requestId);
    if (check === "rejected") throw new Error("ad_not_watched");
    if (check === "pending" && last !== true) return { status: "pending" };
    return $lock(`save:${$sender.account}`, async () => {
      const state = await $global.getMyState();
      const before = readSave(state?.[SAVE_KEY]);
      const result = claimAdCharcoal(before, requestId, Date.now());
      if (result.error) throw new Error(result.error);
      await $global.updateMyState({ [SAVE_KEY]: result.save });
      return { status: "granted" as const, save: result.save };
    });
  }

  // The VX Shop's purchase webhook (Verse8 calls it; 06b-1): grants under the same lock as `act`, so a
  // purchase never lands between a read and a write of the same save. The same purchaseId twice grants
  // once (grantPurchase keeps the ids).
  async $onItemPurchased(p: { account: string; purchaseId: string; productId: string; quantity: number }): Promise<{ success: boolean }> {
    return $lock(`save:${p.account}`, async () => {
      const state = await $global.getUserState(p.account);
      const before = readSave(state?.[SAVE_KEY]);
      const r = grantPurchase(before, p);
      if (r.error) return { success: false };
      await $global.updateUserState(p.account, { [SAVE_KEY]: r.save });
      await writeRank(p.account, before, r.save);
      return { success: true };
    });
  }

  // The ranking's top lines (no accounts given out), the caller's own marked, and the caller's rank (1 + how
  // many have more power; ties share a rank). Reads only.
  async ranking(): Promise<RankingView> {
    const me = $sender.account;
    const items = (await $global.getCollectionItems(RANKING, { orderBy: [{ field: "power", direction: "desc" }], limit: RANKING_TOP })) as Record<string, unknown>[];
    const top = items.map((it) => ({ ...asLine(it), me: it.account === me }));
    const mineItem = ((await $global.getCollectionItems(RANKING, { filters: [{ field: "account", operator: "==", value: me }], limit: 1 })) as Record<string, unknown>[])[0];
    if (!mineItem) return { top, mine: null };
    const entry = asLine(mineItem);
    const above = await $global.countCollectionItems(RANKING, { filters: [{ field: "power", operator: ">", value: entry.power }] });
    return { top, mine: { rank: above + 1, entry } };
  }
}
