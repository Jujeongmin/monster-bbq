import type { Action } from "../../../shared/actions";
import { DISHES, type DishId } from "../../../shared/content/dishes";
import { RECIPES } from "../../../shared/content/recipes";
import { dishPrice, levelCost, MAX_DISH_LEVEL, platesPerSet, setsAvailable } from "../../../shared/kitchen/dish";
import type { SaveData } from "../../../shared/save";
import { t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";
import { ItemIcon } from "./ItemIcon";

// Dish upgrades (restaurant v2 design 3, Q6; mock-up approved 2026-10-15): one row a researched dish —
// its level as brass pips, what the next level brings, what it costs (gold and sets of its own
// ingredients, shown as their icons) and the button. The server checks and charges (upgradeDish).
export function DishUpgrade({ save, busy, act }: { save: SaveData; busy: boolean; act: (a: Action) => void }) {
  const known = (Object.keys(DISHES) as DishId[]).filter((id) => save.dishes[id]);
  return (
    <div className="dish-upgrade">
      {known.length === 0 && <p className="kitchen-empty">{t("kitchen.noDishes")}</p>}
      {known.map((id) => {
        const lv = save.dishes[id]!;
        const cost = levelCost(id, lv + 1);
        const why = !cost ? t("upgrade.max") : save.gold < cost.gold ? t("upgrade.noGold") : setsAvailable(save.items, id) < cost.sets ? t("kitchen.noSets") : null;
        return (
          <div key={id} className="ui-box upgrade-dish">
            <DishIcon dish={id} />
            <span className="upgrade-who">
              <span className="dish-name">{t(`dish.${id}` as StringKey)}</span>
              <span className="pips">
                {Array.from({ length: MAX_DISH_LEVEL }, (_, i) => (
                  <i key={i} className={i < lv ? "on" : ""} />
                ))}
              </span>
            </span>
            {cost ? (
              <>
                <span className="upgrade-next">
                  <span>{t("kitchen.priceUp", { a: dishPrice(id, lv), b: dishPrice(id, lv + 1) })}</span>
                  <span>{t("kitchen.platesUp", { a: platesPerSet(lv), b: platesPerSet(lv + 1) })}</span>
                </span>
                <span className="upgrade-cost">
                  {t("kitchen.costGold", { gold: cost.gold })}
                  {RECIPES[id].items.map((item) => (
                    <span key={item} className="ui-slot cost-slot">
                      <ItemIcon itemKey={item} />
                    </span>
                  ))}
                  ×{cost.sets}
                </span>
              </>
            ) : (
              <span className="upgrade-max">{t("upgrade.max")}</span>
            )}
            <button className="ui-btn" disabled={busy || why !== null} onClick={() => act({ type: "upgradeDish", dish: id })}>
              {why ?? t("kitchen.upgradeBuy")}
            </button>
          </div>
        );
      })}
    </div>
  );
}
