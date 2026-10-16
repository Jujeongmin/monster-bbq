import { useEffect, useRef, useState } from "react";
import { BALANCE } from "../../../shared/balance";
import { t } from "../../i18n";
import { loadShift, saveShift } from "../service/night";
import { LAYOUT, Shift, type ShiftEvent } from "../service/shift";
import { clockText, type ServiceData, type ShopReport } from "../service/types";
import { displayScale, FLOOR_Y, COUNTER, Z } from "./layout";
import { lookAt, type Pose, type ShopLook } from "./look";
import { moveFrom } from "./input";
import { ShopHud, type Anchors, type Pop } from "./ShopHud";
import { ShopView } from "./ShopView";

// The 3D night shop in a page (shop 3D design 7): the same loop the 2D ServiceScene ran. Walk, tick the
// night, keep it in session storage every second, turn its events into Bandal's reactions and popping
// words, draw the room, then the HUD over it. When the night is done its report goes to onEnd. A failed
// load (textures, WebGL) calls onFail so the page can fall back to the 2D shop.

const MAX_DT_MS = 50;
const POP_MS = 1500;

interface Hud {
  look: ShopLook;
  anchors: Anchors;
  clock: string;
  time: number;
  pops: Pop[];
}

export function ShopStage({ shop, onEnd, onFail }: { shop: ServiceData; onEnd: (r: ShopReport) => void; onFail: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  // the night as it opened: the page re-renders with a new (equal) object, which must not restart the room
  // (ServiceGame is keyed by the service id, so a new night gets a new stage)
  const start = useRef(shop);
  const [scale, setScale] = useState(1);
  const [hud, setHud] = useState<Hud | null>(null);
  const [paused, setPaused] = useState(false);
  const [closeStep, setCloseStep] = useState<0 | 1 | 2>(0); // 0 open, 1 orders closed, 2 hall closed
  const [stickX, setStickX] = useState(0);
  const ctl = useRef({ press: () => {}, release: () => {}, stick: (_x: number | null) => {}, pause: () => {}, close: () => {} });
  const touch = typeof window !== "undefined" && ("ontouchstart" in window || new URLSearchParams(location.search).has("touch"));

  // whole-number scale for the 960x540 layer
  useEffect(() => {
    const el = stage.current!;
    const fit = () => setScale(displayScale(el.clientWidth, el.clientHeight));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const shop = start.current;
    const cfg = { customers: shop.customers, dishes: shop.dishes, stools: shop.stools, walkMul: shop.walkMul, coalPerDish: shop.coalPerDish };
    // a reload picks the night up where it was (the ingredients went when the shop opened)
    const saved = loadShift(sessionStorage, shop.serviceId);
    const shift = new Shift(cfg, saved && saved.seats.length === shop.stools ? saved : undefined);
    if (shift.s.ordersClosed) setCloseStep(1);
    let view: ShopView;
    try {
      view = new ShopView(canvas.current!, shift.s.seats.map((s) => s.x));
    } catch {
      onFailRef.current();
      return;
    }
    if (import.meta.env.DEV) (window as unknown as { __shop?: unknown }).__shop = { shift, view };
    const keys = { left: false, right: false, run: false };
    let stick = 0;
    let isPaused = false;
    let ended = false;
    let alive = true;
    let raf = 0;
    let last = performance.now();
    let savedAt = shift.s.clock;
    const hold: { poseUntil: number; busy: Pose } = { poseUntil: 0, busy: "grind" };
    let bandal = { tex: "", until: 0 };
    let pops: (Pop & { born: number })[] = [];
    let popId = 0;
    let now = 0;

    const pop = (at: { x: number; y: number }, text: string, color: string) => pops.push({ id: ++popId, x: at.x, y: at.y, text, color, born: now });
    const guestAt = (id: string) => {
      const g = shift.s.guests.find((x) => x.id === id);
      return g ? view.project(g.x, FLOOR_Y + 64, g.seat !== null ? Z.seated : Z.walk) : null;
    };
    const top = { x: 480, y: 90 };

    const press = () => {
      if (isPaused || ended) return;
      if (shift.target()?.kind === "drinks") shift.pourStart();
      else shift.act();
    };
    const release = () => {
      if (shift.s.pouring) shift.pourEnd();
    };
    ctl.current = {
      press,
      release,
      stick: (x) => {
        stick = x ?? 0;
        setStickX(stick);
      },
      pause: () => {
        isPaused = !isPaused;
        setPaused(isPaused);
      },
      // first press: no one else comes in; second: whoever still waits for a dish leaves angry
      close: () => {
        if (ended) return;
        if (!shift.s.ordersClosed) {
          shift.closeOrders();
          setCloseStep(1);
          pop(top, t("service.ordersClosed"), "#ffd166");
          return;
        }
        shift.closeHall();
        setCloseStep(2);
      },
    };

    const handle = (e: ShiftEvent) => {
      switch (e.type) {
        case "take":
        case "drink":
          hold.poseUntil = now + 250;
          break;
        case "served": {
          hold.poseUntil = now + 250;
          const at = guestAt(e.guest);
          if (at) pop(at, t("service.tip", { n: e.tip }), "#ffd166");
          bandal = { tex: "bandal_smile", until: now + 700 };
          break;
        }
        case "cooked":
          bandal = { tex: "bandal_serve", until: now + 500 };
          break;
        case "angry": {
          const at = guestAt(e.guest);
          if (at) pop(at, t("service.angry"), "#ff8080");
          break;
        }
        case "scrub":
          hold.busy = "scrub";
          if (e.done) pop(view.project(shift.s.seats[e.seat].x, FLOOR_Y + COUNTER.h + 20, Z.counter), t("service.tip", { n: e.tip }), "#ffd166");
          break;
        case "pour":
          pop(view.project(LAYOUT.drinkCart, FLOOR_Y + 60, Z.waiter), t(`service.pour.${e.pour}`), e.pour === "perfect" ? "#ffd166" : e.pour === "good" ? "#bfe8a0" : "#ff8080");
          break;
        case "coal":
          hold.busy = "grind";
          pop(view.project(LAYOUT.coalBox, FLOOR_Y + 56, Z.waiter), `${Math.round(e.level)}%`, "#ffb070");
          break;
        case "noCoal":
          pop(view.project(LAYOUT.coalBox, FLOOR_Y + 64, Z.waiter), t("service.coalOut"), "#ff8080");
          break;
        case "soldOut":
          setCloseStep((c) => (c === 0 ? 1 : c));
          pop(top, t("service.soldOut"), "#ffd166");
          break;
        case "closing":
          setCloseStep((c) => (c === 0 ? 1 : c));
          pop(top, t("service.closing"), "#ffd166");
          break;
      }
    };

    const frame = (time: number) => {
      if (!alive) return;
      now = time;
      const dt = Math.min(time - last, MAX_DT_MS);
      last = time;
      const move = moveFrom(keys, stick);
      if (!isPaused && !ended) {
        shift.tick(dt, move);
        if (shift.s.clock - savedAt > 1000) {
          savedAt = shift.s.clock;
          saveShift(sessionStorage, shop.serviceId, shift.s);
        }
        for (const e of shift.drain()) handle(e);
        if (shift.done) {
          ended = true;
          saveShift(sessionStorage, shop.serviceId, shift.s);
          setTimeout(() => alive && onEndRef.current(shift.report()), 800);
        }
      }
      const look = lookAt(shift, time, isPaused ? 0 : move.x, hold);
      if (time < bandal.until) look.bandal = bandal.tex;
      view.render(look, isPaused ? 0 : dt / 1000);
      pops = pops.filter((p) => time - p.born < POP_MS);
      setHud({ look, anchors: view.anchors(look), clock: shift.s.clock >= BALANCE.service.openMs ? t("service.closed") : clockText(shift.s.clock), time, pops: [...pops] });
      raf = requestAnimationFrame(frame);
    };

    const key = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "a" || k === "arrowleft") keys.left = down;
      else if (k === "d" || k === "arrowright") keys.right = down;
      else if (k === "shift") keys.run = down;
      else if (k === " ") {
        e.preventDefault();
        if (down && !e.repeat) press();
        if (!down) release();
      }
    };
    const kd = key(true);
    const ku = key(false);
    addEventListener("keydown", kd);
    addEventListener("keyup", ku);
    view
      .load()
      .then(() => alive && (raf = requestAnimationFrame(frame)))
      .catch(() => alive && onFailRef.current());
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      removeEventListener("keydown", kd);
      removeEventListener("keyup", ku);
      view.dispose();
    };
  }, []);

  return (
    <div ref={stage} className="s3-stage">
      <div className="s3-layer" style={{ transform: `scale(${scale})` }}>
        <canvas ref={canvas} width={960} height={540} />
        {hud && (
          <ShopHud
            look={hud.look}
            anchors={hud.anchors}
            total={shop.customers.length}
            clock={hud.clock}
            dishes={shop.dishes.slice(0, 6).map((d) => d.dish)}
            time={hud.time}
            closeLabel={closeStep === 0 ? t("service.closeOrders") : t("service.closeHall")}
            closeDisabled={closeStep === 2}
            paused={paused}
            pops={hud.pops}
            touch={touch}
            stickX={stickX}
            onClose={() => ctl.current.close()}
            onPause={() => ctl.current.pause()}
            onPress={() => ctl.current.press()}
            onRelease={() => ctl.current.release()}
            onStick={(x) => ctl.current.stick(x)}
          />
        )}
      </div>
    </div>
  );
}
