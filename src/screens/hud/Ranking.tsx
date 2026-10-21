import { useEffect, useState } from "react";
import type { Action } from "../../../shared/actions";
import { BALANCE } from "../../../shared/balance";
import { powerOf } from "../../../shared/power";
import type { RankingView } from "../../../shared/ranking";
import { SHOP_NAME_MAX, type SaveData } from "../../../shared/save";
import { t } from "../../i18n";
import { BookWindow } from "./Book";

// The power ranking on the notebook's pages (user 2026-10-21): the top shops down the left page (rank,
// name, VIP, power); the player's own shop on the right: its name (named here the first time), its power
// in three parts, its rank, the next milestone's charcoal and how power grows. The server keeps the lines
// (shared/ranking.ts); this only reads them.
export function Ranking({ save, busy, load, act, onClose }: { save: SaveData; busy: boolean; load: () => Promise<RankingView>; act: (a: Action) => Promise<SaveData | null>; onClose: () => void }) {
  const [view, setView] = useState<RankingView | null>(null);
  const [failed, setFailed] = useState(false);
  const fetch = () => {
    setFailed(false);
    load().then(setView, () => setFailed(true));
  };
  // read again whenever the save changes (a new name, more power)
  useEffect(fetch, [save.shopName, save.charcoal, save.stars, save.staff, save.dishes, save.upgrades]);
  const [naming, setNaming] = useState(!save.shopName);
  const [name, setName] = useState(save.shopName);
  const p = powerOf(save);
  // the next milestone still ahead (one already reached is paid with the next change)
  const next = BALANCE.power.milestones.find((m) => m.at > p.total);
  const fmt = (n: number) => n.toLocaleString();
  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || [...trimmed].length > SHOP_NAME_MAX) return;
    if (await act({ type: "nameShop", name: trimmed })) setNaming(false);
  };

  return (
    <BookWindow
      label={t("rank.title")}
      onClose={onClose}
      left={
        <div className="book-detail rank-left">
          <h3 className="rank-title">{t("rank.title")}</h3>
          {failed ? (
            <p className="book-note">
              {t("rank.failed")}{" "}
              <button className="menu-item book-link" onClick={fetch}>
                {t("rank.retry")}
              </button>
            </p>
          ) : !view ? (
            <p className="book-note">{t("rank.loading")}</p>
          ) : (
            <ol className="book-list rank-list">
              {view.top.map((l, i) => (
                <li key={i} className={`rank-row${l.me ? " me" : ""}`}>
                  <span className="rank-no">{i + 1}</span>
                  <span className="rank-name">{l.name || t("rank.unnamed")}</span>
                  {l.vip > 0 && <span className="rank-vip">VIP {l.vip}</span>}
                  <span className="rank-power">{fmt(l.power)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      }
      right={
        <div className="book-detail rank-mine">
          {naming ? (
            <form className="rank-naming" onSubmit={(e) => (e.preventDefault(), void submit())}>
              <label htmlFor="shop-name">{t("rank.name")}</label>
              <input id="shop-name" className="ui-slot rank-input" value={name} maxLength={SHOP_NAME_MAX} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} autoComplete="off" />
              <button className="ui-btn" type="submit" disabled={busy || !name.trim()}>
                {t("rank.setName")}
              </button>
            </form>
          ) : (
            <h3 className="rank-shop">
              {save.shopName || t("rank.unnamed")}{" "}
              <button className="menu-item book-link" onClick={() => setNaming(true)}>
                {t("rank.rename")}
              </button>
            </h3>
          )}
          <p className="rank-total">
            {t("rank.power")} <b>{fmt(p.total)}</b>
            <span className="rank-place">{view?.mine ? t("rank.place", { n: view.mine.rank }) : t("rank.none")}</span>
          </p>
          <ul className="rank-parts">
            <li>
              {t("rank.gear")} <b>{fmt(p.gear)}</b>
            </li>
            <li>
              {t("rank.dishes")} <b>{fmt(p.dishes)}</b>
            </li>
            <li>
              {t("rank.staff")} <b>{fmt(p.staff)}</b>
            </li>
          </ul>
          <p className="rank-next">{next ? t("rank.next", { at: fmt(next.at), n: next.charcoal }) : t("rank.allDone")}</p>
          <p className="book-note">{t("rank.how")}</p>
        </div>
      }
    />
  );
}
