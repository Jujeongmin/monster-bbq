import { applyAction } from "../../shared/actions";
import { readSave, type SaveData } from "../../shared/save";

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
      // the server alone decides the clock and the dice (hunt seeds, timing checks)
      const result = applyAction(readSave(state?.[SAVE_KEY]), action, { now: Date.now(), random: Math.random });
      if (result.error) throw new Error(result.error);
      await $global.updateMyState({ [SAVE_KEY]: result.save });
      return result.save;
    });
  }
}
