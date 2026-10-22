import { applyAction } from "../../../shared/actions";
import { AWAKEN_GEAR, starLevel, type AwakenTarget } from "../../../shared/awaken";
import { DISHES } from "../../../shared/content/dishes";
import { STAFF_IDS, type StaffId } from "../../../shared/content/staff";
import type { UpgradeId } from "../../../shared/content/upgrades";
import { UPGRADE_IDS } from "../../../shared/growth";
import type { SaveData } from "../../../shared/save";
import { knowsCharcoal, notebookApps, type App, type Phase } from "./hud";

// The notebook's ! marks (user, 2026-10-21: explanations A+C): an app that has become worth opening and
// was never opened (the bag and the cookbook after the first catch, awakening and the shop once the golden
// charcoal is known, the menu board in the evening kitchen), or one with something to do in it now (an
// upgrade the gold covers, something to awaken, the free postcard). Nothing on a fresh save but the free
// postcard, so the first day is not covered in marks. Whether a thing can be done is asked of the same
// rules the server keeps (applyAction on a copy), so a mark never promises what the server refuses.
const can = (save: SaveData, action: unknown) => !applyAction(save, action, { now: Date.now(), random: () => 0.5 }).error;

// What a mark inside an app points at (user, 2026-10-22: "!" on the notebook, then nothing inside said
// what it was): the upgrade that can be bought now, the gear or dish that can be awakened now, the old
// friend who can be awakened now. The app's own ! comes from the same questions.
export const upgradeDue = (save: SaveData, id: UpgradeId): boolean => can(save, { type: "buyUpgrade", id });
export const awakenDue = (save: SaveData, target: AwakenTarget): boolean => can(save, { type: "awaken", target, from: starLevel(save, target) });
export const staffDue = (save: SaveData, id: StaffId): boolean => {
  const mine = save.staff.owned[id];
  return !!mine && can(save, { type: "awakenStaff", staffId: id, from: mine.stars });
};

export function appAlerts(save: SaveData, opened: ReadonlySet<App>, phase: Phase): App[] {
  const fresh = (app: App) => !opened.has(app);
  const caught = Object.keys(save.items).length > 0 || save.seenItems.length > 0;
  const knows = knowsCharcoal(save);
  const due: Record<App, () => boolean> = {
    bag: () => caught && fresh("bag"),
    cookbook: () => caught && fresh("cookbook"),
    menu: () => fresh("menu"),
    shop: () => knows && fresh("shop"),
    // the ranking from the second day (the first day is the tutorial's)
    ranking: () => save.day >= 2 && fresh("ranking"),
    upgrade: () => UPGRADE_IDS.some((id) => upgradeDue(save, id)),
    awaken: () => knows && (fresh("awaken") || [...AWAKEN_GEAR, ...(Object.keys(DISHES) as AwakenTarget[])].some((target) => awakenDue(save, target))),
    friends: () => !save.staff.freeUsed || STAFF_IDS.some((id) => staffDue(save, id)),
  };
  return notebookApps(phase)
    .filter(({ app, open }) => open && due[app]())
    .map(({ app }) => app);
}
