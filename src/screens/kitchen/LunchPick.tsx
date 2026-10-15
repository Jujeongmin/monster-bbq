import { useState } from "react";
import type { Action } from "../../../shared/actions";
import { BALANCE } from "../../../shared/balance";
import { DISHES, type DishId } from "../../../shared/content/dishes";
import { lunchSlots } from "../../../shared/growth";
import { dishPrice, setsAfter } from "../../../shared/kitchen/dish";
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

  const slots = lunchSlots(save);

  // Laid out on the real 1280x720 screen like Dave the Diver's prep screens: the box on top (what goes in
  // and the one button that packs it), the dishes to pick from below as cards, the same as the cookbook's.
  return (
    <div className="lunch-pick">
      <h3 className="cookbook-count">{t("lunch.box", { n: save.lunchbox.length + picked.length, max: slots })}</h3>
      <div className="ui-box lunch-tray">
        <span className="lunch-tray-title">{t(save.stage === "lunch" ? "lunch.trayAfternoon" : "lunch.tray")}</span>
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
        <span className="lunch-hint soft">{picked.length === 0 && free > 0 ? t("lunch.pickHint") : ""}</span>
        <button
          className="ui-btn lunch-go"
          disabled={busy || picked.length === 0}
          onClick={() => {
            act({ type: "packLunch", dishes: picked });
            setPicked([]);
          }}
        >
          {t("lunch.pack")}
        </button>
      </div>
      {known.length === 0 && <p className="kitchen-empty">{t("kitchen.menuEmpty")}</p>}
      <div className="lunch-grid">
        {known.map((id) => {
          const left = setsAfter(save.items, picked, id);
          return (
            <button key={id} className="ui-box dish-card lunch-card" disabled={left <= 0 || picked.length >= free} onClick={() => add(id)}>
              <DishIcon dish={id} />
              <span className="dish-name">{t(`dish.${id}` as StringKey)}</span>
              <span className="lunch-heal">
                {t("lunch.heal", { hp: Math.round(dishPrice(id, save.dishes[id]!) * BALANCE.lunch.healPerGold) })}
              </span>
              <span className="dish-shape">{t("lunch.sets", { n: left })}</span>
              {/* the quick-step dishes say so on their own line, inside the card */}
              {BALANCE.lunch.speedDishes.includes(id) && <span className="dish-shape lunch-speed">{t("lunch.speed")}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
