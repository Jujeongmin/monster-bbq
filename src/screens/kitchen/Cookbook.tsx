import { DISHES, type DishId } from "../../../shared/content/dishes";
import type { SaveData } from "../../../shared/save";
import { t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";
import { ItemIcon } from "./ItemIcon";

// The cookbook (spec 4): every dish as a card. Found ones show how they are made; the rest stay "???",
// with a one-line hint once a related ingredient has been gained.
export function Cookbook({ save }: { save: SaveData }) {
  const ids = Object.keys(DISHES) as DishId[];
  const found = ids.filter((id) => save.cookbook[id]).length;
  return (
    <div className="cookbook">
      <h3 className="cookbook-count">{t("kitchen.found", { n: found, max: ids.length })}</h3>
      <div className="cookbook-grid">
        {ids.map((id) => {
          const recipe = save.cookbook[id];
          if (recipe)
            return (
              <div key={id} className="ui-box dish-card found">
                <DishIcon dish={id} />
                <div className="dish-name">{t(`dish.${id}` as StringKey)}</div>
                <div className="dish-recipe">
                  {recipe.items.map((item) => (
                    <ItemIcon key={item} itemKey={item} />
                  ))}
                  <span className="dish-method">{t(`method.${recipe.method}` as StringKey)}</span>
                </div>
              </div>
            );
          return (
            <div key={id} className="ui-box dish-card">
              <DishIcon dish={id} silhouette />
              <div className="dish-name unknown">{t("kitchen.unknown")}</div>
              {save.hints.includes(id) && <p className="dish-hint">{t(`dish.${id}.hint` as StringKey)}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
