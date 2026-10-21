import { useState } from "react";
import type { Action } from "../../shared/actions";
import { AwakenDetail, AwakenList, awakenTargets } from "./Awaken";
import type { AwakenTarget } from "../../shared/awaken";
import { BookWindow, BuyCard, Price } from "./hud/Book";
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
type Group = "hunt" | "gear" | "shop";
const GROUPS: Record<Group, UpgradeId[]> = {
  hunt: ["melee", "ranged", "bag", "lunchbox", "sling", "sleepGun", "netGun", "firecracker"],
  gear: ["boots", "lantern", "tank", "armor"],
  shop: ["menu", "seats", "shoes", "coalBin", "staffSlots"],
};
// one bookmark per group and the awakening; the list on the left page, the picked one on the right (user, 2026-10-20)
type Tab = Group | "awaken";
const TABS: Tab[] = ["hunt", "gear", "shop", "awaken"];
const ICON: Record<UpgradeId, string> = {
  melee: "test/ui/upg_melee.png",
  ranged: "test/ui/upg_ranged.png",
  armor: "test/ui/upg_armor.png",
  bag: "test/items/icon_honeycomb.png",
  lunchbox: "test/ui/icon_pot.png",
  menu: "test/ui/icon_notebook.png",
  seats: "test/shop/stool.png",
  shoes: "test/ui/upg_boots.png",
  coalBin: "test/shop/coal_box.png",
  staffSlots: "test/ui/hud/app_menu.png",
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
      return pair(G.seats, "upgrade.fx.stools");
    case "staffSlots":
      return pair(G.staffSlots, "upgrade.fx.staffSlots");
    case "shoes":
      return pair(G.shoes, "upgrade.fx.walk", percent);
    case "coalBin":
      return pair(BALANCE.service.charcoal.perDish, "upgrade.fx.coal");
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

export function Upgrades({ tab: first = "upgrade", save, busy, act, onShop, onClose }: { tab?: "upgrade" | "awaken"; save: SaveData; busy: boolean; act: (a: Action) => void; onShop: () => void; onClose: () => void }) {
  const have = (id: ItemId) => save.items[id] ?? 0;
  const owned = MATERIALS.filter((id) => have(id) > 0);
  // upgrades (gold) or awakening (stars, gold and golden charcoal — 06b-1)
  const [tab, setTab] = useState<Tab>(first === "awaken" ? "awaken" : "hunt");
  const [awaken, setAwaken] = useState<"gear" | "dish">("gear");
  const [picked, setPicked] = useState<UpgradeId | null>(null);
  const [pickedStar, setPickedStar] = useState<AwakenTarget | null>(null);
  const group = tab === "awaken" ? null : GROUPS[tab];
  const id = group ? (picked && group.includes(picked) ? picked : group[0]) : null;
  const star = pickedStar && awakenTargets(awaken).includes(pickedStar) ? pickedStar : awakenTargets(awaken)[0];
  const tabs = TABS.map((k) => (
    <button key={k} className={`ui-tab${k === tab ? " on" : ""}`} onClick={() => setTab(k)}>
      {t(k === "awaken" ? "upgrade.tab.awaken" : (`upgrade.group.${k}` as StringKey))}
    </button>
  ));
  if (!group || !id)
    return (
      <BookWindow
        label={t("upgrade.tab.awaken")}
        tabs={tabs}
        onClose={onClose}
        left={<AwakenList kind={awaken} onKind={setAwaken} picked={star} onPick={setPickedStar} save={save} />}
        right={<AwakenDetail target={star} save={save} busy={busy} act={act} onShop={onShop} />}
      />
    );
  const lv = level(save, id);
  const cost = nextCost(save, id);
  const locked = isLocked(save, id);
  const mats = nextMats(save, id);
  const why = cost === null ? t("upgrade.max") : locked ? t("upgrade.locked") : mats.some((m) => have(m.item) < m.n) ? t("upgrade.noMats") : null;
  const src = icon(ICON[id]);
  return (
    <BookWindow
      label={t(`upgrade.group.${tab}` as StringKey)}
      tabs={tabs}
      onClose={onClose}
      left={
        <>
          {tab === "gear" && (
            <div className="upgrade-owned">
              {t("upgrade.owned")} {owned.length > 0 ? owned.map((m) => <Mat key={m} id={m} n={`×${have(m)}`} />) : "-"}
            </div>
          )}
          <div className="book-list">
            {group.map((u) => {
              const s = icon(ICON[u]);
              return (
                <button key={u} className={`book-row${u === id ? " on" : ""}${isLocked(save, u) ? " off" : ""}`} onClick={() => setPicked(u)}>
                  {s ? <img src={s} alt="" /> : <span />}
                  <span className="name">{t(`upgrade.${u}` as StringKey)}</span>
                  <span className="sub">{t("upgrade.level", { lv: level(save, u), max: maxLevel(u) })}</span>
                </button>
              );
            })}
          </div>
        </>
      }
      right={
        <div className="book-detail">
          <div className="head">
            {src ? <img src={src} alt="" /> : <span />}
            <span>
              <h3>{t(`upgrade.${id}` as StringKey)}</h3>
              <span className="soft">{t("upgrade.level", { lv, max: maxLevel(id) })}</span>
            </span>
          </div>
          <p className="fx">{cost === null ? t("upgrade.max") : effect(id, lv)}</p>
          {mats.length > 0 && (
            <span className="upgrade-mats">
              {mats.map((m) => (
                <Mat key={m.item} id={m.item} n={`${have(m.item)}/${m.n}`} short={have(m.item) < m.n} />
              ))}
            </span>
          )}
          {why ? (
            <p className="soft">{why}</p>
          ) : (
            <BuyCard gold disabled={busy || save.gold < cost!} onClick={() => act({ type: "buyUpgrade", id })}>
              <Price gold={cost!} haveGold={save.gold} haveCharcoal={save.charcoal} />
              {t("upgrade.up")}
            </BuyCard>
          )}
        </div>
      }
    />
  );
}
