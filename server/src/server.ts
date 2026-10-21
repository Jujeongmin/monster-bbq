import { applyAction } from "../../shared/actions";
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
