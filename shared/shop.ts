import { BALANCE } from "./balance";
import { productById, PRODUCTS, type Product } from "./content/products";
import type { SaveData } from "./save";

// Paying (06b-1 design 2-3): what a purchase grants, what the shop offers this account at its true value,
// and VIP. Only the server's purchase webhook calls grantPurchase (and the page in ?local development).
const S = BALANCE.shop;

export const vipLevel = (spent: number): number => S.vipAt.filter((at) => spent >= at).length;
export const vipBonus = (level: number): number => (level > 0 ? S.vipBonus[level - 1] : 0);

// The charcoal one unit of a product gives this account now: twice for a bundle's first purchase, plus
// the VIP bonus of the level before it.
function charcoalFor(save: SaveData, p: Product, first: boolean): number {
  if (!p.bundle) return p.charcoal;
  return Math.floor(p.charcoal * (first ? 2 : 1) * (1 + vipBonus(vipLevel(save.vip.spent))));
}

// One purchase from the webhook. The same purchaseId again changes nothing; a one-per-account product
// bought before is recorded but grants nothing.
export function grantPurchase(save: SaveData, p: { purchaseId: string; productId: string; quantity: number }): { save: SaveData; error?: string } {
  if (typeof p.purchaseId !== "string" || save.shop.purchases.includes(p.purchaseId)) return { save };
  const product = productById(p.productId);
  if (!product) return { save, error: "unknown_product" };
  const units = Math.max(1, Math.min(99, Math.floor(Number(p.quantity) || 1)));
  let s = save;
  for (let i = 0; i < units; i++) {
    const first = !s.shop.firstBuy.includes(product.id);
    if (product.once && !first) break;
    s = {
      ...s,
      charcoal: s.charcoal + charcoalFor(s, product, first),
      gold: s.gold + product.gold,
      vip: { ...s.vip, spent: s.vip.spent + product.vx },
      shop: { ...s.shop, firstBuy: first ? [...s.shop.firstBuy, product.id] : s.shop.firstBuy },
    };
  }
  return { save: { ...s, shop: { ...s.shop, purchases: [...s.shop.purchases, p.purchaseId].slice(-S.keepPurchases) } } };
}

export interface Offer {
  id: string;
  vx: number;
  charcoal: number;
  gold: number;
  valuePct: number; // the value band: charcoal's worth in VX over the price
  firstBuy: boolean;
  vipPct: number;
  once: boolean;
  bundle: boolean; // a charcoal bundle: the shop shows no value band on these (all the same rate)
}

// What the shop shows this account, each at what it would really get now.
export function shopOffer(save: SaveData): Offer[] {
  const vip = vipBonus(vipLevel(save.vip.spent));
  return PRODUCTS.filter((p) => (!p.needsPage || save.pages.includes(p.needsPage)) && !(p.once && save.shop.firstBuy.includes(p.id))).map((p) => {
    const first = !save.shop.firstBuy.includes(p.id);
    const charcoal = charcoalFor(save, p, first);
    // (+1e-9: 30 / 0.3 is 99.99… in floating point, and a band must not lose a percent to that)
    const valuePct = Math.floor((charcoal / S.charcoalPerVx / p.vx) * 100 + 1e-9);
    return { id: p.id, vx: p.vx, charcoal, gold: p.gold, valuePct, firstBuy: p.bundle && first, vipPct: p.bundle ? Math.round(vip * 100) : 0, once: p.once, bundle: p.bundle };
  });
}
