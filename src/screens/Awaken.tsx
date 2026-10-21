import type { Action } from "../../shared/actions";
import {
  AWAKEN_GEAR,
  awakenCost,
  canAwaken,
  MAX_STARS,
  sleepDartsFor,
  starLevel,
  starMul,
  type AwakenTarget,
} from "../../shared/awaken";
import { BALANCE } from "../../shared/balance";
import { DISHES, isDishId, type DishId } from "../../shared/content/dishes";
import { huntStats } from "../../shared/growth";
import { dishPrice } from "../../shared/kitchen/dish";
import type { SaveData } from "../../shared/save";
import { artUrl } from "../game/art";
import { t, type StringKey } from "../i18n";
import { knowsCharcoal } from "./hud/hud";
import { Price } from "./hud/Book";
import { sfx } from "../audio/sfx";

// The awakening tab of the upgrade book (06b-1 design 1): every target with its stars on the left page; on the
// right, the picked one's next star, its cost in gold and golden charcoal (red when short), and the way to
// the shop when the charcoal is short. Every star goes through the server (awaken, `from` = the star shown, so a double tap counts once).
const H = BALANCE.hunt;
const GEAR_ICON: Record<(typeof AWAKEN_GEAR)[number], string> = {
  melee: "test/ui/upg_melee.png",
  ranged: "test/ui/upg_ranged.png",
  armor: "test/ui/upg_armor.png",
  sling: "test/ui/side/sling.png",
  sleepGun: "test/ui/side/sleepGun.png",
  netGun: "test/ui/side/netGun.png",
  firecracker: "test/ui/side/firecracker.png",
};
const TARGETS: AwakenTarget[] = [
  ...AWAKEN_GEAR,
  ...(Object.keys(DISHES) as DishId[]),
];
const secs = (ms: number) => (ms / 1000).toFixed(1);

// "now -> next star" in words
function nextStar(save: SaveData, target: AwakenTarget, n: number): string {
  const up = { ...save, stars: { ...save.stars, [target]: n + 1 } };
  if (isDishId(target)) {
    const lv = save.dishes[target] ?? 1;
    return t("awaken.fx.price", {
      a: Math.round(dishPrice(target, lv) * starMul(n)),
      b: Math.round(dishPrice(target, lv) * starMul(n + 1)),
    });
  }
  switch (target) {
    case "melee":
      return t("awaken.fx.damage", {
        a: huntStats(save).meleeDamage,
        b: huntStats(up).meleeDamage,
      });
    case "ranged":
      return t("awaken.fx.damage", {
        a: huntStats(save).rangedDamage,
        b: huntStats(up).rangedDamage,
      });
    case "armor":
      return t("awaken.fx.taken", {
        a: Math.round(huntStats(save).damageTaken * 100),
        b: Math.round(huntStats(up).damageTaken * 100),
      });
    case "sling":
      return t("awaken.fx.damage", {
        a: Math.round(H.sling.damage * starMul(n)),
        b: Math.round(H.sling.damage * starMul(n + 1)),
      });
    case "sleepGun":
      return t("awaken.fx.darts", {
        a: sleepDartsFor("king", n),
        b: sleepDartsFor("king", n + 1),
      });
    case "netGun":
      return t("awaken.fx.hold", {
        a: secs(H.netBindMs * starMul(n)),
        b: secs(H.netBindMs * starMul(n + 1)),
      });
    case "firecracker":
      return t("awaken.fx.stun", {
        a: secs(H.firecracker.stunMs * starMul(n)),
        b: secs(H.firecracker.stunMs * starMul(n + 1)),
      });
  }
}

const nameOf = (target: AwakenTarget) => (isDishId(target) ? t(`dish.${target}` as StringKey) : t(`upgrade.${target}` as StringKey));
const iconOf = (target: AwakenTarget) => artUrl(isDishId(target) ? `test/dishes/${target}.png` : GEAR_ICON[target as (typeof AWAKEN_GEAR)[number]]);
export const awakenTargets = (kind: "gear" | "dish") => TARGETS.filter((target) => isDishId(target) === (kind === "dish"));

// The left page: gear or dishes, each with its stars.
export function AwakenList({ kind, onKind, picked, onPick, save }: { kind: "gear" | "dish"; onKind: (k: "gear" | "dish") => void; picked: AwakenTarget; onPick: (t: AwakenTarget) => void; save: SaveData }) {
  return (
    <>
      <div className="book-chips">
        {(["gear", "dish"] as const).map((k) => (
          <button key={k} className={`ui-sq awaken-kind${k === kind ? " on" : ""}`} onClick={() => onKind(k)}>
            {t(`awaken.kind.${k}` as StringKey)}
          </button>
        ))}
      </div>
      {!knowsCharcoal(save) && <p className="book-note">{t("awaken.charcoalWhere")}</p>}
      <div className="book-list">
        {awakenTargets(kind).map((target) => (
          <button key={target} className={`book-row${target === picked ? " on" : ""}${canAwaken(save, target) ? "" : " off"}`} onClick={() => onPick(target)}>
            <img src={iconOf(target)} alt="" />
            <span className="name">{nameOf(target)}</span>
            <span className="sub">★{starLevel(save, target)}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// The right page: the picked one, what its next star does and what it costs.
export function AwakenDetail({ target, save, busy, act, onShop }: { target: AwakenTarget; save: SaveData; busy: boolean; act: (a: Action) => void; onShop: () => void }) {
  const n = starLevel(save, target);
  const owned = canAwaken(save, target);
  const top = n >= MAX_STARS;
  const cost = top ? null : awakenCost(n + 1);
  const noGold = !!cost && save.gold < cost.gold;
  const noCharcoal = !!cost && save.charcoal < cost.charcoal;
  const knows = knowsCharcoal(save);
  return (
    <div className="book-detail">
      <div className="head">
        <img src={iconOf(target)} alt="" />
        <span>
          <h3>{nameOf(target)}</h3>
          <span className="soft">{t("awaken.stars", { n, max: MAX_STARS })}</span>
        </span>
      </div>
      {!owned ? (
        <p className="soft">{t("awaken.notYet")}</p>
      ) : top ? (
        <p className="fx">{t("upgrade.max")}</p>
      ) : (
        <>
          <p className="fx">{nextStar(save, target, n)}</p>
          <button className="ui-box buy-card" disabled={busy || noGold || noCharcoal} onClick={() => (cost!.gold > 0 && sfx.play("goldSpent"), act({ type: "awaken", target, from: n }))}>
            <Price gold={cost!.gold} charcoal={cost!.charcoal} haveGold={save.gold} haveCharcoal={save.charcoal} />
            {t("awaken.go")}
          </button>
          {noCharcoal && knows && (
            <button className="menu-item book-link" onClick={onShop}>
              {t("awaken.getCharcoal")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
