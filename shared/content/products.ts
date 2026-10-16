// The VX Shop's products (06b-1 design 2). The ids are the Verse8 dashboard's, letter for letter; the
// prices here are what VIP counts (the purchase webhook carries no price). Every charcoal bundle sells at
// the same 30 charcoal per 100 VX (user, 2026-10-16): bigger bundles are no better value, only the first
// purchase (twice) and VIP add.
export interface Product {
  id: string;
  vx: number;
  charcoal: number;
  gold: number;
  once: boolean; // one per account
  bundle: boolean; // a charcoal bundle: twice the first time, plus the VIP bonus
  needsPage?: string; // shown only once this notebook page is back
}

export const PRODUCTS: Product[] = [
  { id: "starter_pack", vx: 100, charcoal: 200, gold: 5_000, once: true, bundle: false, needsPage: "forest" },
  { id: "charcoal_1", vx: 100, charcoal: 30, gold: 0, once: false, bundle: true },
  { id: "charcoal_2", vx: 500, charcoal: 150, gold: 0, once: false, bundle: true },
  { id: "charcoal_3", vx: 1_500, charcoal: 450, gold: 0, once: false, bundle: true },
  { id: "charcoal_4", vx: 5_000, charcoal: 1_500, gold: 0, once: false, bundle: true },
  { id: "charcoal_5", vx: 30_000, charcoal: 9_000, gold: 0, once: false, bundle: true },
];

export const productById = (id: unknown): Product | undefined => PRODUCTS.find((p) => p.id === id);
