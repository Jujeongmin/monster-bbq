import { useState } from "react";
import type { SaveData } from "../../../shared/save";
import { itemName, t, type StringKey } from "../../i18n";
import { ItemIcon } from "../kitchen/ItemIcon";
import { BAG_TABS, bagRows, type BagTab } from "./hud";

// What the grandchild owns (Dave-style UI design 5): meat, forage and materials in slots, each with its
// count, a part's premium stack first; the slot pressed shows its name below.
export function Bag({ save, onClose }: { save: SaveData; onClose: () => void }) {
  const [tab, setTab] = useState<BagTab>("part");
  const [picked, setPicked] = useState<string | null>(null);
  const cells = bagRows(save.items, tab);
  const sel = cells.find((c) => c.key === picked);
  return (
    <div className="hud-win" onClick={onClose}>
      <div className="ui-panel bag" onClick={(e) => e.stopPropagation()}>
        <h2>{t("bag.title")}</h2>
        <div className="bag-tabs">
          {BAG_TABS.map((k) => (
            <button key={k} className={`ui-tab${k === tab ? " on" : ""}`} onClick={() => (setTab(k), setPicked(null))}>
              {t(`bag.tab.${k}` as StringKey)}
            </button>
          ))}
        </div>
        <div className="ui-frame bag-grid">
          {cells.length === 0 && <span className="bag-empty">{t("bag.empty")}</span>}
          {cells.map((c, i) => (
            <button key={c.key} className={`ui-slot bag-cell${c.key === picked ? " on" : ""}`} style={{ "--i": i } as React.CSSProperties} onClick={() => setPicked(c.key)}>
              <ItemIcon itemKey={c.key} />
              <span className="bag-count">×{c.count}</span>
            </button>
          ))}
        </div>
        <p className="bag-info">{sel ? t("bag.info", { name: itemName(sel.key), n: sel.count }) : t("bag.hint")}</p>
        <button className="ui-btn" onClick={onClose}>
          {t("upgrade.close")}
        </button>
      </div>
    </div>
  );
}
