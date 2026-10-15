import { useState } from "react";
import type { Action } from "../../../shared/actions";
import type { DishId } from "../../../shared/content/dishes";
import { fitMenu, type MenuLine } from "../../../shared/kitchen/dish";
import type { SaveData } from "../../../shared/save";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { Cookbook } from "./Cookbook";
import { DishUpgrade } from "./DishUpgrade";
import { LunchPick } from "./LunchPick";
import { MenuPick } from "./MenuPick";
import "./kitchen.css";

// The evening kitchen (restaurant v2 design 5, mock-ups approved 2026-10-15): the shop behind, dimmed; the
// shop's name plate at the top left, day and gold at the top right, four tabs, the walnut frame with the
// cookbook / menu board / dish upgrades / lunchbox, and the open button at the bottom centre. Every change
// goes through `act` (the server's rules); the screen shows what the save says.
type Tab = "cookbook" | "menu" | "upgrade" | "lunch";
const TABS: Tab[] = ["cookbook", "menu", "upgrade", "lunch"];

export function Kitchen({
  save,
  busy,
  act,
  onReady,
}: {
  save: SaveData;
  busy: boolean;
  act: (a: Action) => void;
  onReady: (menu: MenuLine[]) => void;
}) {
  const [tab, setTab] = useState<Tab>("cookbook");
  // starts from last night's menu, cut to what the fridge makes now
  const [menu, setMenu] = useState<MenuLine[]>(() => fitMenu(save.items, save.dishes, save.menu));
  // the dish whose research was just asked for: the cut-in plays once the save has it (Task 8)
  const [asked, setAsked] = useState<DishId | null>(null);
  void asked;
  return (
    <div className="kitchen" style={{ backgroundImage: `url(${artUrl("test/shop/bg.png")})` }}>
      <div className="kitchen-dim" />
      <div className="ui-plate kitchen-title">{t("kitchen.title")}</div>
      <div className="ui-bar kitchen-res">
        <span>
          <img className="ui-icon" src={artUrl("test/ui/icon_day.png")} alt="" />
          {t("hud.day", { day: save.day })}
        </span>
        <span>
          <img className="ui-icon" src={artUrl("test/ui/icon_gold.png")} alt="" />
          {t("hud.gold", { gold: save.gold })}
        </span>
      </div>
      <div className="kitchen-tabs">
        {TABS.map((k) => (
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
      <button className="ui-btn kitchen-ready" disabled={busy || menu.length === 0} onClick={() => onReady(menu)}>
        {t("kitchen.ready")}
      </button>
    </div>
  );
}
