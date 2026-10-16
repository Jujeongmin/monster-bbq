import { DISHES, type DishId } from "../../../shared/content/dishes";
import { level, maxLevel, menuSlots } from "../../../shared/growth";
import { dishPrice, MAX_SETS, planShop, platesPerSet, setsAvailable, type MenuLine } from "../../../shared/kitchen/dish";
import type { SaveData } from "../../../shared/save";
import { t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";

// Tonight's menu board (restaurant v2 design 5, mock-up approved 2026-10-15). Left: researched dishes to
// put on the board. Right: the board's slots, each line with its sets (-/+), the plates and price it
// makes (a premium part in a set raises the price) and how many more sets the fridge still has for it;
// empty slots, one locked slot while the menu-slot upgrade has more to give, and tonight's totals. The
// server takes the sets when the shop opens.
export function MenuPick({ save, menu, setMenu }: { save: SaveData; menu: MenuLine[]; setMenu: (m: MenuLine[]) => void }) {
  const known = (Object.keys(DISHES) as DishId[]).filter((id) => save.dishes[id]);
  const slots = menuSlots(save);
  const plan = planShop(save.items, save.dishes, menu, save.stars);
  const left = plan?.items ?? {};
  const on = (id: DishId) => menu.some((l) => l.dish === id);
  const setSets = (id: DishId, sets: number) => setMenu(menu.map((l) => (l.dish === id ? { ...l, sets } : l)));
  const plates = plan?.dishes.reduce((n, d) => n + d.plates, 0) ?? 0;
  const gold = plan?.dishes.reduce((n, d) => n + d.plates * d.price, 0) ?? 0;

  return (
    <div className="menu-pick">
      <div className="menu-list">
        {known.length === 0 && <p className="kitchen-empty">{t("kitchen.menuEmpty")}</p>}
        {known.map((id) => {
          const lv = save.dishes[id]!;
          const can = !on(id) && menu.length < slots && setsAvailable(left, id) > 0;
          return (
            <div key={id} className={`ui-box menu-row${on(id) ? " on" : ""}`}>
              <DishIcon dish={id} />
              <span className="menu-info">
                <span className="dish-name">{t("kitchen.nameLv", { name: t(`dish.${id}` as StringKey), lv })}</span>
                <span className="dish-shape">{t("kitchen.rowInfo", { price: dishPrice(id, lv), plates: platesPerSet(lv), sets: setsAvailable(save.items, id) })}</span>
              </span>
              <button className="ui-btn menu-put" disabled={!can} onClick={() => setMenu([...menu, { dish: id, sets: 1 }])}>
                {on(id) ? t("kitchen.putDone") : t("kitchen.put")}
              </button>
            </div>
          );
        })}
      </div>
      <div className="menu-board">
        <h3 className="menu-title">{t("kitchen.board", { n: menu.length, max: slots })}</h3>
        {menu.map((l) => {
          const d = plan?.dishes.find((x) => x.dish === l.dish);
          const base = dishPrice(l.dish, save.dishes[l.dish] ?? 1);
          const more = setsAvailable(left, l.dish);
          return (
            <div key={l.dish} className="ui-box menu-line">
              <DishIcon dish={l.dish} />
              <span className="menu-info">
                <span className="dish-name">{t(`dish.${l.dish}` as StringKey)}</span>
                {d && <span className="menu-made">{t("kitchen.lineMade", { plates: d.plates, price: d.price })}</span>}
                <span className="dish-shape">
                  {t("kitchen.lineMore", { n: more })}
                  {d && d.price > base ? ` · ${t("kitchen.premiumMix", { pct: Math.round((d.price / base - 1) * 100) })}` : ""}
                </span>
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
          <div key={`e${i}`} className="ui-box menu-empty">{t("kitchen.emptySlot")}</div>
        ))}
        {level(save, "menu") < maxLevel("menu") && <div className="ui-box menu-empty">{t("kitchen.lockedSlot")}</div>}
        <div className="menu-sum">
          <span>{t("kitchen.total", { plates })}</span>
          <span>{t("kitchen.totalGold", { gold })}</span>
        </div>
      </div>
    </div>
  );
}
