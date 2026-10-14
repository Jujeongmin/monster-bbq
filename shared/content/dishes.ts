// The dishes anyone may know exist (names and cookbook hint lines are in i18n). What goes into them is
// the server's secret: server/src/recipes.ts (spec 7).
export const METHODS = ["grill", "boil", "stirfry", "fry", "season"] as const;
export type Method = (typeof METHODS)[number];

export function isMethod(v: unknown): v is Method {
  return typeof v === "string" && (METHODS as readonly string[]).includes(v);
}

// Cookbook order. The forest's signature dish comes with its boss (plan 03b).
export const DISHES = {
  grilled_belly: { chapter: 1 },
  garlic_neck: { chapter: 1 },
  belly_ssam: { chapter: 1 },
  honey_rabbit: { chapter: 1 },
  shiitake_grill: { chapter: 1 },
  rib_stew: { chapter: 1 },
  baeksuk: { chapter: 1 },
  chicken_perilla: { chapter: 1 },
} as const satisfies Record<string, { chapter: number }>;

export type DishId = keyof typeof DISHES;

export function isDishId(v: unknown): v is DishId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(DISHES, v);
}
