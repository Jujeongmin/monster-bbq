import { applyAction } from "../../shared/actions";
import { readSave, type SaveData } from "../../shared/save";
import { grantPurchase } from "../../shared/shop";

// Monster BBQ game server. The whole save lives in the account's Global User State under SAVE_KEY and
// changes in one write under the account's lock (spec 7: no $asset, so currency and progress never
// half-apply). Every method is a public endpoint: arguments are the client's word and are checked by
// the shared rules.
const SAVE_KEY = "save";

export class Server {
  async load(): Promise<SaveData> {
    const state = await $global.getMyState();
    return readSave(state?.[SAVE_KEY]);
  }

  async act(action: unknown): Promise<SaveData> {
    return $lock(`save:${$sender.account}`, async () => {
      const state = await $global.getMyState();
      // the server alone decides the clock and the dice (hunt and service seeds, timing checks)
      const result = applyAction(readSave(state?.[SAVE_KEY]), action, { now: Date.now(), random: Math.random });
      if (result.error) throw new Error(result.error);
      await $global.updateMyState({ [SAVE_KEY]: result.save });
      return result.save;
    });
  }

  // The VX Shop's purchase webhook (Verse8 calls it; 06b-1): grants under the same lock as `act`, so a
  // purchase never lands between a read and a write of the same save. The same purchaseId twice grants
  // once (grantPurchase keeps the ids).
  async $onItemPurchased(p: { account: string; purchaseId: string; productId: string; quantity: number }): Promise<{ success: boolean }> {
    return $lock(`save:${p.account}`, async () => {
      const state = await $global.getUserState(p.account);
      const r = grantPurchase(readSave(state?.[SAVE_KEY]), p);
      if (r.error) return { success: false };
      await $global.updateUserState(p.account, { [SAVE_KEY]: r.save });
      return { success: true };
    });
  }
}
