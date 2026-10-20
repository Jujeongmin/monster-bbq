import { useState } from "react";
import { DISHES, isSignature, type DishId } from "../../../shared/content/dishes";
import { RECIPES } from "../../../shared/content/recipes";
import type { SaveData } from "../../../shared/save";
import { t, type StringKey } from "../../i18n";
import { BookWindow } from "../hud/Book";
import { DishIcon } from "./DishIcon";
import { ItemIcon } from "./ItemIcon";

// The cookbook in Grandma's notebook (to read only: research is the evening kitchen's), on its two pages
// (user, 2026-10-20): every dish down the left page, found or not; the picked one on the right with its
// picture, level, ingredients (the ones never brought home as "?") and how it is made.
export function CookbookBook({ save, onClose }: { save: SaveData; onClose: () => void }) {
  const ids = Object.keys(DISHES) as DishId[];
  const [picked, setPicked] = useState<DishId>(ids.find((id) => save.dishes[id]) ?? ids[0]);
  const found = ids.filter((id) => save.dishes[id]).length;
  const r = RECIPES[picked];
  const lv = save.dishes[picked];
  const can = !lv && !isSignature(picked) && r.items.every((item) => save.seenItems.includes(item));
  return (
    <BookWindow
      label={t("notebook.app.cookbook")}
      onClose={onClose}
      left={
        <>
          <p className="book-note">{t("kitchen.found", { n: found, max: ids.length })}</p>
          <div className="book-list">
            {ids.map((id) => (
              <button key={id} className={`book-row${id === picked ? " on" : ""}${save.dishes[id] ? "" : " off"}`} onClick={() => setPicked(id)}>
                <span className="row-dish">
                  <DishIcon dish={id} silhouette={!save.dishes[id]} />
                </span>
                <span className="name">{save.dishes[id] ? t(`dish.${id}` as StringKey) : "???"}</span>
                <span className="sub">{save.dishes[id] ? t("kitchen.lv", { lv: save.dishes[id] }) : ""}</span>
              </button>
            ))}
          </div>
        </>
      }
      right={
        <div className="book-detail cookbook-detail">
          <DishIcon dish={picked} silhouette={!lv} scale={2} />
          <h3>{lv ? t(`dish.${picked}` as StringKey) : "???"}</h3>
          <span className="soft">{lv ? t("kitchen.lv", { lv }) : t("kitchen.shape", { n: r.items.length, method: t(`method.${r.method}` as StringKey) })}</span>
          <div className="dish-slots">
            {r.items.map((item) => (
              <span key={item} className="ui-slot dish-slot">
                {lv || save.seenItems.includes(item) ? <ItemIcon itemKey={item} /> : "?"}
              </span>
            ))}
          </div>
          {can && <p className="fx">{t("kitchen.canResearch")}</p>}
        </div>
      }
    />
  );
}
