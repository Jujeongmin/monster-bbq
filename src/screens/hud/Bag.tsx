import { useEffect, useRef, useState } from "react";
import type { SaveData } from "../../../shared/save";
import { artUrl } from "../../game/art";
import { itemName, t, type StringKey } from "../../i18n";
import { ItemIcon } from "../kitchen/ItemIcon";
import { BAG_TABS, bagRows, HUD_ART, type BagTab } from "./hud";

// What the grandchild owns (Dave-style UI design 5): meat, forage and materials in slots, each with its
// count, a part's premium stack first; the slot pressed shows its name below. Laid out on an open bojagi
// cloth (the bag itself), the close button under it.
export function Bag({ save, shut = 0, onClose }: { save: SaveData; shut?: number; onClose: () => void }) {
  // closing folds the cloth back into its button, then calls back
  const [closing, setClosing] = useState(false);
  const close = () => setClosing(true);
  const first = useRef(shut);
  useEffect(() => {
    if (shut !== first.current) close();
  }, [shut]);
  const [tab, setTab] = useState<BagTab>("part");
  const [picked, setPicked] = useState<string | null>(null);
  const cells = bagRows(save.items, tab);
  const sel = cells.find((c) => c.key === picked);
  return (
    <div className={`hud-win bag-win${closing ? " closing" : ""}`} onClick={close}>
      <div className="bag" style={{ backgroundImage: `url(${artUrl(HUD_ART.bagCloth)})` }} role="dialog" aria-label={t("bag.title")} onClick={(e) => e.stopPropagation()} onAnimationEnd={(e) => e.target === e.currentTarget && closing && onClose()}>
        <div className="bag-tabs">
          {BAG_TABS.map((k) => (
            <button key={k} className={`ui-tab${k === tab ? " on" : ""}`} onClick={() => (setTab(k), setPicked(null))}>
              {t(`bag.tab.${k}` as StringKey)}
            </button>
          ))}
        </div>
        <div className="bag-grid">
          {cells.length === 0 && <span className="bag-empty">{t("bag.empty")}</span>}
          {cells.map((c, i) => (
            <button key={c.key} className={`ui-slot bag-cell${c.key === picked ? " on" : ""}`} style={{ "--i": i } as React.CSSProperties} onClick={() => setPicked(c.key)}>
              <ItemIcon itemKey={c.key} />
              <span className="bag-count">×{c.count}</span>
            </button>
          ))}
        </div>
        <p className="bag-info">{sel ? t("bag.info", { name: itemName(sel.key), n: sel.count }) : t("bag.hint")}</p>
        <button className="ui-btn bag-close" onClick={close}>
          {t("upgrade.close")}
        </button>
      </div>
    </div>
  );
}
