import { useEffect, useState } from "react";
import type { Action } from "../../../shared/actions";
import type { DishId } from "../../../shared/content/dishes";
import { canOpen, fitMenu, type MenuLine } from "../../../shared/kitchen/dish";
import type { SaveData } from "../../../shared/save";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { Cookbook } from "./Cookbook";
import { DishUpgrade } from "./DishUpgrade";
import { LunchPick } from "./LunchPick";
import { MenuPick } from "./MenuPick";
import { ResearchCutIn } from "./ResearchCutIn";
import "./kitchen.css";

// The evening kitchen (restaurant v2 design 5, mock-ups approved 2026-10-15): the shop behind, dimmed; the
// day's HUD over it (day, time, gold: Dave-style UI design 4), four tabs, the walnut frame with the
// cookbook / menu board / dish upgrades / lunchbox, and the open button at the bottom centre. Every change
// goes through `act` (the server's rules); the screen shows what the save says. At lunch (hunt v3 design 3)
// the same room shows only the lunchbox, the upgrades and the way back out to the afternoon hunt.
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
}) {
  const tabs: Tab[] = mode === "lunch" ? ["lunch"] : TABS;
  const [own, setOwn] = useState<Tab>(mode === "lunch" ? "lunch" : "cookbook");
  const tab = mode === "lunch" ? "lunch" : (wanted ?? own);
  const setTab = (k: Tab) => (onTab ? onTab(k) : setOwn(k));
  // starts from last night's menu, cut to what the fridge makes now
  const [menu, setMenu] = useState<MenuLine[]>(() => fitMenu(save.items, save.dishes, save.menu));
  // research, upgrades and lunches use ingredients: the board shrinks to what the fridge still makes
  useEffect(() => setMenu((m) => fitMenu(save.items, save.dishes, m)), [save.items, save.dishes]);
  // the dish whose research was just asked for: the cut-in plays once the save has it (Task 8)
  const [asked, setAsked] = useState<DishId | null>(null);
  // the cut-in plays once the server has opened the dish that was asked for
  const landed = asked && save.dishes[asked] ? asked : null;
  return (
    <div className="kitchen" style={{ backgroundImage: `url(${artUrl("test/shop/bg.png")})` }}>
      <div className="kitchen-dim" />
      <div className="kitchen-tabs">
        {tabs.map((k) => (
          <button key={k} className={`ui-tab${k === tab ? " on" : ""}`} onClick={() => setTab(k)}>
            {t(`kitchen.tab.${k}` as StringKey)}
          </button>
        ))}
      </div>
      <div className="ui-frame kitchen-body">
        {tab === "cookbook" && <Cookbook save={save} busy={busy} act={act} onResearch={setAsked} />}
        {tab === "menu" && <MenuPick save={save} menu={menu} setMenu={setMenu} />}
        {tab === "upgrade" && <DishUpgrade save={save} busy={busy} act={act} />}
        {tab === "lunch" && <LunchPick save={save} busy={busy} act={act} />}
      </div>
      {mode === "lunch" ? (
        <div className="kitchen-lunch-actions">
          <button className="ui-btn" disabled={busy} onClick={onSkip}>{t("lunch.skip")}</button>
          <button className="ui-btn" disabled={busy} onClick={onHunt}>{t("lunch.goHunt")}</button>
        </div>
      ) : (
        <div className="kitchen-lunch-actions">
          <button className="ui-btn" disabled={busy} onClick={onRest}>
            {t("kitchen.rest")}
          </button>
          <button className="ui-btn kitchen-open" disabled={busy || !canOpen(save.items, save.dishes, menu)} onClick={() => onReady?.(menu)}>
            {t("kitchen.ready")}
          </button>
        </div>
      )}
      {landed && <ResearchCutIn key={landed} dish={landed} onDone={() => setAsked(null)} />}
    </div>
  );
}
