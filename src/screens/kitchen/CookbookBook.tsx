import { useState } from "react";
import { DISHES, type DishId } from "../../../shared/content/dishes";
import type { SaveData } from "../../../shared/save";
import { t } from "../../i18n";
import { BookWindow } from "../hud/Book";
import { cookbookPages } from "./KitchenPages";

// The cookbook in Grandma's notebook (to read only: research is the evening kitchen's), the same pages as
// the kitchen's cookbook tab.
export function CookbookBook({ save, onClose }: { save: SaveData; onClose: () => void }) {
  const ids = Object.keys(DISHES) as DishId[];
  const [picked, setPicked] = useState<DishId>(ids.find((id) => save.dishes[id]) ?? ids[0]);
  const pages = cookbookPages(save, picked, setPicked, null);
  return <BookWindow label={t("notebook.app.cookbook")} onClose={onClose} left={pages.left} right={pages.right} />;
}
