import type { Action } from "../../shared/actions";
import { BALANCE } from "../../shared/balance";
import { ITEMS, type ItemId } from "../../shared/content/items";
import type { UpgradeId } from "../../shared/content/upgrades";
import { isLocked, level, maxLevel, nextCost, nextMats } from "../../shared/growth";
import type { SaveData } from "../../shared/save";
import { artUrl, hasArt } from "../game/art";
import { t, type StringKey } from "../i18n";

// The upgrade shop (growth design 2): gold for the hunt, the gear and the shop; the gear also takes the deep
// floors' materials (plan 08c). Every purchase goes through the server (buyUpgrade); the screen shows what
// the save says.
const G = BALANCE.growth;
const GROUPS: { title: StringKey; ids: UpgradeId[] }[] = [
  { title: "upgrade.group.hunt", ids: ["melee", "ranged", "bag", "lunchbox", "sling", "sleepGun", "netGun", "firecracker"] },
  { title: "upgrade.group.gear", ids: ["boots", "lantern", "tank", "armor"] },
  { title: "upgrade.group.shop", ids: ["menu", "seats"] },
];
const ICON: Record<UpgradeId, string> = {
  melee: "test/ui/upg_melee.png",
  ranged: "test/ui/upg_ranged.png",
  armor: "test/ui/upg_armor.png",
  bag: "test/items/icon_honeycomb.png",
  lunchbox: "test/ui/icon_pot.png",
  menu: "test/ui/icon_notebook.png",
  seats: "test/cooking/grill.png",
  sling: "test/ui/side/sling.png",
  sleepGun: "test/ui/side/sleepGun.png",
  netGun: "test/ui/side/netGun.png",
  firecracker: "test/ui/side/firecracker.png",
  boots: "test/ui/upg_boots.png",
  lantern: "test/ui/upg_lantern.png",
  tank: "test/ui/upg_tank.png",
};
const icon = (path: string) => (hasArt(path) ? artUrl(path) : undefined);
const percent = (n: number) => String(Math.round(n * 100));

// "now -> next" in words for one upgrade at level `lv`
function effect(id: UpgradeId, lv: number): string {
  const a = Math.max(0, lv - 1);
  const pair = (table: number[], key: StringKey, f = (n: number) => String(n)) => t(key, { a: f(table[a]), b: f(table[Math.min(a + 1, table.length - 1)]) });
  switch (id) {
    case "melee":
      return pair(G.meleeDamage, "upgrade.fx.damage");
    case "ranged":
      return pair(G.rangedDamage, "upgrade.fx.damage");
    case "tank":
      return pair(G.maxHp, "upgrade.fx.hp");
    case "armor":
      return pair(G.damageTaken, "upgrade.fx.taken", percent);
    case "lantern":
      // the light's levels start at 1 (no lantern = no light)
      return lv === 0 ? t("upgrade.fx.light", { a: 0, b: G.light[0] }) : pair(G.light, "upgrade.fx.light");
    case "bag":
      return pair(G.bag, "upgrade.fx.slots");
    case "lunchbox":
      return pair(G.lunch, "upgrade.fx.slots");
    case "menu":
      return pair(G.menu, "upgrade.fx.menu");
    case "seats":
      return pair(G.seats, "upgrade.fx.guests");
    case "sling":
    case "sleepGun":
    case "netGun":
    case "firecracker":
      // a side weapon not bought yet says what it brings; a bought one, its shots now and next
      return lv === 0 ? t("upgrade.fx.newSide", { n: G.ammo[id][0] }) : pair(G.ammo[id], "upgrade.fx.ammo");
    default:
      return t(`upgrade.fx.${id}` as StringKey);
  }
}

// The deep floors' materials in the fridge (they are not food, so only this screen shows them).
const MATERIALS = (Object.keys(ITEMS) as ItemId[]).filter((id) => ITEMS[id].kind === "material");

function Mat({ id, n, short }: { id: ItemId; n: string; short?: boolean }) {
  const src = icon(`test/items/icon_${id}.png`);
  return (
    <span className={short ? "upgrade-mat short" : "upgrade-mat"}>
      {src ? <img src={src} alt={t(`item.${id}` as StringKey)} /> : t(`item.${id}` as StringKey)} {n}
    </span>
  );
}

export function Upgrades({ save, busy, act, onClose }: { save: SaveData; busy: boolean; act: (a: Action) => void; onClose: () => void }) {
  const have = (id: ItemId) => save.items[id] ?? 0;
  const owned = MATERIALS.filter((id) => have(id) > 0);
  return (
    <div className="dayflow-screen">
      <div className="ui-panel upgrades">
        <h2>{t("upgrade.title")}</h2>
        <div className="upgrades-list">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{t(g.title)}</h3>
              {g.title === "upgrade.group.gear" && owned.length > 0 && (
                <div className="upgrade-owned">
                  {t("upgrade.owned")} {owned.map((id) => <Mat key={id} id={id} n={`×${have(id)}`} />)}
                </div>
              )}
              {g.ids.map((id) => {
                const lv = level(save, id);
                const cost = nextCost(save, id);
                const locked = isLocked(save, id);
                const mats = nextMats(save, id);
                const why = cost === null ? t("upgrade.max") : locked ? t("upgrade.locked") : save.gold < cost ? t("upgrade.noGold") : mats.some((m) => have(m.item) < m.n) ? t("upgrade.noMats") : null;
                const src = icon(ICON[id]);
                return (
                  <div key={id} className="ui-box upgrade-row">
                    {src ? <img className="upgrade-icon" src={src} alt="" /> : <span className="upgrade-icon" />}
                    <span className="upgrade-name">{t(`upgrade.${id}` as StringKey)}</span>
                    <span className="upgrade-fx">
                      {t("upgrade.level", { lv, max: maxLevel(id) })}
                      {cost === null ? "" : ` · ${effect(id, lv)}`}
                    </span>
                    {mats.length > 0 && (
                      <span className="upgrade-mats">
                        {mats.map((m) => (
                          <Mat key={m.item} id={m.item} n={`${have(m.item)}/${m.n}`} short={have(m.item) < m.n} />
                        ))}
                      </span>
                    )}
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
