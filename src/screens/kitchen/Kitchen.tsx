import { useState } from "react";
import type { Action } from "../../../shared/actions";
import type { DishId } from "../../../shared/content/dishes";
import type { SaveData } from "../../../shared/save";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { Cookbook } from "./Cookbook";
import { LunchPick } from "./LunchPick";
import { MenuPick } from "./MenuPick";
import { Research } from "./Research";
import "./kitchen.css";

// The evening kitchen (spec 4): research new recipes, read the cookbook, pick tonight's menu. Every
// change goes through `act` (the server's rules); the screen shows what the save says. Layout (user,
// 2026-10-15): the cooking stage at 70% in the top left, day and gold with the four tabs in one row at the
// top right, the ready button at the bottom centre. The ready button sends the picked menu and opens the shop.
type Tab = "research" | "cookbook" | "menu" | "lunch";
const TABS: Tab[] = ["research", "cookbook", "menu", "lunch"];

export function Kitchen({
  save,
  busy,
  act,
  onReady,
}: {
  save: SaveData;
  busy: boolean;
  act: (a: Action) => void;
  onReady: (menu: DishId[]) => void;
}) {
  const [tab, setTab] = useState<Tab>("research");
  // starts from last night's menu, minus what can no longer go on it
  const [picked, setPicked] = useState<DishId[]>(() => save.menu.filter((id) => save.cookbook[id] && save.tools.includes(save.cookbook[id]!.method)));
  return (
    <div className="kitchen">
      <div className={`kitchen-body${tab === "research" ? " full" : ""}`}>
        {tab === "research" && <Research save={save} busy={busy} act={act} />}
        {tab === "cookbook" && <Cookbook save={save} />}
        {tab === "menu" && <MenuPick save={save} picked={picked} setPicked={setPicked} />}
        {tab === "lunch" && <LunchPick save={save} busy={busy} act={act} />}
      </div>
      <div className="kitchen-top">
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
      </div>
      <button className="ui-btn kitchen-ready" disabled={busy} onClick={() => onReady(picked)}>
        {t("kitchen.ready")}
      </button>
    </div>
  );
}
