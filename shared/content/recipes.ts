import type { DishId, Method } from "./dishes";
import type { ItemId } from "./items";

// What every dish is made of (restaurant v2 design 3). Public now that nothing is guessed: the cookbook
// shows each dish as a silhouette with its ingredient count. `method` is for show ("3 ingredients ·
// grill"), `price` the level 1 price, `cookMs` how long Bandal takes at night (stage 2).
export interface Recipe {
  method: Method;
  items: ItemId[];
  price: number;
  cookMs: number;
}

export const RECIPES: Record<DishId, Recipe> = {
  grilled_belly: { method: "grill", items: ["boar_belly"], price: 40, cookMs: 3000 },
  garlic_neck: { method: "grill", items: ["boar_neck", "wild_garlic"], price: 50, cookMs: 3500 },
  belly_ssam: { method: "grill", items: ["boar_belly", "perilla", "wild_garlic"], price: 65, cookMs: 4500 },
  honey_rabbit: { method: "grill", items: ["rabbit_leg", "honeycomb"], price: 70, cookMs: 4000 },
  shiitake_grill: { method: "grill", items: ["shiitake"], price: 18, cookMs: 3000 },
  rib_stew: { method: "boil", items: ["boar_rib", "shiitake"], price: 80, cookMs: 5500 },
  baeksuk: { method: "boil", items: ["chicken_thigh", "wild_garlic", "shiitake"], price: 90, cookMs: 6000 },
  chicken_perilla: { method: "season", items: ["chicken_breast", "perilla"], price: 55, cookMs: 3500 },
  // chapter 1's signature (plan 08d): the Charge King's rib over charcoal
  king_galbi: { method: "grill", items: ["king_rib", "wild_garlic"], price: 180, cookMs: 7000 },
};
