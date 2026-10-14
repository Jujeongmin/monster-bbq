import { useState } from "react";
import type { Action } from "../../../shared/actions";
import type { SaveData } from "../../../shared/save";
import { t, type StringKey } from "../../i18n";
import { Research } from "./Research";
import "./kitchen.css";

// The evening kitchen (spec 4): research new recipes, read the cookbook, pick tonight's menu. Every
// change goes through `act` (the server's rules); the screen shows what the save says.
type Tab = "research" | "cookbook" | "menu";
const TABS: Tab[] = ["research", "cookbook", "menu"];

export function Kitchen({ save, busy, act, onReady }: { save: SaveData; busy: boolean; act: (a: Action) => void; onReady: () => void }) {
  const [tab, setTab] = useState<Tab>("research");
  return (
    <div className="kitchen">
      <div className="kitchen-tabs">
        {TABS.map((k) => (
          <button key={k} className={k === tab ? "on" : ""} onClick={() => setTab(k)}>
            {t(`kitchen.tab.${k}` as StringKey)}
          </button>
        ))}
        <button className="kitchen-ready" disabled={busy} onClick={onReady}>
          {t("next")}
        </button>
      </div>
      <div className="kitchen-body">{tab === "research" && <Research save={save} busy={busy} act={act} />}</div>
    </div>
  );
}
