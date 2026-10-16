import { isItemId, ITEMS, parseItemKey, type ItemId } from "../../../shared/content/items";
import type { ServiceSummary } from "../../../shared/save";
import type { StringKey } from "../../i18n";

// What the day's screens show (Dave-style UI design): the time of day and whether the shared HUD is up,
// the bag's slots, which of Grandma's notebook's apps open, the night's receipt and how it plays out.

export type Phase = "hunt" | "lunch" | "kitchen" | "service" | "settle";
export type TimeOfDay = "morning" | "noon" | "afternoon" | "evening" | "night";

// The pictures the HUD uses, in one place: stand-ins until the drawn ones are approved (design 8).
export const HUD_ART = {
  time: { morning: "test/ui/icon_day.png", noon: "test/ui/icon_day.png", afternoon: "test/ui/icon_day.png", evening: "test/ui/icon_day.png", night: "test/ui/icon_day.png" } as Record<TimeOfDay, string>,
  bag: "test/items/icon_boar_belly.png",
  notebook: "test/ui/icon_notebook.png",
  apps: {
    bag: "test/items/icon_boar_belly.png",
    upgrade: "test/ui/upg_melee.png",
    awaken: "test/ui/icon_golden_charcoal.png",
    cookbook: "test/ui/icon_notebook.png",
    menu: "test/ui/icon_pot.png",
    shop: "test/ui/vip_badge.png",
  } as Record<App, string>,
  shopBg: "test/shop/bg.png",
};

// Setting out (no hunt yet) is the morning: the afternoon's window opens over the lunch screen.
export function timeOfDay(phase: Phase, huntPeriod: "morning" | "afternoon" | null): TimeOfDay {
  switch (phase) {
    case "hunt":
      return huntPeriod === "afternoon" ? "afternoon" : "morning";
    case "lunch":
      return "noon";
    case "kitchen":
      return "evening";
    default:
      return "night";
  }
}

// The hunt and the night's service carry their own HUD; the shared one would cover them.
export const showDayHud = (phase: Phase, hunting: boolean): boolean => !hunting && phase !== "service";

export type BagTab = "part" | "forage" | "material";
export const BAG_TABS: BagTab[] = ["part", "forage", "material"];
export interface BagCell {
  key: string;
  id: ItemId;
  premium: boolean;
  count: number;
}

// One tab of the bag: the item table's order, a part's premium stack before its normal one, nothing empty.
export function bagRows(items: Record<string, number>, tab: BagTab): BagCell[] {
  const order = Object.keys(ITEMS) as ItemId[];
  const cells: BagCell[] = [];
  for (const [key, count] of Object.entries(items)) {
    if (!(count > 0)) continue;
    const item = parseItemKey(key) ?? (isItemId(key) ? { id: key, grade: null } : null);
    if (!item || ITEMS[item.id].kind !== tab) continue;
    cells.push({ key, id: item.id, premium: item.grade === "premium", count });
  }
  return cells.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id) || Number(b.premium) - Number(a.premium));
}

export type App = "bag" | "upgrade" | "awaken" | "cookbook" | "menu" | "shop";
const APPS: App[] = ["bag", "upgrade", "awaken", "cookbook", "menu", "shop"];

// The notebook's apps (Dave's phone): the menu board is set only in the evening kitchen.
export function notebookApps(phase: Phase): { app: App; open: boolean }[] {
  return APPS.map((app) => ({ app, open: app !== "menu" || phase === "kitchen" }));
}

export interface ReceiptLine {
  key: StringKey;
  vars: Record<string, number | string>;
}

// The night's receipt: guests, then each kind of takings, the scrubbing (only if any; its gold is in the
// tips), the reputation. The total is what came in.
export function receiptLines(s: ServiceSummary, reputation: number): { lines: ReceiptLine[]; total: number } {
  const lines: ReceiptLine[] = [
    { key: "receipt.guests", vars: { served: s.served, left: s.left } },
    { key: "receipt.sales", vars: { gold: s.sales } },
    { key: "receipt.tips", vars: { gold: s.tips } },
    { key: "receipt.drinks", vars: { gold: s.drinks } },
  ];
  if (s.cleaned > 0) lines.push({ key: "receipt.cleaned", vars: { n: s.cleaned } });
  lines.push({ key: "receipt.rep", vars: { rep: reputation, delta: (s.repDelta >= 0 ? "+" : "") + s.repDelta } });
  return { lines, total: s.sales + s.tips + s.drinks };
}

export const RECEIPT = { lineMs: 250, rollMs: 800 };

// The receipt `ms` after it opened: lines come up one every lineMs, then the total rolls up over rollMs.
export function receiptAt(ms: number, lineCount: number, total: number): { shown: number; total: number; done: boolean } {
  const shown = Math.min(lineCount, Math.floor(ms / RECEIPT.lineMs));
  const roll = Math.max(0, Math.min(1, (ms - lineCount * RECEIPT.lineMs) / RECEIPT.rollMs));
  return { shown, total: Math.round(total * roll), done: roll >= 1 };
}
