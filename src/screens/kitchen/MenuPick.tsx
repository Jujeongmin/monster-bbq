import { BALANCE } from "../../../shared/balance";
import { DISHES, type DishId } from "../../../shared/content/dishes";
import { servings } from "../../../shared/kitchen/cook";
import type { SaveData } from "../../../shared/save";
import { t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";

// Tonight's menu (spec 4): pick up to menuSlots found dishes, seeing how many plates the fridge makes.
// A dish whose tool is not owned yet is shown but cannot be picked. The choice is sent when the shop
// opens (Kitchen's ready button).
export function MenuPick({ save, picked, setPicked }: { save: SaveData; picked: DishId[]; setPicked: (d: DishId[]) => void }) {
  const known = (Object.keys(DISHES) as DishId[]).filter((id) => save.cookbook[id]);
  const slots = BALANCE.kitchen.menuSlots;

  function toggle(id: DishId) {
    if (picked.includes(id)) setPicked(picked.filter((d) => d !== id));
    else if (picked.length < slots) setPicked([...picked, id]);
  }

  return (
    <div className="menu-pick">
      <h3 className="cookbook-count">{t("kitchen.menuSlots", { n: picked.length, max: slots })}</h3>
      {known.length === 0 && <p className="kitchen-empty">{t("kitchen.menuEmpty")}</p>}
      {known.map((id) => {
        const recipe = save.cookbook[id]!;
        const hasTool = save.tools.includes(recipe.method);
        const on = picked.includes(id);
        return (
          <button key={id} className={`ui-box menu-row${on ? " on" : ""}`} disabled={!hasTool} onClick={() => toggle(id)}>
            <span className="menu-dish">
              <DishIcon dish={id} size={40} />
              <span className="dish-name">{t(`dish.${id}` as StringKey)}</span>
            </span>
            <span className="menu-info">
              {hasTool ? t("kitchen.servings", { n: servings(recipe, save.items) }) : t("kitchen.needTool", { tool: t(`tool.${recipe.method}` as StringKey) })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
