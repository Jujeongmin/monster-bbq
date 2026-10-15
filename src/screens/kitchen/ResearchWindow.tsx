import type { DishId } from "../../../shared/content/dishes";
import { parseItemKey, type ItemId } from "../../../shared/content/items";
import { RECIPES } from "../../../shared/content/recipes";
import { levelCost, setsAvailable } from "../../../shared/kitchen/dish";
import type { SaveData } from "../../../shared/save";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";
import { ItemIcon } from "./ItemIcon";

// The research window over the cookbook (mock-up approved 2026-10-15): the dish's silhouette, how it is
// made and its base price, each ingredient with how many the fridge holds. Every ingredient seen: the cost
// (gold and one set) and the research button. Not yet: the lid says where the first missing one is found.
export function ResearchWindow({ dish, save, busy, onClose, onResearch }: { dish: DishId; save: SaveData; busy: boolean; onClose: () => void; onResearch: () => void }) {
  const r = RECIPES[dish];
  const missing = r.items.find((id) => !save.seenItems.includes(id));
  const cost = levelCost(dish, 1)!;
  const why = save.gold < cost.gold ? t("upgrade.noGold") : setsAvailable(save.items, dish) < cost.sets ? t("kitchen.needSet") : null;
  const have = (id: ItemId) => Object.entries(save.items).reduce((n, [k, c]) => (parseItemKey(k)?.id === id ? n + c : n), 0);
  return (
    <>
      <div className="research-shade" onClick={onClose} />
      <div className="ui-panel research-win" role="dialog">
        <button className="ui-sq research-x" onClick={onClose} aria-label={t("kitchen.close")}>
          ×
        </button>
        <div className="research-head">
          <DishIcon dish={dish} silhouette scale={2} />
          <div>
            <h2 className="research-name">???</h2>
            <p className="dish-shape">
              {t("kitchen.shape", { n: r.items.length, method: t(`method.${r.method}` as StringKey) })} · {t("kitchen.basePrice", { price: r.price })}
            </p>
          </div>
        </div>
        <ul className="research-need">
          {r.items.map((id) => {
            const seen = save.seenItems.includes(id);
            return (
              <li key={id}>
                <span className="ui-slot research-slot">{seen ? <ItemIcon itemKey={id} /> : "?"}</span>
                {seen ? (
                  <span>
                    {t(`item.${id}` as StringKey)} <span className="soft">· {t("kitchen.have", { n: have(id) })}</span>
                  </span>
                ) : (
                  <span className="soft">{t("kitchen.unseen")}</span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="research-foot">
          {missing ? (
            <span className="research-cost soft">{t("kitchen.needAll")}</span>
          ) : (
            <>
              <span className="research-cost">{t("kitchen.researchCost", { gold: cost.gold })}</span>
              <button className="ui-btn research-go" disabled={busy || why !== null} onClick={onResearch}>
                {why ?? t("kitchen.doResearch")}
              </button>
            </>
          )}
        </div>
        {missing && (
          <div className="research-lid">
            <p className="ui-bubble research-say">{t(`where.${missing}` as StringKey)}</p>
            <img src={artUrl("test/lid/smug.png")} alt="" />
          </div>
        )}
      </div>
    </>
  );
}
