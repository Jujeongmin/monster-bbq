import type { DishId } from "../../../shared/content/dishes";
import { artUrl } from "../../game/art";

// A dish's picture (Codex, approved 2026-10-14; pixel pass 2026-10-15: every dish is 42x40 art pixels).
// `scale` is a whole number of game pixels per art pixel, so the pixels stay square and even.
// `silhouette` shows only its outline, for the cookbook's dishes not found yet; "fail" is the burnt flop.
export function DishIcon({ dish, silhouette = false, scale = 1 }: { dish: DishId | "fail"; silhouette?: boolean; scale?: number }) {
  return (
    <img
      className={`dish-icon${silhouette ? " silhouette" : ""}`}
      src={artUrl(`test/dishes/${dish}.png`)}
      alt=""
      style={{ width: `calc(${42 * Math.max(1, Math.round(scale))}px * var(--s))` }}
    />
  );
}
