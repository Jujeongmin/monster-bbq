import { useState } from "react";
import type { Action } from "../../../shared/actions";
import { BALANCE } from "../../../shared/balance";
import { POSITION_STAT, POSITIONS, RARITIES, STAFF, STAFF_IDS, statOf, type Position, type StaffId } from "../../../shared/content/staff";
import { staffSlots } from "../../../shared/growth";
import type { SaveData } from "../../../shared/save";
import { staffAwakenCost } from "../../../shared/staff/actions";
import { artUrl, hasArt } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { knowsCharcoal } from "./hud";
import { PIP_COUNT, pipsOf } from "./pips";

// Grandma's old friends in her notebook (staff design 6): the friends who came (their stats, skill and
// line about Grandma, stars and shards, the position they work), and the postcards that call more — with
// the rates shown as the law asks and how far the sure legend is. Pictures stand in until approved.
type Tab = "friends" | "postcards";
// a friend's card portrait once approved and in (art/test/staff/<id>/portrait.png, 120x96)
const Face = ({ id }: { id: StaffId }) => (hasArt(`test/staff/${id}/portrait.png`) ? <img className="friend-face" src={artUrl(`test/staff/${id}/portrait.png`)} alt="" /> : null);
type Result = { id: StaffId; isNew: boolean; shards: number };

export function Friends({ save, busy, act, onShop, onClose }: { save: SaveData; busy: boolean; act: (a: Action) => Promise<SaveData | null>; onShop: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(Object.keys(save.staff.owned).length ? "friends" : "postcards");
  const [results, setResults] = useState<Result[] | null>(null);
  const [picked, setPicked] = useState<StaffId | null>(null);
  const st = save.staff;
  const knows = knowsCharcoal(save);

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

  return (
    <div className="dayflow-screen">
      <div className="upgrades friends" style={{ borderImageSource: `url(${artUrl("test/ui/hud/upgrade_board.png")})` }}>
        <div className="upgrade-tabs">
          {(["friends", "postcards"] as Tab[]).map((k) => (
            <button key={k} className={`ui-tab${k === tab ? " on" : ""}`} onClick={() => (setTab(k), setResults(null))}>
              {t(`friends.tab.${k}` as StringKey)}
            </button>
          ))}
        </div>
        {tab === "friends" ? (
          <FriendsTab save={save} busy={busy} act={act} picked={picked} onPick={setPicked} />
        ) : (
          <div className="friends-post">
            <p className="ui-plate friends-rates">
              {RARITIES.slice()
                .reverse()
                .map((r) => `${t(`staff.rarity.${r}` as StringKey)} ${Math.round(BALANCE.staff.rates[r] * 100)}%`)
                .join(" · ")}
              {" · "}
              {t("friends.pity", { n: BALANCE.staff.pity - st.sinceLegend })}
            </p>
            <div className="friends-buttons">
              {!st.freeUsed && (
                <button className="ui-btn" disabled={busy} onClick={() => void send(1, true)}>
                  {t("friends.free")}
                </button>
              )}
              {knows && (
                <>
                  <button className="ui-btn" disabled={busy || save.charcoal < BALANCE.staff.cost.one} onClick={() => void send(1)}>
                    {t("friends.one", { n: BALANCE.staff.cost.one })}
                  </button>
                  <button className="ui-btn" disabled={busy || save.charcoal < BALANCE.staff.cost.ten} onClick={() => void send(10)}>
                    {t("friends.ten", { n: BALANCE.staff.cost.ten })}
                  </button>
                  {save.charcoal < BALANCE.staff.cost.one && (
                    <button className="ui-btn" onClick={onShop}>
                      {t("awaken.getCharcoal")}
                    </button>
                  )}
                </>
              )}
            </div>
            {results && (
              <div className={`friends-results${results.length > 1 ? " many" : ""}`}>
                {results.map((r, i) => (
                  <div key={r.id} className={`ui-box friend-card result ${STAFF[r.id].rarity}`} style={{ animationDelay: `${i * 0.25}s` }}>
                    <Face id={r.id} />
                    <span className="friend-name">{t(`staff.name.${r.id}` as StringKey)}</span>
                    <span className="friend-rarity">{t(`staff.rarity.${STAFF[r.id].rarity}` as StringKey)}</span>
                    <span className="friend-new">{r.isNew ? t("friends.new") : t("friends.shards", { n: r.shards })}</span>
                    {r.isNew && results.length === 1 && <span className="friend-story">“{t(`staff.story.${r.id}` as StringKey)}”</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="dayflow-actions">
          <button className="ui-btn" onClick={onClose}>
            {t("upgrade.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

// The friends as Dave's staff window (user, 2026-10-20): how many work tonight, the friends down the left
// (face, name, where they work), the one picked on the right (portrait, a gauge per position, skill,
// awakening).
function FriendsTab({ save, busy, act, picked, onPick }: { save: SaveData; busy: boolean; act: (a: Action) => Promise<SaveData | null>; picked: StaffId | null; onPick: (id: StaffId) => void }) {
  const st = save.staff;
  const owned = STAFF_IDS.filter((id) => st.owned[id]);
  const posOf = (id: StaffId) => (Object.entries(st.roster).find(([, who]) => who === id)?.[0] ?? null) as Position | null;
  const id = picked && st.owned[picked] ? picked : (owned[0] ?? null);
  const mine = id ? st.owned[id]! : null;
  return (
    <>
      <span className="friends-slots">{t("friends.slots", { used: Object.keys(st.roster).length, max: staffSlots(save) })}</span>
      <div className="friends-body">
        <div className="friends-list">
          {owned.map((f) => {
            const at = posOf(f);
            return (
              <button key={f} className={`ui-box friend-item ${STAFF[f].rarity}${f === id ? " on" : ""}`} onClick={() => onPick(f)}>
                {hasArt(`test/staff/${f}/portrait.png`) ? <Face id={f} /> : <span />}
                <span className="friend-name">{t(`staff.name.${f}` as StringKey)}</span>
                <span className="friend-at">{at ? t(`staff.pos.${at}` as StringKey).split(" ")[0] : ""}</span>
              </button>
            );
          })}
          {owned.length < STAFF_IDS.length && <p className="friends-unmet">{t("friends.unmet", { n: STAFF_IDS.length - owned.length })}</p>}
        </div>
        {id && mine && <FriendDetail id={id} mine={mine} at={posOf(id)} save={save} busy={busy} act={act} />}
      </div>
    </>
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

// The picked friend: portrait and who they are on the left, and on the right how good they are at each
// position as a gauge (user, 2026-10-20) — tapping a position puts them there — with charm, which helps
// the whole night, under them; then the skill and awakening (their line about Grandma shows when they come).
function FriendDetail({ id, mine, at, save, busy, act }: { id: StaffId; mine: { stars: number; shards: number }; at: Position | null; save: SaveData; busy: boolean; act: (a: Action) => Promise<SaveData | null> }) {
  const cost = staffAwakenCost(mine.stars + 1);
  const best = POSITIONS.reduce((a, b) => (statOf(id, POSITION_STAT[b], mine.stars) > statOf(id, POSITION_STAT[a], mine.stars) ? b : a));
  return (
    <div className={`ui-box friend-detail ${STAFF[id].rarity}`}>
      <div className="friend-head">
        <span className="friend-who-big">
          <span className="friend-big">{hasArt(`test/staff/${id}/portrait.png`) && <img src={artUrl(`test/staff/${id}/portrait.png`)} alt="" />}</span>
          <span className="friend-name">{t(`staff.name.${id}` as StringKey)}</span>
          <span className="friend-rarity">
            {t(`staff.rarity.${STAFF[id].rarity}` as StringKey)} <span className="friend-stars">{"★".repeat(Math.min(5, mine.stars)) || "☆"}{mine.stars > 5 ? `+${mine.stars - 5}` : ""}</span>
          </span>
        </span>
        <span className="friend-gauges">
          {POSITIONS.map((p) => {
            const v = statOf(id, POSITION_STAT[p], mine.stars);
            return (
              <span key={p} className={`friend-gauge-row${p === best ? " best" : ""}`}>
                <button className={`ui-sq awaken-kind friend-pos-btn${at === p ? " on" : ""}`} disabled={busy} onClick={() => void act({ type: "assignStaff", position: p, staffId: at === p ? null : id })}>
                  {t(`staff.pos.${p}` as StringKey).split(" ")[0]}
                </button>
                <StatPips value={v} />
              </span>
            );
          })}
          <span className="friend-gauge-row charm">
            {/* charm is not a position: the same plate, nothing to press */}
            <span className="ui-sq awaken-kind friend-pos-btn friend-charm">{t("staff.stat.charm")}</span>
            <StatPips value={statOf(id, "charm", mine.stars)} />
          </span>
        </span>
      </div>
      <div className="friend-foot">
        <span className="friend-skill">{t(`staff.skill.${id}` as StringKey)}</span>
        <button className="ui-btn friend-awaken" disabled={busy || mine.shards < cost.shards || save.gold < cost.gold} onClick={() => void act({ type: "awakenStaff", staffId: id, from: mine.stars })}>
          {t("friends.awaken", { shards: cost.shards, have: mine.shards, gold: cost.gold })}
        </button>
      </div>
    </div>
  );
}
