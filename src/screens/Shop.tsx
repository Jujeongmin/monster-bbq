import { BALANCE } from "../../shared/balance";
import type { SaveData } from "../../shared/save";
import { shopOffer, vipLevel } from "../../shared/shop";
import { artUrl, hasArt } from "../game/art";
import { t, type StringKey } from "../i18n";

import type { ShopItem } from "../net/shop";
import { useState } from "react";
import { BookWindow } from "./hud/Book";
import "./shop.css";

// The VX shop (06b-1 design 2): each product at what this account would really get now; the starter pack
// with its value band (charcoal's worth in VX over the price), the charcoal bundles (all one rate) with
// only the VIP mark; the once-per-account mark, and the VIP level with what the next one takes. The price
// shown is the dashboard's (VXShop's item list, as the official docs show it), never a number of ours: a
// product the Verse8 shop does not list (not registered yet, or the list still loading) says so and cannot
// be bought, nor one it will not sell (limit reached). While a purchase is being checked (the webhook can
// trail the payment window) the buttons wait.
export function Shop({ save, items, checking, onBuy, onClose }: { save: SaveData; items: ShopItem[]; checking: boolean; onBuy: (productId: string) => void; onClose: () => void }) {
  const lv = vipLevel(save.vip.spent);
  const next = BALANCE.shop.vipAt[lv];
  const icon = (id: string) => artUrl(hasArt(`test/shop/products/${id}.png`) ? `test/shop/products/${id}.png` : "test/ui/icon_golden_charcoal.png");
  const offer = shopOffer(save);
  const [picked, setPicked] = useState<string | null>(null);
  const o = offer.find((x) => x.id === picked) ?? offer[0];
  const item = o ? items.find((i) => i.productId === o.id) : undefined;
  const ok = !!item && item.purchasable && !item.purchaseLimitReached;
  return (
    <BookWindow
      label={t("shop.title")}
      onClose={onClose}
      left={
        <>
          <p className="book-note shop-vip">
            <img className="ui-icon" src={artUrl("test/ui/vip_badge.png")} alt="" />
            {next === undefined ? t("shop.vipMax") : t("shop.vip", { lv, need: next - save.vip.spent })}
          </p>
          <div className="book-list">
            {offer.map((x) => {
              const it = items.find((i) => i.productId === x.id);
              return (
                <button key={x.id} className={`book-row${o && x.id === o.id ? " on" : ""}`} onClick={() => setPicked(x.id)}>
                  <img src={icon(x.id)} alt="" />
                  <span className="name">{t(`product.${x.id}` as StringKey)}</span>
                  <span className="sub">{it ? t("shop.price", { vx: it.price }) : t("shop.soon")}</span>
                </button>
              );
            })}
          </div>
        </>
      }
      right={
        o && (
          <div className="book-detail shop-detail">
            <div className="head">
              <img src={icon(o.id)} alt="" />
              <span>
                <h3>{t(`product.${o.id}` as StringKey)}</h3>
                <span className="fx">{o.gold > 0 ? t("shop.givesGold", { charcoal: o.charcoal, gold: o.gold }) : t("shop.gives", { charcoal: o.charcoal })}</span>
              </span>
            </div>
            {/* the value band only where it means something: the bundles all sell at one rate (user, 2026-10-16) */}
            {!o.bundle && <span className="ui-ribbon shop-band">{t("shop.value", { pct: o.valuePct })}</span>}
            {o.vipPct > 0 && <span className="soft">{t("shop.vipBonus", { vip: o.vipPct })}</span>}
            {o.once && <span className="soft">{t("shop.once")}</span>}
            <p className="soft">{t("shop.have", { n: save.charcoal })}</p>
            <button className="ui-btn shop-go" disabled={!ok || checking} onClick={() => onBuy(o.id)}>
              {item ? t("shop.buy", { vx: item.price }) : t("shop.soon")}
            </button>
            {checking && <p className="soft">{t("shop.checking")}</p>}
          </div>
        )
      }
    />
  );
}
