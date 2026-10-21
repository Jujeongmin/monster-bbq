import { useEffect, useState } from "react";
import type { Action } from "../../../shared/actions";
import type { DishId } from "../../../shared/content/dishes";
import { canOpen, fitMenu, type MenuLine } from "../../../shared/kitchen/dish";
import type { SaveData } from "../../../shared/save";
import { t, type StringKey } from "../../i18n";
import { BookWindow } from "../hud/Book";
import { cookbookPages, lunchPages, menuPages, upgradePages } from "./KitchenPages";
import { ResearchCutIn } from "./ResearchCutIn";
import "./kitchen.css";

// Bandal's kitchen (restaurant v2 design 5) on Grandma's open notebook (user, 2026-10-21, like every window):
// four bookmarks — the cookbook, tonight's menu board, dish upgrades, the lunchbox — each a list on the left
// page and the picked dish, the board or the box on the right; under the book the close line, keeping the
// shop shut tonight, and the one red button that opens it. At lunch (hunt v3 design 3) only the lunchbox,
// with the afternoon's hunt as the red button.
export type KitchenTab = "cookbook" | "menu" | "upgrade" | "lunch";
type Tab = KitchenTab;
const TABS: Tab[] = ["cookbook", "menu", "upgrade", "lunch"];

export function Kitchen({
  mode = "evening",
  save,
  busy,
  act,
  onReady,
  onRest,
  onHunt,
  onSkip,
  tab: wanted,
  onTab,
  onClose,
}: {
  mode?: "evening" | "lunch";
  save: SaveData;
  busy: boolean;
  act: (a: Action) => void;
  onReady?: (menu: MenuLine[]) => void;
  // the evening: keep the shop shut tonight and go on to tomorrow
  onRest?: () => void;
  onHunt?: () => void;
  onSkip?: () => void;
  // the tab, when the page keeps it (Grandma's notebook turns to the cookbook or the menu board)
  tab?: Tab;
  onTab?: (t: Tab) => void;
  // opened from Bandal in the shop by day: back out to the shop
  onClose?: () => void;
}) {
  const tabs: Tab[] = mode === "lunch" ? ["lunch"] : TABS;
  const [own, setOwn] = useState<Tab>(mode === "lunch" ? "lunch" : "cookbook");
  const tab = mode === "lunch" ? "lunch" : (wanted ?? own);
  const setTab = (k: Tab) => (onTab ? onTab(k) : setOwn(k));
  // starts from last night's menu, cut to what the fridge makes now
  const [menu, setMenu] = useState<MenuLine[]>(() => fitMenu(save.items, save.dishes, save.menu));
  // research, upgrades and lunches use ingredients: the board shrinks to what the fridge still makes
  useEffect(() => setMenu((m) => fitMenu(save.items, save.dishes, m)), [save.items, save.dishes]);
  const [book, setBook] = useState<DishId>(() => (Object.keys(save.dishes)[0] as DishId) ?? "grilled_belly");
  const [upgrading, setUpgrading] = useState<DishId | null>(null);
  const [lunch, setLunch] = useState<DishId[]>([]);
  // the dish whose research was just asked for: the cut-in plays once the save has it
  const [asked, setAsked] = useState<DishId | null>(null);
  const landed = asked && save.dishes[asked] ? asked : null;
  const research = (d: DishId) => (setAsked(d), act({ type: "research", dish: d }));

  const pages =
    tab === "cookbook"
      ? cookbookPages(save, book, setBook, { busy, onResearch: research })
      : tab === "menu"
        ? menuPages(save, menu, setMenu)
        : tab === "upgrade"
          ? upgradePages(save, upgrading, setUpgrading, busy, act)
          : lunchPages(save, lunch, setLunch, busy, act);
  const foot =
    mode === "lunch" ? (
      <>
        <button className="menu-item" disabled={busy} onClick={onSkip}>{t("lunch.skip")}</button>
        <button className="ui-btn" disabled={busy} onClick={onHunt}>{t("lunch.goHunt")}</button>
      </>
    ) : (
      <>
        <button className="menu-item" disabled={busy} onClick={onRest}>{t("kitchen.rest")}</button>
        <button className="ui-btn kitchen-open" disabled={busy || !canOpen(save.items, save.dishes, menu)} onClick={() => onReady?.(menu)}>
          {t("kitchen.ready")}
        </button>
      </>
    );
  return (
    <>
      <BookWindow
        label={t(`kitchen.tab.${tab}` as StringKey)}
        tabs={tabs.map((k) => (
          <button key={k} className={`ui-tab${k === tab ? " on" : ""}`} onClick={() => setTab(k)}>
            {t(`kitchen.tab.${k}` as StringKey)}
          </button>
        ))}
        left={pages.left}
        right={pages.right}
        onClose={onClose}
        foot={foot}
      />
      {landed && <ResearchCutIn key={landed} dish={landed} onDone={() => setAsked(null)} />}
    </>
  );
}
