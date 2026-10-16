// Everything that can sit in the bag or the fridge. Monster parts come in two grades (by stars, hunt v3
// design 4.2); forage has none; the deep floors' materials (hide, scales, shell, glow-shrooms, ore) are
// not food, have no grade and weigh two bag slots (hunt v3 design 3). Prices live in BALANCE.economy.itemPrice.
export const ITEMS = {
  boar_belly: { kind: "part" },
  boar_neck: { kind: "part" },
  boar_rib: { kind: "part" },
  // the Charge King's (plan 08d): the signature dish's meat
  king_rib: { kind: "part" },
  rabbit_leg: { kind: "part" },
  honeycomb: { kind: "part" },
  chicken_thigh: { kind: "part" },
  chicken_breast: { kind: "part" },
  shiitake: { kind: "forage" },
  wild_garlic: { kind: "forage" },
  perilla: { kind: "forage" },
  // floor 3 (swamp) and floor 4 (cave), hunt v3 design 4.7
  frog_leg: { kind: "part" },
  snake_meat: { kind: "part" },
  crab_meat: { kind: "part" },
  frog_skin: { kind: "material" },
  snake_scale: { kind: "material" },
  bat_wing: { kind: "material" },
  crab_shell: { kind: "material" },
  glow_mushroom: { kind: "material" },
  iron_ore: { kind: "material" },
} as const satisfies Record<string, { kind: "part" | "forage" | "material" }>;

// bag slots one of an item takes
export const slotsOf = (id: ItemId): number => (ITEMS[id].kind === "material" ? 2 : 1);

export type ItemId = keyof typeof ITEMS;
export type Grade = "premium" | "normal";

export function isItemId(v: unknown): v is ItemId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ITEMS, v);
}

// How an item is counted in a save: "boar_belly:premium" for parts, "shiitake" for forage and materials.
export function itemKey(id: ItemId, grade?: Grade): string {
  return grade ? `${id}:${grade}` : id;
}

export function parseItemKey(key: string): { id: ItemId; grade: Grade | null } | null {
  const [id, grade, extra] = key.split(":");
  if (extra !== undefined || !isItemId(id)) return null;
  if (ITEMS[id].kind === "part") return grade === "premium" || grade === "normal" ? { id, grade } : null;
  return grade === undefined ? { id, grade: null } : null;
}
