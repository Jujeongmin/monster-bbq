import { useEffect, useState } from "react";
import type { SaveData } from "../../../shared/save";
import { t } from "../../i18n";
import { receiptAt, receiptLines } from "./hud";
import { Scene } from "./Scene";

// The night's receipt (Dave-style UI design 7): over the shop, the lines come up one by one and the total
// rolls up; a tap shows it all at once. Without a summary (an older save) only the day's end.
export function Receipt({ save, busy, onNext }: { save: SaveData; busy: boolean; onNext: () => void }) {
  const s = save.lastService;
  const r = s ? receiptLines(s, save.reputation) : { lines: [], total: 0 };
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      setMs((m) => (m === Infinity ? m : now - t0));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const at = receiptAt(ms, r.lines.length, r.total);
  return (
    <Scene>
      <div className="ui-panel receipt" onClick={() => setMs(Infinity)}>
        <h2>{t("receipt.title")}</h2>
        <p className="receipt-day">{t("settle.body", { day: save.day, gold: save.gold })}</p>
        <ul className="receipt-lines">
          {r.lines.slice(0, at.shown).map((l) => (
            <li key={l.key} className="receipt-line">
              {t(l.key, l.vars)}
            </li>
          ))}
        </ul>
        {s && <p className={`receipt-total${at.done ? " done" : ""}`}>{t("receipt.total", { gold: at.total.toLocaleString() })}</p>}
        {at.done || !s ? (
          <button className="ui-btn" disabled={busy} onClick={onNext}>
            {t("nextDay")}
          </button>
        ) : (
          <p className="receipt-skip">{t("receipt.skip")}</p>
        )}
      </div>
    </Scene>
  );
}
