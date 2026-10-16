import { useState } from "react";
import type { Action } from "../../../shared/actions";
import { DISHES, isSignature, type DishId } from "../../../shared/content/dishes";
import { RECIPES } from "../../../shared/content/recipes";
import type { SaveData } from "../../../shared/save";
import { t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";
import { ItemIcon } from "./ItemIcon";
import { ResearchWindow } from "./ResearchWindow";

// The cookbook (restaurant v2 design 5, mock-up approved 2026-10-15): every dish as a card. Researched:
// its level ribbon, picture, name and ingredients. Not yet: its silhouette, "N ingredients · method" and
// the ingredients already brought home ("?" for the rest); a card whose ingredients have all been seen
// glows and carries a "ready to research" plate. Tapping a card not researched opens the research window.
export function Cookbook({ save, busy, act, onResearch }: { save: SaveData; busy: boolean; act: (a: Action) => void; onResearch: (dish: DishId) => void }) {
  const ids = Object.keys(DISHES) as DishId[];
  const opened = ids.filter((id) => save.dishes[id]).length;
  const [open, setOpen] = useState<DishId | null>(null);

  const slots = (id: DishId, showAll: boolean) => (
    <div className="dish-slots">
      {RECIPES[id].items.map((item) => (
        <span key={item} className="ui-slot dish-slot">
          {showAll || save.seenItems.includes(item) ? <ItemIcon itemKey={item} /> : "?"}
        </span>
      ))}
    </div>
  );

  return (
    <div className="cookbook">
      <h3 className="cookbook-count">{t("kitchen.found", { n: opened, max: ids.length })}</h3>
      <div className="cookbook-grid">
        {ids.map((id) => {
          const lv = save.dishes[id];
          if (lv)
            return (
              <div key={id} className="ui-box dish-card">
                <span className="ui-ribbon dish-lv">{t("kitchen.lv", { lv })}</span>
                <DishIcon dish={id} />
                <div className="dish-name">{t(`dish.${id}` as StringKey)}</div>
                {slots(id, true)}
              </div>
            );
          const r = RECIPES[id];
          // a signature dish waits for its boss's page, never for research
          const can = !isSignature(id) && r.items.every((item) => save.seenItems.includes(item));
          return (
            <button key={id} className={`ui-box dish-card closed${can ? " can" : ""}`} onClick={() => setOpen(id)}>
              {can && <span className="ui-plate dish-can">{t("kitchen.canResearch")}</span>}
              <DishIcon dish={id} silhouette />
              <div className="dish-shape">{t("kitchen.shape", { n: r.items.length, method: t(`method.${r.method}` as StringKey) })}</div>
              {slots(id, false)}
            </button>
          );
        })}
      </div>
      {open && (
        <ResearchWindow
          dish={open}
          save={save}
          busy={busy}
          onClose={() => setOpen(null)}
          onResearch={() => {
            onResearch(open);
            act({ type: "research", dish: open });
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}
