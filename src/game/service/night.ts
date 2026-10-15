import { isDishId, type DishId } from "../../../shared/content/dishes";
import type { TonightDish } from "../../../shared/kitchen/dish";

// Small rules of the stage-1 night kept out of the Phaser scene so they can be tested.

export interface ServedReport {
  customer: string;
  dish: DishId;
}

type Store = Pick<Storage, "getItem" | "setItem">;
const key = (serviceId: string) => `monster-bbq:service:${serviceId}:served`;

// The dish a seated guest gets: their order while plates of it are left, else the first dish that still
// has some, else none (the shop has run out).
export function pickDish(plates: ReadonlyMap<DishId, number>, wanted: DishId): DishId | null {
  if ((plates.get(wanted) ?? 0) > 0) return wanted;
  for (const [dish, n] of plates) if (n > 0) return dish;
  return null;
}

// What was served tonight, kept per service in the page's session storage, so a reload mid-night resumes
// with the same plates sold instead of losing the night (the ingredients were taken when the shop opened).
export function saveServed(store: Store, serviceId: string, served: ServedReport[]) {
  try {
    store.setItem(key(serviceId), JSON.stringify(served));
  } catch {
    // private mode: a reload loses tonight's sales, nothing worse
  }
}

export function loadServed(store: Store, serviceId: string): ServedReport[] {
  try {
    const raw: unknown = JSON.parse(store.getItem(key(serviceId)) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((e): e is ServedReport => !!e && typeof e === "object" && typeof e.customer === "string" && isDishId(e.dish));
  } catch {
    return [];
  }
}

// Plates of each dish still on the pass after what was served.
export function platesLeft(dishes: TonightDish[], served: ServedReport[]): Map<DishId, number> {
  const left = new Map(dishes.map((d) => [d.dish, d.plates]));
  for (const s of served) left.set(s.dish, Math.max(0, (left.get(s.dish) ?? 0) - 1));
  return left;
}
