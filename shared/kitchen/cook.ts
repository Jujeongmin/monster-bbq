import type { DishId, Method } from "../content/dishes";
import type { ItemId, Taste } from "../content/items";

// What a dish is made of. The full table is the server's (server/src/recipes.ts); a save's cookbook
// holds the ones that player has found.
export interface Recipe {
  method: Method;
  items: ItemId[];
}

// How a try in the research kitchen went (spec 4): a dish, a near miss with a hint, or a flop.
export type CookOutcome =
  | { kind: "new" | "known"; dish: DishId }
  | { kind: "near"; hint: "method" | "extra" }
  | { kind: "near"; hint: "missing"; taste: Taste }
  | { kind: "fail"; method: Method };

// The last try, kept in the save so a resent try (same attemptId) is not cooked twice.
export interface CookResult {
  attemptId: string;
  outcome: CookOutcome;
}
