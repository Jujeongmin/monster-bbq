import { parseItemKey } from "../../../shared/content/items";
import { artUrl } from "../../game/art";
import { itemName } from "../../i18n";

// An item's picture (placeholder Codex icon) with its name as the tooltip; premium parts get a star.
export function ItemIcon({ itemKey }: { itemKey: string }) {
  const item = parseItemKey(itemKey);
  if (!item) return null;
  return (
    <span className="item-icon" title={itemName(itemKey)}>
      <img src={artUrl(`test/items/icon_${item.id}.png`)} alt="" />
      {item.grade === "premium" && <span className="item-star">★</span>}
    </span>
  );
}
