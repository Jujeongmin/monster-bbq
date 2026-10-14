import type { DishId } from "../../../shared/content/dishes";
import { artUrl } from "../../game/art";

// A dish's picture (Codex, approved 2026-10-14). `silhouette` shows only its outline, for the cookbook's
// dishes not found yet; "fail" is the burnt flop.
export function DishIcon({ dish, silhouette = false, size = 48 }: { dish: DishId | "fail"; silhouette?: boolean; size?: number }) {
  return <img className={`dish-icon${silhouette ? " silhouette" : ""}`} src={artUrl(`test/dishes/${dish}.png`)} alt="" style={{ width: size }} />;
}
