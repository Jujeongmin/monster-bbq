import type { Action } from "../../shared/actions";
import { BALANCE } from "../../shared/balance";
import type { UpgradeId } from "../../shared/content/upgrades";
import { isLocked, level, maxLevel, nextCost } from "../../shared/growth";
import type { SaveData } from "../../shared/save";
import { artUrl } from "../game/art";
import { t, type StringKey } from "../i18n";

// The upgrade shop (growth design 2): gold for the hunt, the kitchen and the shop. Every purchase goes
// through the server (buyUpgrade); the screen shows what the save says.
const G = BALANCE.growth;
const GROUPS: { title: StringKey; ids: UpgradeId[] }[] = [
  { title: "upgrade.group.hunt", ids: ["melee", "ranged", "armor", "bag", "lunchbox"] },
  { title: "upgrade.group.kitchen", ids: ["menu", "pot", "grillQuality", "potQuality", "wok", "fryer", "board"] },
  { title: "upgrade.group.shop", ids: ["seats"] },
];
const ICON: Record<UpgradeId, string> = {
  melee: "test/hunter/slash_1.png",
  ranged: "test/hunter/throw_1.png",
  armor: "test/hunter/down_0.png",
  bag: "test/items/icon_honeycomb.png",
  lunchbox: "test/ui/icon_pot.png",
  menu: "test/ui/icon_notebook.png",
  pot: "test/cooking/pot_clear.png",
  grillQuality: "test/cooking/grill.png",
  potQuality: "test/cooking/pot_lid.png",
  wok: "test/ui/icon_pot.png",
  fryer: "test/ui/icon_pot.png",
  board: "test/cooking/rest_board.png",
  seats: "test/cooking/grill.png",
};

// "now -> next" in words for one upgrade at level `lv`
function effect(id: UpgradeId, lv: number): string {
  const a = lv - 1;
  const pair = (table: number[], key: StringKey, f = (n: number) => String(n)) => t(key, { a: f(table[a]), b: f(table[Math.min(a + 1, table.length - 1)]) });
  switch (id) {
    case "melee":
      return pair(G.meleeDamage, "upgrade.fx.damage");
    case "ranged":
      return pair(G.rangedDamage, "upgrade.fx.damage");
    case "armor":
      return pair(G.maxHp, "upgrade.fx.hp");
    case "bag":
      return pair(G.bag, "upgrade.fx.slots");
    case "lunchbox":
      return pair(G.lunch, "upgrade.fx.slots");
    case "menu":
      return pair(G.menu, "upgrade.fx.menu");
    case "seats":
      return pair(G.seats, "upgrade.fx.guests");
    case "grillQuality":
    case "potQuality":
      return pair(G.quality, "upgrade.fx.quality", (n) => n.toFixed(2));
    default:
      return t(`upgrade.fx.${id}` as StringKey);
  }
}

export function Upgrades({ save, busy, act, onClose }: { save: SaveData; busy: boolean; act: (a: Action) => void; onClose: () => void }) {
  return (
    <div className="dayflow-screen">
      <div className="ui-panel upgrades">
        <h2>{t("upgrade.title")}</h2>
        <div className="upgrades-list">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{t(g.title)}</h3>
              {g.ids.map((id) => {
                const lv = level(save, id);
                const cost = nextCost(save, id);
                const locked = isLocked(save, id);
                const why = cost === null ? t("upgrade.max") : locked ? t("upgrade.locked") : save.gold < cost ? t("upgrade.noGold") : null;
                return (
                  <div key={id} className="ui-box upgrade-row">
                    <img className="upgrade-icon" src={artUrl(ICON[id])} alt="" />
                    <span className="upgrade-name">
                      {t(`upgrade.${id}` as StringKey)}
                      <small> {t("upgrade.level", { lv, max: maxLevel(id) })}</small>
                    </span>
                    <span className="upgrade-fx">{cost === null ? "" : effect(id, Math.max(1, lv))}</span>
                    <button className="ui-btn" disabled={busy || why !== null} onClick={() => act({ type: "buyUpgrade", id })}>
                      {why ?? t("upgrade.buy", { cost: cost! })}
                    </button>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        <button className="ui-btn" onClick={onClose}>
          {t("upgrade.close")}
        </button>
      </div>
    </div>
  );
}
