import { useEffect, useState } from "react";
import type { SaveData } from "../../../shared/save";
import { artUrl, hasArt } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { MenuLine } from "./Book";
import { HUD_ART, RECEIPT, receiptAt, receiptLines } from "./hud";
import { Scene } from "./Scene";

// The night's receipt (Dave-style UI design 7): over the shop, the lines come up one by one and the total
// rolls up; a tap shows it all at once. Without a summary (an older save) only the day's end.
export function Receipt({ save, busy, onNext }: { save: SaveData; busy: boolean; onNext: () => void }) {
  const s = save.lastService;
  const r = s ? receiptLines(s, save.reputation) : { lines: [], total: 0 };
  const [ms, setMs] = useState(0);
  // the clock runs only until the receipt is all out (or tapped)
  const endMs = RECEIPT.lineMs * r.lines.length + RECEIPT.rollMs;
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = now - t0;
      setMs((m) => (m === Infinity ? m : t));
      if (t < endMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endMs]);
  const at = receiptAt(ms, r.lines.length, r.total);
  // the drawn receipt paper once it is in, else the card frame
  const paper = hasArt(HUD_ART.receipt);
  return (
    <Scene>
      <div className={paper ? "receipt receipt-paper" : "ui-panel receipt"} style={paper ? { borderImageSource: `url(${artUrl(HUD_ART.receipt)})` } : undefined} onClick={() => setMs(Infinity)}>
        <h2>{t("receipt.title")}</h2>
        <p className="receipt-day">{t("settle.body", { day: save.day, gold: save.gold })}</p>
        <ul className="receipt-lines">
          {r.lines.slice(0, at.shown).map((l) => (
            <li key={l.dish ?? l.key} className={`receipt-line${l.dish ? " receipt-dish" : ""}`}>
              {l.dish && <img src={artUrl(hasArt(`test/shop/dishes/${l.dish}.png`) ? `test/shop/dishes/${l.dish}.png` : `test/dishes/${l.dish}.png`)} alt="" />}
              {t(l.key, l.dish ? { ...l.vars, name: t(`dish.${l.dish}` as StringKey) } : l.vars)}
            </li>
          ))}
        </ul>
        {s && <p className={`receipt-total${at.done ? " done" : ""}`}>{t("receipt.total", { gold: at.total.toLocaleString() })}</p>}
        {at.done || !s ? (
          <MenuLine className="ink" label={t("nextDay")} onPress={() => !busy && onNext()} />
        ) : (
          <p className="receipt-skip">{t("receipt.skip")}</p>
        )}
      </div>
    </Scene>
  );
}
