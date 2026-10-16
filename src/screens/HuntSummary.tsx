import type { HuntEvent } from "../../shared/actions";
import { parseItemKey, type ItemId } from "../../shared/content/items";
import { starsOf } from "../../shared/hunt/stars";
import { artUrl } from "../game/art";
import { itemName, t } from "../i18n";

// Home from the hunt (hunt v3 design 5.2): what was taken, row by row by stars, and the parts that came
// home (the save's items after the server settled the hunt, against before); the den's key or a boss's
// notebook page when this hunt brought one (plan 08d).
export function HuntSummary({ events, ko, before, after, gotKey, gotPage, onShop, onDone }: { events: HuntEvent[]; ko: boolean; before: Record<string, number>; after: Record<string, number>; gotKey: boolean; gotPage: boolean; onShop: () => void; onDone: () => void }) {
  const counts = [3, 2, 1].map((n) => ({ n, count: events.filter((e) => "take" in e && starsOf(e.how) === n).length }));
  const gained = Object.entries(after)
    .map(([k, v]) => [k, v - (before[k] ?? 0)] as const)
    .filter(([, v]) => v > 0);
  return (
    <div className="dayflow-screen">
      <div className="ui-panel hunt-summary">
        <h2>{t("summary.title")}</h2>
        <ul className="summary-stars">
          {counts.map(({ n, count }) => (
            <li key={n}>
              <span className="summary-star">{"★".repeat(n)}</span>
              <span>{t(n === 3 ? "summary.three" : n === 2 ? "summary.two" : "summary.one", { n: count })}</span>
            </li>
          ))}
        </ul>
        <div className="summary-items">
          {gained.length === 0 && <span className="soft">{t("summary.nothing")}</span>}
          {gained.map(([k, v]) => {
            const item = parseItemKey(k);
            return (
              <span key={k} className={`summary-item${item?.grade === "premium" ? " premium" : ""}`} title={itemName(k)}>
                <img src={artUrl(`test/items/icon_${item?.id as ItemId}.png`)} alt="" />×{v}
              </span>
            );
          })}
        </div>
        {gotKey && <p className="summary-news">{t("summary.key")}</p>}
        {gotPage && <p className="summary-news">{t("summary.page")}</p>}
        {ko && <p className="summary-ko">{t("summary.ko")}</p>}
        <div className="dayflow-actions">
          <button className="ui-btn" onClick={onShop}>
            {t("shop.open")}
          </button>
          <button className="ui-btn" onClick={onDone}>
            {t("summary.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
