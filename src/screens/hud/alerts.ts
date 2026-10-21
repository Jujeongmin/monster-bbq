import { applyAction } from "../../../shared/actions";
import { AWAKEN_GEAR, starLevel } from "../../../shared/awaken";
import { DISHES } from "../../../shared/content/dishes";
import { STAFF_IDS } from "../../../shared/content/staff";
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

export function appAlerts(save: SaveData, opened: ReadonlySet<App>, phase: Phase): App[] {
  const fresh = (app: App) => !opened.has(app);
  const caught = Object.keys(save.items).length > 0 || save.seenItems.length > 0;
  const knows = knowsCharcoal(save);
  const due: Record<App, () => boolean> = {
    bag: () => caught && fresh("bag"),
    cookbook: () => caught && fresh("cookbook"),
    menu: () => fresh("menu"),
    shop: () => knows && fresh("shop"),
    upgrade: () => UPGRADE_IDS.some((id) => can(save, { type: "buyUpgrade", id })),
    awaken: () => knows && (fresh("awaken") || [...AWAKEN_GEAR, ...Object.keys(DISHES)].some((target) => can(save, { type: "awaken", target, from: starLevel(save, target as never) }))),
    friends: () => !save.staff.freeUsed || STAFF_IDS.some((id) => save.staff.owned[id] && can(save, { type: "awakenStaff", staffId: id, from: save.staff.owned[id]!.stars })),
  };
  return notebookApps(phase)
    .filter(({ app, open }) => open && due[app]())
    .map(({ app }) => app);
}
