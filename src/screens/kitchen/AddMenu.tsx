import { useState } from "react";
import type { DishId } from "../../../shared/content/dishes";
import type { AddOption } from "../../../shared/service/addMenu";
import { t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";

// Bandal's menu board during the night (shop remake step 4): what the fridge still makes, each line with
// its sets (−/+) and an Add of its own; a dish already on tonight's board keeps its price, a new one takes a
// free menu slot. The night waits while this is open. The server takes the ingredients.
export function AddMenu({ options, slots, busy, error, onAdd, onClose }: { options: AddOption[]; slots: { used: number; max: number }; busy: boolean; error: string | null; onAdd: (dish: DishId, sets: number) => void; onClose: () => void }) {
  const [sets, setSets] = useState<Partial<Record<DishId, number>>>({});
  const of = (o: AddOption) => Math.min(sets[o.dish] ?? 1, o.maxSets);
  return (
    <div className="add-menu-win" onPointerDown={(e) => e.stopPropagation()}>
      <div className="ui-panel add-menu" role="dialog" aria-label={t("addMenu.title")}>
        <h2>
          {t("addMenu.title")} <span className="add-menu-slots">{t("addMenu.slots", slots)}</span>
        </h2>
        {options.length === 0 && <p className="add-menu-none">{t("addMenu.none")}</p>}
        {options.map((o) => (
          <div key={o.dish} className="ui-box menu-line add-menu-line">
            <DishIcon dish={o.dish} />
            <span className="menu-info">
              <span className="dish-name">{t(`dish.${o.dish}` as StringKey)}</span>
              <span className="dish-shape">
                {o.price}G · {o.isNew ? t("addMenu.new") : t("addMenu.samePrice")} · {t("addMenu.sets", { n: o.maxSets })}
              </span>
            </span>
            <span className="menu-sets">
              <button className="ui-sq" disabled={busy || of(o) <= 1} onClick={() => setSets({ ...sets, [o.dish]: of(o) - 1 })}>
                −
              </button>
              <span className="menu-count">{of(o)}</span>
              <button className="ui-sq" disabled={busy || of(o) >= o.maxSets} onClick={() => setSets({ ...sets, [o.dish]: of(o) + 1 })}>
                +
              </button>
              <button className="ui-btn" disabled={busy} onClick={() => onAdd(o.dish, of(o))}>
                {t("addMenu.add")}
              </button>
            </span>
          </div>
        ))}
        <p className="add-menu-status">{busy ? t("addMenu.sending") : error}</p>
        <button className="ui-btn" disabled={busy} onClick={onClose}>
          {t("upgrade.close")}
        </button>
      </div>
    </div>
  );
}
