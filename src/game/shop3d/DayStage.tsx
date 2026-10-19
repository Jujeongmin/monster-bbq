import { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { seatXs } from "../service/shift";
import { daySpots, DAY_START, nearSpot, walk, type DayScene, type Spot, type SpotId } from "./day";
import { moveFrom } from "./input";
import { displayScale, FLOOR_Y, Z } from "./layout";
import type { ShopLook } from "./look";
import { ShopView } from "./ShopView";
import "./shop3d.css";

// The shop by day (user, 2026-10-16): the night's room in daylight with no guests, the grandchild walking the
// aisle (A/D or the stick, Shift runs); at the door or at Bandal a bubble says what the action key (E or
// Space, the action button on touch) does there. `active` is false while a window is open over it: it stops
// listening and walking. A failed start (WebGL, textures) calls onFail so the page can use buttons instead.
export function DayStage({ scene, stools, active, onSpot, onFail }: { scene: DayScene; stools: number; active: boolean; onSpot: (id: SpotId) => void; onFail: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [near, setNear] = useState<{ spot: Spot; x: number; y: number } | null>(null);
  const live = useRef({ scene, active, onSpot, onFail });
  live.current = { scene, active, onSpot, onFail };
  const ctl = useRef({ act: () => {}, stick: (_x: number) => {} });
  const touch = typeof window !== "undefined" && ("ontouchstart" in window || new URLSearchParams(location.search).has("touch"));
  const [stickX, setStickX] = useState(0);

  useEffect(() => {
    const el = stage.current!;
    const fit = () => setScale(displayScale(el.clientWidth, el.clientHeight));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // the stools as the night sets them out
    const seatsX = seatXs(stools);
    let view: ShopView;
    try {
      view = new ShopView(canvas.current!, seatsX, true);
    } catch {
      live.current.onFail();
      return;
    }
    const keys = { left: false, right: false, run: false };
    let stick = 0;
    let x = DAY_START;
    let flip = false;
    let alive = true;
    let raf = 0;
    let last = performance.now();
    let shown: string | null = null;
    const act = () => {
      if (!live.current.active) return;
      const s = nearSpot(x, daySpots(live.current.scene));
      if (s?.open) live.current.onSpot(s.id);
    };
    ctl.current = { act, stick: (v) => (stick = v) };
    const frame = (time: number) => {
      if (!alive) return;
      const dt = Math.min(time - last, 50);
      last = time;
      const move = live.current.active ? moveFrom(keys, stick) : { x: 0, run: false };
      if (move.x !== 0) flip = move.x < 0;
      x = walk(x, move, dt);
      const spots = daySpots(live.current.scene);
      const look: ShopLook = {
        waiter: { x, flip, pose: move.x !== 0 ? "walk" : "stand", carried: null },
        guests: [],
        seats: seatsX.map((sx) => ({ x: sx, stool: true, plate: null, mess: false })),
        pass: [],
        bandal: Math.floor(time / 900) % 2 ? "bandal_breathe" : "bandal_idle",
        coal: 40,
        pour: null,
        glow: null,
        plates: {},
        served: 0,
        gold: 0,
        platesLeft: 0,
      };
      view.render(look, dt / 1000);
      const s = live.current.active ? nearSpot(x, spots) : null;
      // the bubble only re-renders when its spot, its words or its place on screen change
      const at = s ? view.project(s.x, FLOOR_Y + 82, Z.waiter) : null;
      const key = s && at ? `${s.id}:${s.open}:${s.label}:${at.x}:${at.y}` : null;
      if (key !== shown) {
        shown = key;
        setNear(s && at ? { spot: s, x: at.x, y: at.y } : null);
      }
      raf = requestAnimationFrame(frame);
    };
    const key = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "a" || k === "arrowleft") keys.left = down;
      else if (k === "d" || k === "arrowright") keys.right = down;
      else if (k === "shift") keys.run = down;
      else if ((k === "e" || k === " ") && down && !e.repeat) {
        if (k === " ") e.preventDefault();
        act();
      }
    };
    const kd = key(true);
    const ku = key(false);
    addEventListener("keydown", kd);
    addEventListener("keyup", ku);
    view
      .load()
      .then(() => alive && (raf = requestAnimationFrame(frame)))
      .catch(() => alive && live.current.onFail());
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      removeEventListener("keydown", kd);
      removeEventListener("keyup", ku);
      view.dispose();
    };
  }, [stools]);

  const STICK = { x: 110, y: 440, r: 40 };
  const stickAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (box.left + box.width / 2)) / (box.width / 2);
    const v = Math.abs(dx) < 0.25 ? 0 : Math.max(-1, Math.min(1, dx));
    ctl.current.stick(v);
    setStickX(v);
  };
  const release = () => (ctl.current.stick(0), setStickX(0));
  return (
    <div ref={stage} className="s3-stage day-stage">
      <div className="s3-layer" style={{ transform: `scale(${scale})` }}>
        <canvas ref={canvas} width={960} height={540} />
        <div className="s3-hud">
          {near && (
            <div className={`ui-bubble day-prompt${near.spot.open ? "" : " closed"}`} style={{ left: near.x, top: near.y }}>
              {near.spot.open && !touch && <span className="day-key">E</span>}
              {t(near.spot.label)}
            </div>
          )}
          {active && !near && <div className="day-hint">{t(touch ? "day.hintTouch" : "day.hint")}</div>}
          {touch && active && (
            <>
              <div className="s3-stick" style={{ left: STICK.x - STICK.r, top: STICK.y - STICK.r }} onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), stickAt(e))} onPointerMove={(e) => e.buttons && stickAt(e)} onPointerUp={release} onPointerCancel={release}>
                <div className="s3-knob" style={{ transform: `translateX(${stickX * STICK.r}px)` }} />
              </div>
              <button className="ui-btn s3-act" disabled={!near?.spot.open} onPointerDown={() => ctl.current.act()}>
                {t("day.act")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
