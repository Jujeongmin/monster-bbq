// Everything that can sit in the bag or the fridge. Monster parts come in two grades (spec 3: a clean
// melee finish gives premium); forage has none. Prices live in BALANCE.economy.itemPrice. `taste` is
// what the kitchen's hints talk about ("something fragrant is missing").
export const ITEMS = {
  boar_belly: { kind: "part", taste: "meat" },
  boar_neck: { kind: "part", taste: "meat" },
  boar_rib: { kind: "part", taste: "meat" },
  rabbit_leg: { kind: "part", taste: "meat" },
  honeycomb: { kind: "part", taste: "sweet" },
  chicken_thigh: { kind: "part", taste: "meat" },
  chicken_breast: { kind: "part", taste: "meat" },
  shiitake: { kind: "forage", taste: "veg" },
  wild_garlic: { kind: "forage", taste: "veg" },
  perilla: { kind: "forage", taste: "veg" },
} as const satisfies Record<string, { kind: "part" | "forage"; taste: Taste }>;

export type Taste = "meat" | "veg" | "sweet";
export type ItemId = keyof typeof ITEMS;
export type Grade = "premium" | "normal";

export function isItemId(v: unknown): v is ItemId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ITEMS, v);
}

// How an item is counted in a save: "boar_belly:premium" for parts, "shiitake" for forage.
export function itemKey(id: ItemId, grade?: Grade): string {
  return grade ? `${id}:${grade}` : id;
}

export function parseItemKey(key: string): { id: ItemId; grade: Grade | null } | null {
  const [id, grade, extra] = key.split(":");
  if (extra !== undefined || !isItemId(id)) return null;
  if (ITEMS[id].kind === "part") return grade === "premium" || grade === "normal" ? { id, grade } : null;
  return grade === undefined ? { id, grade: null } : null;
}
