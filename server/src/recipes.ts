import type { DishId } from "../../shared/content/dishes";
import type { Recipe } from "../../shared/kitchen/cook";

// The answers to the research kitchen. Server only: the client bundle must never contain this table
// (scripts/check-bundle.ts checks every build). Only type imports here, so Node can read the file as is.
// Order matters for near-miss hints: the first close recipe gives the hint.
export const RECIPES: Record<DishId, Recipe> = {
  grilled_belly: { method: "grill", items: ["boar_belly"] },
  garlic_neck: { method: "grill", items: ["boar_neck", "wild_garlic"] },
  belly_ssam: { method: "grill", items: ["boar_belly", "perilla", "wild_garlic"] },
  honey_rabbit: { method: "grill", items: ["rabbit_leg", "honeycomb"] },
  shiitake_grill: { method: "grill", items: ["shiitake"] },
  rib_stew: { method: "boil", items: ["boar_rib", "shiitake"] },
  baeksuk: { method: "boil", items: ["chicken_thigh", "wild_garlic", "shiitake"] },
  chicken_perilla: { method: "season", items: ["chicken_breast", "perilla"] },
};
