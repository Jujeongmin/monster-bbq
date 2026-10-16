import { VXShop } from "@verse8/platform/vanilla";
import { PRODUCTS } from "../../shared/content/products";
import type { LocalTransport } from "./transport";

// The VX Shop in one place (06b-1). The dashboard's items come through VXShop; buying opens Verse8's
// payment window; the grant itself is the server's webhook, so when the window closes the page only reads
// the save again (twice: the webhook can trail the window). In ?local development a fake list (the
// products' own prices) and a purchase granted at once by the same rules.
export interface ShopItem {
  productId: string;
  price: number;
  purchasable: boolean;
  purchaseLimitReached: boolean;
}

let local: LocalTransport | null = null;
let closed: (() => void) | null = null;
let initialized = false;

export function startShop(opts: { local: LocalTransport | null; onItems: (items: ShopItem[]) => void; onClosed: () => void }): () => void {
  local = opts.local;
  closed = opts.onClosed;
  if (local) {
    opts.onItems(PRODUCTS.map((p) => ({ productId: p.id, price: p.vx, purchasable: true, purchaseLimitReached: false })));
    return () => void (closed = null);
  }
  const off = VXShop.subscribe((state) => opts.onItems(state.items));
  const offClose = VXShop.onClose(() => {
    void VXShop.refresh();
    closed?.();
  });
  if (!initialized) {
    VXShop.init();
    initialized = true;
  }
  return () => {
    off();
    offClose();
    closed = null;
  };
}

export function buy(productId: string): void {
  if (local) {
    void local.purchase(productId).then(() => closed?.());
    return;
  }
  VXShop.buyItem(productId);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// After the payment window: read the save at 1 s and again at 4 s (the webhook may trail the window).
export async function refreshAfterPurchase(load: () => Promise<void>, sleep: (ms: number) => Promise<void> = wait): Promise<void> {
  await sleep(1000);
  await load();
  await sleep(3000);
  await load();
}
