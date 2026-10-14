import { isItemId, parseItemKey } from "../../../shared/content/items";
import { artUrl } from "../../game/art";
import { itemName, t, type StringKey } from "../../i18n";

// An item's picture (placeholder Codex icon) with its name as the tooltip; premium parts get a star.
// Takes an item key ("boar_belly:premium") or a bare item id ("boar_belly", any grade).
export function ItemIcon({ itemKey }: { itemKey: string }) {
  const item = parseItemKey(itemKey) ?? (isItemId(itemKey) ? { id: itemKey, grade: null } : null);
  if (!item) return null;
  const name = item.grade ? itemName(itemKey) : t(`item.${item.id}` as StringKey);
  return (
    <span className="item-icon" title={name}>
      <img src={artUrl(`test/items/icon_${item.id}.png`)} alt="" />
      {item.grade === "premium" && <span className="item-star">★</span>}
    </span>
  );
}
