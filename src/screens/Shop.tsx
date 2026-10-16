import { BALANCE } from "../../shared/balance";
import type { SaveData } from "../../shared/save";
import { shopOffer, vipLevel } from "../../shared/shop";
import { artUrl, hasArt } from "../game/art";
import { t, type StringKey } from "../i18n";
import type { ShopItem } from "../net/shop";
import "./shop.css";

// The VX shop (06b-1 design 2): each product at what this account would really get now, with its value
// band (charcoal's worth in VX over the price, the VIP bonus counted), the first-purchase and
// once-per-account marks, and the VIP level with what the next one takes. A product the Verse8 shop does
// not list (not registered yet) or will not sell (limit reached) cannot be bought. While a purchase is
// being checked (the webhook can trail the payment window) the buttons wait.
export function Shop({ save, items, checking, onBuy, onClose }: { save: SaveData; items: ShopItem[]; checking: boolean; onBuy: (productId: string) => void; onClose: () => void }) {
  const lv = vipLevel(save.vip.spent);
  const next = BALANCE.shop.vipAt[lv];
  const icon = (id: string) => artUrl(hasArt(`test/shop/products/${id}.png`) ? `test/shop/products/${id}.png` : "test/ui/icon_golden_charcoal.png");
  return (
    <div className="dayflow-screen store">
      <div className="ui-panel shop">
        <h2>{t("shop.title")}</h2>
        <p className="shop-vip">
          <img className="ui-icon ui-icon-lg" src={artUrl("test/ui/vip_badge.png")} alt="" />
          {next === undefined ? t("shop.vipMax") : t("shop.vip", { lv, need: next - save.vip.spent })} ·{" "}
          <img className="ui-icon ui-icon-lg" src={artUrl("test/ui/icon_golden_charcoal.png")} alt="" />
          {t("hud.charcoal", { n: save.charcoal })}
        </p>
        <div className="shop-grid">
          {shopOffer(save).map((o) => {
            const item = items.find((i) => i.productId === o.id);
            const ok = !!item && item.purchasable && !item.purchaseLimitReached;
            return (
              <div key={o.id} className="ui-box shop-card">
                <span className="ui-ribbon shop-band">{o.vipPct > 0 ? t("shop.valueVip", { pct: o.valuePct, vip: o.vipPct }) : t("shop.value", { pct: o.valuePct })}</span>
                <div className="shop-what">
                  <img className="shop-icon" src={icon(o.id)} alt="" onLoad={(e) => (e.currentTarget.style.height = `calc(${e.currentTarget.naturalHeight}px * var(--s))`)} />
                  <div>
                    <div className="shop-name">{t(`product.${o.id}` as StringKey)}</div>
                    <div className="shop-gives">{o.gold > 0 ? t("shop.givesGold", { charcoal: o.charcoal, gold: o.gold }) : t("shop.gives", { charcoal: o.charcoal })}</div>
                  </div>
                </div>
                <div className="shop-buy">
                  {o.firstBuy && <span className="ui-plate shop-mark">{t("shop.firstBuy")}</span>}
                  {o.once && <span className="ui-plate shop-mark">{t("shop.once")}</span>}
                  <button className="ui-btn" disabled={!ok || checking} onClick={() => onBuy(o.id)}>
                    {t("shop.price", { vx: item?.price ?? o.vx })}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {checking && <p className="shop-checking">{t("shop.checking")}</p>}
        <button className="ui-btn" onClick={onClose}>
          {t("upgrade.close")}
        </button>
      </div>
    </div>
  );
}
