import { BALANCE } from "../../../shared/balance";
import { t, type StringKey } from "../../i18n";
import { artUrl } from "../art";
import { patienceTier, type Prompt, type ShopLook } from "./look";
import "./shop3d.css";

// What sits over the 3D shop (shop 3D design 7), drawn in the 960x540 picture's own pixels with the UI kit
// art: the tally and clock on the wooden strip, closing and pause, the plaques' plate counts, the guests'
// bubbles (patience rising red), the charcoal and pour gauges, popping words, and on touch the stick and
// the action button.

export interface Pop {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
}
export interface Anchors {
  guests: Record<string, { x: number; y: number }>;
  plaques: { x: number; y: number }[];
  coal: { x: number; y: number };
  cart: { x: number; y: number };
  pass: { x: number; y: number };
  seats: { x: number; y: number }[];
}
export interface HudProps {
  look: ShopLook;
  anchors: Anchors;
  total: number;
  clock: string;
  dishes: string[];
  time: number;
  closeLabel: string;
  closeDisabled: boolean;
  paused: boolean;
  pops: Pop[];
  touch: boolean;
  stickX: number;
  onClose: () => void;
  onPause: () => void;
  onPress: () => void;
  onRelease: () => void;
  onStick: (x: number | null) => void;
}

function Gauge({ x, y, width, value }: { x: number; y: number; width: number; value: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="s3-gauge" style={{ left: x - width / 2, top: y - 7, width }}>
      {v > 0 && <div className="s3-gauge-full" style={{ width: Math.round(12 + (width - 12) * v) }} />}
    </div>
  );
}

// what E does at the nearest thing: over a station, or under a seat; grey with the reason when it cannot
function PromptBubble({ prompt, anchors, touch }: { prompt: Prompt; anchors: Anchors; touch: boolean }) {
  const { at } = prompt;
  const below = at.kind === "seat";
  const a = at.kind === "seat" ? anchors.seats[at.seat] : at.kind === "pass" ? anchors.pass : at.kind === "coal" ? { x: anchors.coal.x, y: anchors.coal.y - 12 } : { x: anchors.cart.x, y: anchors.cart.y - 26 };
  if (!a) return null;
  // near the right edge (the charcoal box) it hangs to the left of its point instead of off the picture
  const right = a.x > 860;
  return (
    <div className={`ui-bubble day-prompt s3-prompt${prompt.ok ? "" : " closed"}${below ? " below" : ""}${right ? " right" : ""}`} style={{ left: right ? a.x + 24 : a.x, top: a.y }}>
      {prompt.ok && !touch && <span className="day-key">E</span>}
      {prompt.ok ? t(`prompt.${prompt.verb}` as StringKey) : t(`prompt.why.${prompt.why}` as StringKey)}
    </div>
  );
}

export function ShopHud(p: HudProps) {
  const { look } = p;
  const STICK = { x: 110, y: 440, r: 40 };
  const stick = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const scale = box.width / (STICK.r * 2);
    const dx = (e.clientX - (box.left + box.width / 2)) / scale / STICK.r;
    p.onStick(Math.abs(dx) < 0.25 ? 0 : Math.max(-1, Math.min(1, dx)));
  };
  return (
    <div className="s3-hud">
      <div className="s3-topbar">
        <img className="s3-icon" src={artUrl("test/ui/icon_gold.png")} alt="" />
        <span>
          {t("service.tally", { served: look.served, total: p.total, gold: look.gold })} · {t("service.platesLeft", { n: look.platesLeft })}
        </span>
        <span className="s3-clock">{p.clock}</span>
      </div>
      <div className="s3-buttons">
        <button className="ui-btn" disabled={p.closeDisabled} onClick={p.onClose}>
          {p.closeLabel}
        </button>
        <button className="ui-btn" onClick={p.onPause}>
          {p.paused ? t("service.resume") : t("service.pause")}
        </button>
      </div>
      {p.dishes.map((d, i) =>
        p.anchors.plaques[i] ? (
          <div key={d} className="s3-plaque" style={{ left: p.anchors.plaques[i].x, top: p.anchors.plaques[i].y }}>
            <img src={artUrl(`test/shop/dishes/${d}.png`)} alt="" />
            <span>×{look.plates[d] ?? 0}</span>
          </div>
        ) : null,
      )}
      {look.guests.map((g) => {
        const a = p.anchors.guests[g.id];
        if (!g.bubble || !a) return null;
        const angle = g.bubble.shake ? Math.sin(p.time / 60) * 6 : 0;
        return (
          <div key={g.id} className="s3-bubble" style={{ left: a.x, top: a.y, transform: `translate(-50%, -100%) rotate(${angle}deg)` }}>
            <div className={`s3-patience ${patienceTier(g.bubble.patience)}`} style={{ height: `${Math.round(g.bubble.patience * 100)}%` }} />
            <img src={artUrl(g.bubble.icon.startsWith("dish_") ? `test/shop/dishes/${g.bubble.icon.slice(5)}.png` : `test/shop/${g.bubble.icon.replace("prop_", "")}.png`)} alt="" />
          </div>
        );
      })}
      {look.prompt && <PromptBubble prompt={look.prompt} anchors={p.anchors} touch={p.touch} />}
      <Gauge x={p.anchors.coal.x} y={p.anchors.coal.y} width={64} value={look.coal / 100} />
      {look.pour !== null && (
        <>
          <Gauge x={p.anchors.cart.x} y={p.anchors.cart.y} width={72} value={look.pour} />
          <span className="s3-mark" style={{ left: p.anchors.cart.x - 36 + 72 * BALANCE.service.drinks.line, top: p.anchors.cart.y - 22 }}>
            ▼
          </span>
        </>
      )}
      {p.pops.map((o) => (
        <span key={o.id} className="s3-pop" style={{ left: o.x, top: o.y, color: o.color }}>
          {o.text}
        </span>
      ))}
      {p.touch && (
        <>
          <div className="s3-stick" style={{ left: STICK.x - STICK.r, top: STICK.y - STICK.r }} onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), stick(e))} onPointerMove={(e) => e.buttons && stick(e)} onPointerUp={() => p.onStick(null)} onPointerCancel={() => p.onStick(null)}>
            <div className="s3-knob" style={{ transform: `translateX(${p.stickX * STICK.r}px)` }} />
          </div>
          <button className="ui-btn s3-act" onPointerDown={p.onPress} onPointerUp={p.onRelease} onPointerLeave={p.onRelease} onPointerCancel={p.onRelease}>
            {look.prompt?.ok ? t(`prompt.short.${look.prompt.verb}` as StringKey) : t("service.actButton")}
          </button>
        </>
      )}
    </div>
  );
}
