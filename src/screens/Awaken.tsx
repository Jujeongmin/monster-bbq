import type { Action } from "../../shared/actions";
import { AWAKEN_GEAR, awakenCost, canAwaken, MAX_STARS, sleepDartsFor, starLevel, starMul, type AwakenTarget } from "../../shared/awaken";
import { BALANCE } from "../../shared/balance";
import { DISHES, isDishId, type DishId } from "../../shared/content/dishes";
import { huntStats } from "../../shared/growth";
import { dishPrice } from "../../shared/kitchen/dish";
import type { SaveData } from "../../shared/save";
import { artUrl } from "../game/art";
import { t, type StringKey } from "../i18n";

// The awakening tab of the upgrade screen (06b-1 design 1): every target with its stars, what the next star
// does, its cost in gold and golden charcoal (red when short), and the way to the shop when the charcoal
// is short. Every star goes through the server (awaken, `from` = the star shown, so a double tap counts once).
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
const TARGETS: AwakenTarget[] = [...AWAKEN_GEAR, ...(Object.keys(DISHES) as DishId[])];
const secs = (ms: number) => (ms / 1000).toFixed(1);

// "now -> next star" in words
function nextStar(save: SaveData, target: AwakenTarget, n: number): string {
  const up = { ...save, stars: { ...save.stars, [target]: n + 1 } };
  if (isDishId(target)) {
    const lv = save.dishes[target] ?? 1;
    return t("awaken.fx.price", { a: Math.round(dishPrice(target, lv) * starMul(n)), b: Math.round(dishPrice(target, lv) * starMul(n + 1)) });
  }
  switch (target) {
    case "melee":
      return t("awaken.fx.damage", { a: huntStats(save).meleeDamage, b: huntStats(up).meleeDamage });
    case "ranged":
      return t("awaken.fx.damage", { a: huntStats(save).rangedDamage, b: huntStats(up).rangedDamage });
    case "armor":
      return t("awaken.fx.taken", { a: Math.round(huntStats(save).damageTaken * 100), b: Math.round(huntStats(up).damageTaken * 100) });
    case "sling":
      return t("awaken.fx.damage", { a: Math.round(H.sling.damage * starMul(n)), b: Math.round(H.sling.damage * starMul(n + 1)) });
    case "sleepGun":
      return t("awaken.fx.darts", { a: sleepDartsFor("king", n), b: sleepDartsFor("king", n + 1) });
    case "netGun":
      return t("awaken.fx.hold", { a: secs(H.netBindMs * starMul(n)), b: secs(H.netBindMs * starMul(n + 1)) });
    case "firecracker":
      return t("awaken.fx.stun", { a: secs(H.firecracker.stunMs * starMul(n)), b: secs(H.firecracker.stunMs * starMul(n + 1)) });
  }
}

export function AwakenList({ save, busy, act, onShop }: { save: SaveData; busy: boolean; act: (a: Action) => void; onShop: () => void }) {
  return (
    <div className="upgrades-list">
      {TARGETS.map((target) => {
        const n = starLevel(save, target);
        const owned = canAwaken(save, target);
        const top = n >= MAX_STARS;
        const cost = top ? null : awakenCost(n + 1);
        const noGold = !!cost && save.gold < cost.gold;
        const noCharcoal = !!cost && save.charcoal < cost.charcoal;
        const name = isDishId(target) ? t(`dish.${target}` as StringKey) : t(`upgrade.${target}` as StringKey);
        const src = artUrl(isDishId(target) ? `test/dishes/${target}.png` : GEAR_ICON[target as (typeof AWAKEN_GEAR)[number]]);
        return (
          <div key={target} className={`ui-box upgrade-row${owned ? "" : " awaken-off"}`}>
            <img className="upgrade-icon" src={src} alt="" />
            <span className="upgrade-name">
              {name} <span className="awaken-stars">{t("awaken.stars", { n, max: MAX_STARS })}</span>
            </span>
            <span className="upgrade-fx">
              {top ? t("upgrade.max") : `${nextStar(save, target, n)} · `}
              {cost && (
                <span className={noGold || noCharcoal ? "awaken-short" : ""}>
                  {cost.gold > 0 ? t("awaken.cost", { gold: cost.gold, charcoal: cost.charcoal }) : t("awaken.costCharcoal", { charcoal: cost.charcoal })}
                </span>
              )}
            </span>
            {!owned ? (
              <button className="ui-btn" disabled>
                {t("awaken.notYet")}
              </button>
            ) : top ? (
              <button className="ui-btn" disabled>
                {t("upgrade.max")}
              </button>
            ) : noCharcoal ? (
              // short of charcoal: the way to the shop instead
              <button className="ui-btn" onClick={onShop}>
                {t("shop.open")}
              </button>
            ) : (
              <button className="ui-btn" disabled={busy || noGold} onClick={() => act({ type: "awaken", target, from: n })}>
                {noGold ? t("upgrade.noGold") : t("awaken.go")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
