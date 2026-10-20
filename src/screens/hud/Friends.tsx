import { useState } from "react";
import type { Action } from "../../../shared/actions";
import { BALANCE } from "../../../shared/balance";
import { POSITION_STAT, POSITIONS, RARITIES, STAFF, STAFF_IDS, statOf, type Position, type StaffId } from "../../../shared/content/staff";
import { staffSlots } from "../../../shared/growth";
import type { SaveData } from "../../../shared/save";
import { staffAwakenCost } from "../../../shared/staff/actions";
import { artUrl, hasArt } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { BookWindow, BuyCard, Price } from "./Book";
import { knowsCharcoal } from "./hud";
import { PIP_COUNT, pipsOf } from "./pips";

// Grandma's old friends in her notebook (staff design 6), on the notebook's two pages (user, 2026-10-20):
// the friends down the left page and the one picked on the right; the postcards with their rates (shown as
// the law asks) and how far the sure legend is on the left, sending them and what came on the right.
type Tab = "friends" | "postcards";
type Result = { id: StaffId; isNew: boolean; shards: number };
const portrait = (id: StaffId) => `test/staff/${id}/portrait.png`;
const Face = ({ id, className = "" }: { id: StaffId; className?: string }) => (hasArt(portrait(id)) ? <img className={className} src={artUrl(portrait(id))} alt="" /> : <span className={className} />);
const stars = (n: number) => ("★".repeat(Math.min(5, n)) || "☆") + (n > 5 ? `+${n - 5}` : "");

export function Friends({ save, busy, act, onShop, onClose }: { save: SaveData; busy: boolean; act: (a: Action) => Promise<SaveData | null>; onShop: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(Object.keys(save.staff.owned).length ? "friends" : "postcards");
  const [results, setResults] = useState<Result[] | null>(null);
  const [picked, setPicked] = useState<StaffId | null>(null);
  const st = save.staff;

  async function send(count: 1 | 10, free = false) {
    const before = st.owned;
    const next = await act({ type: "summon", count, free, pullId: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}` });
    if (!next) return;
    const out: Result[] = [];
    for (const id of STAFF_IDS) {
      const a = before[id];
      const b = next.staff.owned[id];
      if (b && !a) out.push({ id, isNew: true, shards: b.shards });
      else if (a && b && b.shards > a.shards) out.push({ id, isNew: false, shards: b.shards - a.shards });
    }
    setResults(out);
  }

  const tabs = (["friends", "postcards"] as Tab[]).map((k) => (
    <button key={k} className={`ui-tab${k === tab ? " on" : ""}`} onClick={() => (setTab(k), setResults(null))}>
      {t(`friends.tab.${k}` as StringKey)}
    </button>
  ));
  const owned = STAFF_IDS.filter((id) => st.owned[id]);
  const posOf = (id: StaffId) => (Object.entries(st.roster).find(([, who]) => who === id)?.[0] ?? null) as Position | null;
  const id = picked && st.owned[picked] ? picked : (owned[0] ?? null);

  if (tab === "postcards")
    return (
      <BookWindow
        label={t("friends.tab.postcards")}
        tabs={tabs}
        onClose={onClose}
        left={<PostcardRates save={save} />}
        right={results ? <PostcardResults results={results} onAgain={() => setResults(null)} /> : <PostcardSend save={save} busy={busy} onSend={send} onShop={onShop} />}
      />
    );

  return (
    <BookWindow
      label={t("notebook.app.friends")}
      tabs={tabs}
      onClose={onClose}
      left={
        <>
          <p className="book-note">{t("friends.slots", { used: Object.keys(st.roster).length, max: staffSlots(save) })}</p>
          <div className="book-list">
            {owned.map((f) => {
              const at = posOf(f);
              return (
                <button key={f} className={`book-row friend-row ${STAFF[f].rarity}${f === id ? " on" : ""}`} onClick={() => setPicked(f)}>
                  <Face id={f} className="row-face" />
                  <span className="name">{t(`staff.name.${f}` as StringKey)}</span>
                  <span className="sub">{at ? t(`staff.pos.${at}` as StringKey).split(" ")[0] : ""}</span>
                </button>
              );
            })}
          </div>
          {owned.length < STAFF_IDS.length && <p className="book-note">{t("friends.unmet", { n: STAFF_IDS.length - owned.length })}</p>}
        </>
      }
      right={id ? <FriendDetail id={id} mine={st.owned[id]!} at={posOf(id)} save={save} busy={busy} act={act} /> : <p className="book-note">{t("friends.none")}</p>}
    />
  );
}

// A stat as ten cells that fill one at a time (user, 2026-10-20), no number (pips.ts). Cells: art/test/ui/pip_*.png.
function StatPips({ value }: { value: number }) {
  const n = pipsOf(value);
  return (
    <span className="friend-pips">
      {Array.from({ length: PIP_COUNT }, (_, i) => (
        <img key={i} src={artUrl(`test/ui/pip_${i < n ? "full" : "empty"}.png`)} alt="" />
      ))}
    </span>
  );
}

// The picked friend: portrait, name, rarity and stars; how good they are at each position (pressing the
// position puts them there), charm (the whole night) under them; the skill; awakening.
function FriendDetail({ id, mine, at, save, busy, act }: { id: StaffId; mine: { stars: number; shards: number }; at: Position | null; save: SaveData; busy: boolean; act: (a: Action) => Promise<SaveData | null> }) {
  const cost = staffAwakenCost(mine.stars + 1);
  const best = POSITIONS.reduce((a, b) => (statOf(id, POSITION_STAT[b], mine.stars) > statOf(id, POSITION_STAT[a], mine.stars) ? b : a));
  return (
    <div className={`book-detail friend-detail ${STAFF[id].rarity}`}>
      <div className="head">
        <Face id={id} className="detail-face" />
        <span>
          <h3>{t(`staff.name.${id}` as StringKey)}</h3>
          <span className="friend-rarity">{t(`staff.rarity.${STAFF[id].rarity}` as StringKey)}</span> <span className="friend-stars">{stars(mine.stars)}</span>
        </span>
      </div>
      <span className="friend-gauges">
        {POSITIONS.map((p) => (
          <span key={p} className={`friend-gauge-row${p === best ? " best" : ""}`}>
            <button className={`ui-sq awaken-kind friend-pos-btn${at === p ? " on" : ""}`} disabled={busy} onClick={() => void act({ type: "assignStaff", position: p, staffId: at === p ? null : id })}>
              {t(`staff.pos.${p}` as StringKey).split(" ")[0]}
            </button>
            <StatPips value={statOf(id, POSITION_STAT[p], mine.stars)} />
          </span>
        ))}
        <span className="friend-gauge-row charm">
          {/* charm is not a position: the same plate, nothing to press */}
          <span className="ui-sq awaken-kind friend-pos-btn friend-charm">{t("staff.stat.charm")}</span>
          <StatPips value={statOf(id, "charm", mine.stars)} />
        </span>
      </span>
      <span className="friend-skill">{t(`staff.skill.${id}` as StringKey)}</span>
      <BuyCard disabled={busy || mine.shards < cost.shards || save.gold < cost.gold} onClick={() => void act({ type: "awakenStaff", staffId: id, from: mine.stars })}>
        <Price gold={cost.gold} haveGold={save.gold} haveCharcoal={save.charcoal} />
        <span className={mine.shards < cost.shards ? "short" : ""}>{t("friends.shardsNeed", { have: mine.shards, need: cost.shards })}</span>
        {t("awaken.go")}
      </BuyCard>
    </div>
  );
}

// The postcards' left page: each rarity's chance in its own colour, and how many more to a sure legend.
function PostcardRates({ save }: { save: SaveData }) {
  return (
    <div className="book-detail">
      <h3>{t("friends.ratesTitle")}</h3>
      <ul className="post-rates">
        {RARITIES.slice()
          .reverse()
          .map((r) => (
            <li key={r} className={r}>
              <span>{t(`staff.rarity.${r}` as StringKey)}</span>
              <b>{Math.round(BALANCE.staff.rates[r] * 100)}%</b>
            </li>
          ))}
      </ul>
      <p className="fx">{t("friends.pity", { n: BALANCE.staff.pity - save.staff.sinceLegend })}</p>
      <p className="book-note">{t("friends.tenHero")}</p>
    </div>
  );
}

// The right page: the one free postcard, one, or ten (the main action, red).
function PostcardSend({ save, busy, onSend, onShop }: { save: SaveData; busy: boolean; onSend: (count: 1 | 10, free?: boolean) => void; onShop: () => void }) {
  const st = save.staff;
  const knows = knowsCharcoal(save);
  const C = BALANCE.staff.cost;
  return (
    <div className="book-detail post-send">
      <h3>{t("friends.sendTitle")}</h3>
      {!st.freeUsed && (
        <BuyCard disabled={busy} onClick={() => onSend(1, true)}>
          {t("friends.free")}
        </BuyCard>
      )}
      {knows ? (
        <>
          <BuyCard disabled={busy || save.charcoal < C.one} onClick={() => onSend(1)}>
            <Price charcoal={C.one} haveGold={save.gold} haveCharcoal={save.charcoal} />
            {t("friends.oneShort")}
          </BuyCard>
          <button className="ui-btn post-ten" disabled={busy || save.charcoal < C.ten} onClick={() => onSend(10)}>
            {t("friends.tenShort", { n: C.ten })}
          </button>
          {save.charcoal < C.one && (
            <button className="menu-item book-link" onClick={onShop}>
              {t("awaken.getCharcoal")}
            </button>
          )}
        </>
      ) : (
        st.freeUsed && <p className="book-note">{t("awaken.charcoalWhere")}</p>
      )}
    </div>
  );
}

// What came: each friend once (doubles counted as shards), the new ones first.
function PostcardResults({ results, onAgain }: { results: Result[]; onAgain: () => void }) {
  const sorted = [...results].sort((a, b) => Number(b.isNew) - Number(a.isNew));
  return (
    <div className="book-detail">
      <div className="post-results">
        {sorted.map((r, i) => (
          <div key={r.id} className={`post-card ${STAFF[r.id].rarity}`} style={{ animationDelay: `${i * 0.12}s` }}>
            <Face id={r.id} className="row-face" />
            <span className="name">{t(`staff.name.${r.id}` as StringKey)}</span>
            <span className={r.isNew ? "new" : "sub"}>{r.isNew ? t("friends.new") : t("friends.shards", { n: r.shards })}</span>
          </div>
        ))}
      </div>
      <button className="menu-item book-link" onClick={onAgain}>
        {t("friends.again")}
      </button>
    </div>
  );
}
