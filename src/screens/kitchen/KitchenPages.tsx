import type { ReactNode } from "react";
import type { Action } from "../../../shared/actions";
import { BALANCE } from "../../../shared/balance";
import { DISHES, isSignature, type DishId } from "../../../shared/content/dishes";
import { parseItemKey, type ItemId } from "../../../shared/content/items";
import { RECIPES } from "../../../shared/content/recipes";
import { level, lunchSlots, maxLevel, menuSlots } from "../../../shared/growth";
import { dishPrice, levelCost, MAX_DISH_LEVEL, MAX_SETS, planShop, platesPerSet, setsAfter, setsAvailable, type MenuLine } from "../../../shared/kitchen/dish";
import type { SaveData } from "../../../shared/save";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { BuyCard, Price } from "../hud/Book";
import { DishIcon } from "./DishIcon";
import { ItemIcon } from "./ItemIcon";

// Bandal's kitchen on the notebook's two pages (user, 2026-10-21): each tab a list on the left page and the
// picked dish (or tonight's board, or the lunchbox) on the right. Every change goes through `act` (the
// server's rules); the pages show what the save says.
export interface Pages {
  left: ReactNode;
  right: ReactNode;
}
const ALL = Object.keys(DISHES) as DishId[];
export const knownDishes = (save: SaveData) => ALL.filter((id) => save.dishes[id]);
const name = (id: DishId) => t(`dish.${id}` as StringKey);

function DishRow({ id, on, off, sub, onClick, silhouette = false, label }: { id: DishId; on: boolean; off?: boolean; sub: string; onClick: () => void; silhouette?: boolean; label?: string }) {
  return (
    <button className={`book-row${on ? " on" : ""}${off ? " off" : ""}`} onClick={onClick}>
      <span className="row-dish">
        <DishIcon dish={id} silhouette={silhouette} />
      </span>
      <span className="name">{label ?? name(id)}</span>
      <span className="sub">{sub}</span>
    </button>
  );
}

// ---- the cookbook: every dish; the picked one with its ingredients, and its research when they are all seen
export function cookbookPages(save: SaveData, picked: DishId, onPick: (d: DishId) => void, research: { busy: boolean; onResearch: (d: DishId) => void } | null): Pages {
  const r = RECIPES[picked];
  const lv = save.dishes[picked];
  const missing = r.items.find((id) => !save.seenItems.includes(id));
  const signature = isSignature(picked);
  const cost = levelCost(picked, 1)!;
  const have = (id: ItemId) => Object.entries(save.items).reduce((n, [k, c]) => (parseItemKey(k)?.id === id ? n + c : n), 0);
  const noSet = setsAvailable(save.items, picked) < cost.sets;
  return {
    left: (
      <>
        <p className="book-note">{t("kitchen.found", { n: knownDishes(save).length, max: ALL.length })}</p>
        <div className="book-list">
          {ALL.map((id) => (
            <DishRow key={id} id={id} on={id === picked} off={!save.dishes[id]} silhouette={!save.dishes[id]} label={save.dishes[id] ? undefined : "???"} sub={save.dishes[id] ? t("kitchen.lv", { lv: save.dishes[id]! }) : ""} onClick={() => onPick(id)} />
          ))}
        </div>
      </>
    ),
    right: (
      <div className="book-detail cookbook-detail">
        <DishIcon dish={picked} silhouette={!lv} scale={2} />
        <h3>{lv ? name(picked) : "???"}</h3>
        <span className="soft">{lv ? t("kitchen.lv", { lv }) : `${t("kitchen.shape", { n: r.items.length, method: t(`method.${r.method}` as StringKey) })} · ${t("kitchen.basePrice", { price: r.price })}`}</span>
        <ul className="cook-need">
          {r.items.map((id) => {
            const seen = lv || save.seenItems.includes(id);
            return (
              <li key={id}>
                <span className="ui-slot dish-slot">{seen ? <ItemIcon itemKey={id} /> : "?"}</span>
                <span className={seen ? "" : "soft"}>{seen ? `${t(`item.${id}` as StringKey)} · ${t("kitchen.have", { n: have(id) })}` : t("kitchen.unseen")}</span>
              </li>
            );
          })}
        </ul>
        {!lv && research && !signature && !missing && (
          <BuyCard gold disabled={research.busy || save.gold < cost.gold || noSet} onClick={() => research.onResearch(picked)}>
            <Price gold={cost.gold} haveGold={save.gold} haveCharcoal={save.charcoal} />
            <span className={noSet ? "short" : ""}>{t("kitchen.oneSet")}</span>
            {t("kitchen.doResearch")}
          </BuyCard>
        )}
        {!lv && (signature || missing) && (
          <p className="cook-lid">
            <img src={artUrl("test/lid/smug.png")} alt="" />
            {t(signature ? (`where.page.${picked}` as StringKey) : (`where.${missing}` as StringKey))}
          </p>
        )}
      </div>
    ),
  };
}

// ---- tonight's menu board: the dishes on the left (pressing one puts it on), the board on the right
export function menuPages(save: SaveData, menu: MenuLine[], setMenu: (m: MenuLine[]) => void): Pages {
  const known = knownDishes(save);
  const slots = menuSlots(save);
  const plan = planShop(save.items, save.dishes, menu, save.stars);
  const left = plan?.items ?? {};
  const on = (id: DishId) => menu.some((l) => l.dish === id);
  const setSets = (id: DishId, sets: number) => setMenu(menu.map((l) => (l.dish === id ? { ...l, sets } : l)));
  const plates = plan?.dishes.reduce((n, d) => n + d.plates, 0) ?? 0;
  const gold = plan?.dishes.reduce((n, d) => n + d.plates * d.price, 0) ?? 0;
  return {
    left: (
      <>
        <p className="book-note">{t("kitchen.putHint")}</p>
        {known.length === 0 && <p className="book-note">{t("kitchen.menuEmpty")}</p>}
        <div className="book-list">
          {known.map((id) => {
            const can = !on(id) && menu.length < slots && setsAvailable(left, id) > 0;
            return (
              <DishRow key={id} id={id} on={on(id)} off={!on(id) && !can} sub={t("kitchen.rowShort", { price: dishPrice(id, save.dishes[id]!), sets: setsAvailable(save.items, id) })} onClick={() => can && setMenu([...menu, { dish: id, sets: 1 }])} />
            );
          })}
        </div>
      </>
    ),
    right: (
      <div className="book-detail menu-board-page">
        <h3>{t("kitchen.board", { n: menu.length, max: slots })}</h3>
        {menu.map((l) => {
          const d = plan?.dishes.find((x) => x.dish === l.dish);
          const more = setsAvailable(left, l.dish);
          return (
            <div key={l.dish} className="board-line">
              <span className="row-dish">
                <DishIcon dish={l.dish} />
              </span>
              <span className="board-info">
                <b>{name(l.dish)}</b>
                <span className="soft">{d ? t("kitchen.lineMade", { plates: d.plates, price: d.price }) : ""}</span>
              </span>
              <span className="menu-sets">
                <button className="ui-sq" disabled={l.sets <= 1} onClick={() => setSets(l.dish, l.sets - 1)}>−</button>
                <span className="menu-count">{l.sets}</span>
                <button className="ui-sq" disabled={more < 1 || l.sets >= MAX_SETS} onClick={() => setSets(l.dish, l.sets + 1)}>+</button>
                <button className="ui-sq" onClick={() => setMenu(menu.filter((x) => x.dish !== l.dish))} aria-label={t("kitchen.take")}>×</button>
              </span>
            </div>
          );
        })}
        {Array.from({ length: slots - menu.length }, (_, i) => (
          <p key={`e${i}`} className="board-empty soft">{t("kitchen.emptyShort")}</p>
        ))}
        {level(save, "menu") < maxLevel("menu") && <p className="board-empty soft">{t("kitchen.lockedSlot")}</p>}
        <p className="board-sum">
          <span>{t("kitchen.total", { plates })}</span>
          <b>{t("kitchen.totalGold", { gold })}</b>
        </p>
      </div>
    ),
  };
}

// ---- dish upgrades: the dishes on the left, the picked one's next level and its cost on the right
export function upgradePages(save: SaveData, picked: DishId | null, onPick: (d: DishId) => void, busy: boolean, act: (a: Action) => void): Pages {
  const known = knownDishes(save);
  const id = picked && save.dishes[picked] ? picked : known[0];
  if (!id) return { left: <p className="book-note">{t("kitchen.noDishes")}</p>, right: null };
  const lv = save.dishes[id]!;
  const cost = levelCost(id, lv + 1);
  const noSets = !!cost && setsAvailable(save.items, id) < cost.sets;
  return {
    left: (
      <div className="book-list">
        {known.map((d) => (
          <DishRow key={d} id={d} on={d === id} sub={t("kitchen.lv", { lv: save.dishes[d]! })} onClick={() => onPick(d)} />
        ))}
      </div>
    ),
    right: (
      <div className="book-detail cookbook-detail">
        <DishIcon dish={id} />
        <h3>{name(id)}</h3>
        <span className="pips">
          {Array.from({ length: MAX_DISH_LEVEL }, (_, i) => (
            <i key={i} className={i < lv ? "on" : ""} />
          ))}
        </span>
        {cost ? (
          <>
            <p className="fx">{t("kitchen.priceUp", { a: dishPrice(id, lv), b: dishPrice(id, lv + 1) })}</p>
            <p className="fx">{t("kitchen.platesUp", { a: platesPerSet(lv), b: platesPerSet(lv + 1) })}</p>
            <BuyCard gold disabled={busy || save.gold < cost.gold || noSets} onClick={() => act({ type: "upgradeDish", dish: id, from: lv })}>
              <Price gold={cost.gold} haveGold={save.gold} haveCharcoal={save.charcoal} />
              <span className={`cost-sets${noSets ? " short" : ""}`}>
                {RECIPES[id].items.map((item) => (
                  <span key={item} className="ui-slot cost-slot">
                    <ItemIcon itemKey={item} />
                  </span>
                ))}
                ×{cost.sets}
              </span>
              {t("kitchen.upgradeBuy")}
            </BuyCard>
          </>
        ) : (
          <p className="fx">{t("upgrade.max")}</p>
        )}
      </div>
    ),
  };
}

// ---- the lunchbox: the dishes on the left (pressing one puts it in), the box on the right
export function lunchPages(save: SaveData, picked: DishId[], setPicked: (p: DishId[]) => void, busy: boolean, act: (a: Action) => void): Pages {
  const slots = lunchSlots(save);
  const free = slots - save.lunchbox.length;
  const known = knownDishes(save);
  return {
    left: (
      <>
        {known.length === 0 && <p className="book-note">{t("kitchen.menuEmpty")}</p>}
        <div className="book-list">
          {known.map((id) => {
            const left = setsAfter(save.items, picked, id);
            const can = left > 0 && picked.length < free;
            const heal = Math.round(dishPrice(id, save.dishes[id]!) * BALANCE.lunch.healPerGold);
            return <DishRow key={id} id={id} on={false} off={!can} sub={`${t("lunch.heal", { hp: heal })}${BALANCE.lunch.speedDishes.includes(id) ? ` · ${t("lunch.speed")}` : ""}`} onClick={() => can && setPicked([...picked, id])} />;
          })}
        </div>
      </>
    ),
    right: (
      <div className="book-detail lunch-page">
        <h3>{t(save.stage === "lunch" ? "lunch.trayAfternoon" : "lunch.tray")}</h3>
        <span className="soft">{t("lunch.box", { n: save.lunchbox.length + picked.length, max: slots })}</span>
        <div className="lunch-box">
          {Array.from({ length: slots }, (_, i) => {
            if (i < save.lunchbox.length)
              return (
                <span key={i} className="ui-slot lunch-slot packed">
                  <DishIcon dish={save.lunchbox[i]} />
                </span>
              );
            const j = i - save.lunchbox.length;
            if (j < picked.length)
              return (
                <button key={i} className="ui-slot lunch-slot" onClick={() => setPicked(picked.filter((_, k) => k !== j))}>
                  <DishIcon dish={picked[j]} />
                </button>
              );
            return <span key={i} className="ui-slot lunch-slot" />;
          })}
        </div>
        {picked.length === 0 && free > 0 && <p className="book-note">{t("lunch.pickHintLeft")}</p>}
        <BuyCard disabled={busy || picked.length === 0} onClick={() => (act({ type: "packLunch", dishes: picked }), setPicked([]))}>
          {t("lunch.pack")}
        </BuyCard>
      </div>
    ),
  };
}
