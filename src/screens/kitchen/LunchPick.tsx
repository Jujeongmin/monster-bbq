import { useState } from "react";
import type { Action } from "../../../shared/actions";
import { BALANCE } from "../../../shared/balance";
import { DISHES, type DishId } from "../../../shared/content/dishes";
import { lunchSlots } from "../../../shared/growth";
import { dishPrice, setsAvailable } from "../../../shared/kitchen/dish";
import type { SaveData } from "../../../shared/save";
import { t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";

// Packing tomorrow's lunchbox (growth design 2): researched dishes, up to the box's free slots, made from real
// ingredients by the server (packLunch). Eaten on the hunt for health (by the dish's level price) (and a quick step for some).
export function LunchPick({ save, busy, act }: { save: SaveData; busy: boolean; act: (a: Action) => void }) {
  const [picked, setPicked] = useState<DishId[]>([]);
  const free = lunchSlots(save) - save.lunchbox.length;
  const known = (Object.keys(DISHES) as DishId[]).filter((id) => save.dishes[id]);

  function add(id: DishId) {
    if (picked.length < free) setPicked([...picked, id]);
  }

  return (
    <div className="lunch-pick">
      <h3 className="cookbook-count">{t("lunch.box", { n: save.lunchbox.length + picked.length, max: lunchSlots(save) })}</h3>
      <div className="lunch-box">
        {save.lunchbox.map((id, i) => (
          <span key={`p${i}`} className="ui-box lunch-slot packed">
            <DishIcon dish={id} />
          </span>
        ))}
        {picked.map((id, i) => (
          <button key={`n${i}`} className="ui-box lunch-slot" onClick={() => setPicked(picked.filter((_, j) => j !== i))}>
            <DishIcon dish={id} />
          </button>
        ))}
      </div>
      {known.length === 0 && <p className="kitchen-empty">{t("kitchen.menuEmpty")}</p>}
      <div className="lunch-list">
        {known.map((id) => {
          const left = setsAvailable(save.items, id) - picked.filter((p) => p === id).length;
          return (
            <button key={id} className="ui-box menu-row" disabled={left <= 0 || picked.length >= free} onClick={() => add(id)}>
              <span className="menu-dish">
                <DishIcon dish={id} />
                <span className="dish-name">{t(`dish.${id}` as StringKey)}</span>
              </span>
              <span className="menu-info">
                {t("lunch.heal", { hp: Math.round(dishPrice(id, save.dishes[id]!) * BALANCE.lunch.healPerGold) })}
                {BALANCE.lunch.speedDishes.includes(id) ? ` · ${t("lunch.speed")}` : ""}
              </span>
            </button>
          );
        })}
      </div>
      <button
        className="ui-btn"
        disabled={busy || picked.length === 0}
        onClick={() => {
          act({ type: "packLunch", dishes: picked });
          setPicked([]);
        }}
      >
        {t("lunch.pack")}
      </button>
    </div>
  );
}
