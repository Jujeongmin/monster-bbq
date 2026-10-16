// The dishes anyone may know exist (names are in i18n). What goes into them and what they cost:
// shared/content/recipes.ts.
export const METHODS = ["grill", "boil", "stirfry", "fry", "season"] as const;
export type Method = (typeof METHODS)[number];

export function isMethod(v: unknown): v is Method {
  return typeof v === "string" && (METHODS as readonly string[]).includes(v);
}

// Cookbook order. A chapter's signature dish is never researched: it opens when its boss gives the
// notebook page back (plan 08d).
export const DISHES = {
  grilled_belly: { chapter: 1 },
  garlic_neck: { chapter: 1 },
  belly_ssam: { chapter: 1 },
  honey_rabbit: { chapter: 1 },
  shiitake_grill: { chapter: 1 },
  rib_stew: { chapter: 1 },
  baeksuk: { chapter: 1 },
  chicken_perilla: { chapter: 1 },
  king_galbi: { chapter: 1, signature: true },
} as const satisfies Record<string, { chapter: number; signature?: boolean }>;

export const isSignature = (dish: DishId): boolean => "signature" in DISHES[dish];

export type DishId = keyof typeof DISHES;

export function isDishId(v: unknown): v is DishId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(DISHES, v);
}
