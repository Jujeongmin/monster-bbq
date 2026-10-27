import { useEffect, useRef, useState } from "react";
import { BALANCE } from "../../../shared/balance";
import { bgm } from "../../audio/bgm";
import { sfx } from "../../audio/sfx";
import { t, type StringKey } from "../../i18n";
import { COAL_LOW, markSeen, nightTipDue, readSeen, TIP_FACE, tipStore, type TipId } from "../../screens/tips";
import { nightGoal, type NightGoal } from "../../screens/tutorial";
import { loadShift, saveShift } from "../service/night";
import { LAYOUT, Shift, type ShiftEvent } from "../service/shift";
import { clockText, type ServiceData, type ShopReport } from "../service/types";
import { layerFit, FLOOR_Y, COUNTER, PASS, Z } from "./layout";
import { artUrl, hasArt } from "../art";
import { lookAt, patienceTier, promptOf, serveGrade, type Pose, type ShopLook } from "./look";
import type { DishId } from "../../../shared/content/dishes";
import type { TonightDish } from "../../../shared/kitchen/dish";
import type { AddOption } from "../../../shared/service/addMenu";
import { AddMenu } from "../../screens/kitchen/AddMenu";
import { Settings } from "../../screens/hud/Settings";
import { moveFrom } from "./input";
import { ShopHud, type Anchors, type Band, type Fx, type Pop, type Tip } from "./ShopHud";
import { ShopView } from "./ShopView";

// The 3D night shop in a page (shop 3D design 7): the same loop the 2D ServiceScene ran. Walk, tick the
// night, keep it in session storage every second, turn its events into Bandal's reactions and popping
// words, draw the room, then the HUD over it. When the night is done its report goes to onEnd. A failed
// load (textures, WebGL) calls onFail so the page can fall back to the 2D shop.

// the night moves in slices of at most this much real time, as many as the frame took (a phone drawing
// fewer frames runs the night as fast as a PC: user 2026-10-22); a longer gap (the tab hidden) counts as MAX_GAP_MS
const STEP_MS = 50;
const MAX_GAP_MS = 250;
const POP_MS = 1500;
const HUD_MS = 33;
const TIP_MS = 4000; // the lid's line stays this long (the clock of the night, so a pause holds it)
const BAND_MS = 1600;
const FX_MS = 1200;
const SHAKE_MS = 200;
const GOLD_AT = { x: 22, y: 16 }; // the coin icon on the top strip, where flying coins land
// the little effect pictures (art/test/fx, approved before they go in): a kind is shown only once its
// frames are all there
const fxFrames = (name: string, n: number): string[] | undefined => {
  const paths = n === 1 ? [`test/fx/${name}.png`] : Array.from({ length: n }, (_, i) => `test/fx/${name}_${i}.png`);
  return paths.every(hasArt) ? paths.map(artUrl) : undefined;
};
const FX = { coin: fxFrames("coin", 4), steam: fxFrames("steam", 3), spark: fxFrames("spark", 3), foam: fxFrames("foam", 3), sparkle: fxFrames("sparkle", 3), puff: fxFrames("puff_angry", 3), heart: fxFrames("heart", 1) };


interface Hud {
  look: ShopLook;
  anchors: Anchors;
  clock: string;
  time: number;
  pops: Pop[];
  tip: Tip | null;
  band: Band | null;
  fx: Fx[];
  shake: boolean;
}

// Adding to the menu during the night (shop remake step 4): what can be added, the menu slots, and the
// request to the server (the save's tonight's dishes after it, or the refusal's code).
export interface AddMenuHook {
  options: AddOption[];
  slots: { used: number; max: number };
  send: (dish: DishId, sets: number) => Promise<{ dishes: TonightDish[] } | { error: string }>;
}

// `hold`: the day's title card is over the shop, so the night waits (no clock, no guests) until it is gone.
// onGoal: what to do now at the counter (the first night's goal line, tutorial.ts), told when it changes
export function ShopStage({ shop, hold = false, addMenu, onEnd, onFail, onGoal }: { shop: ServiceData; hold?: boolean; addMenu?: AddMenuHook; onEnd: (r: ShopReport) => void; onFail: () => void; onGoal?: (g: NightGoal) => void }) {
  const onGoalRef = useRef(onGoal);
  onGoalRef.current = onGoal;
  const addMenuRef = useRef(addMenu);
  addMenuRef.current = addMenu;
  // Bandal's menu board: open (the night waits), sending, and why it was refused
  const [menuOpen, setMenuOpen] = useState(false);
  // the settings (the day's same window, user 2026-10-27): the night pauses under it, and goes on as it
  // closes unless it was already paused
  const [settings, setSettings] = useState<{ pausedBefore: boolean } | null>(null);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;
  const [menuBusy, setMenuBusy] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const addRef = useRef<(dish: DishId, sets: number) => void>(() => {});
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  // the night as it opened: the page re-renders with a new (equal) object, which must not restart the room
  // (ServiceGame is keyed by the service id, so a new night gets a new stage)
  const start = useRef(shop);
  // the picture's width and on-screen scale (layerFit); the view reads the width each frame
  const [layer, setLayer] = useState({ w: 960, scale: 1 });
  const layerW = useRef(960);
  layerW.current = layer.w;
  const [hud, setHud] = useState<Hud | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(() => sfx.isMuted());
  const ctl = useRef({ press: () => {}, release: () => {}, stick: (_x: number | null) => {}, pause: () => {} });
  const touch = typeof window !== "undefined" && ("ontouchstart" in window || new URLSearchParams(location.search).has("touch"));

  useEffect(() => {
    const el = stage.current!;
    const fit = () => setLayer(layerFit(el.clientWidth, el.clientHeight));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const shop = start.current;
    const cfg = { customers: shop.customers, dishes: shop.dishes, stools: shop.stools, walkMul: shop.walkMul, coalPerDish: shop.coalPerDish, staff: shop.staff };
    // a reload picks the night up where it was (the ingredients went when the shop opened)
    const saved = loadShift(localStorage, shop.serviceId);
    const shift = new Shift(cfg, saved && saved.seats.length === shop.stools ? saved : undefined);
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
    // the lid's first-time lines (one at a time) and the bands when the plates run out or the shop closes
    const seen = readSeen(tipStore());
    let tip: { id: Exclude<TipId, "awakenApp">; left: number } | null = null;
    let band: { id: number; key: StringKey; born: number } | null = null;
    // the effects events start (never the state): a reloaded night does not burst into coins
    let fx: Fx[] = [];
    let shakeAt = -Infinity;
    let hudAt = -Infinity;
    const sprite = (frames: string[] | undefined, at: { x: number; y: number }) => frames && fx.push({ id: ++popId, kind: "sprite", x: at.x, y: at.y, frames, born: now });
    const stamp = (at: { x: number; y: number }, text: string, tone: string) => fx.push({ id: ++popId, kind: "stamp", x: at.x, y: at.y, text, tone, born: now });

    // each event's sound (shop remake step 3); the night calls this only while it runs, so a pause is quiet
    const sound = (e: ShiftEvent) => {
      switch (e.type) {
        case "order":
          return sfx.play("order");
        case "cooked":
          return sfx.play("cooked");
        case "take":
          return sfx.play("take");
        case "served":
          return sfx.play("coin");
        case "angry":
          return sfx.play("angry");
        case "pour":
          return sfx.play(e.pour === "perfect" ? "pourPerfect" : e.pour === "good" ? "pourGood" : "pourBad");
        case "coal":
          return sfx.play("coal");
        case "noCoal":
          return sfx.play("coalOut");
        case "scrub":
          return sfx.play(e.done ? "scrubDone" : "scrub");
        case "soldOut":
        case "closing":
          return sfx.play("bell");
      }
    };
    // a guest whose patience just turned red ticks once
    const late = new Set<string>();
    const pop = (at: { x: number; y: number }, text: string, color: string) => pops.push({ id: ++popId, x: at.x, y: at.y, text, color, born: now });
    const guestAt = (id: string) => {
      const g = shift.s.guests.find((x) => x.id === id);
      return g ? view.project(g.x, FLOOR_Y + 64, g.seat !== null ? Z.seated : Z.walk) : null;
    };

    // tonight's plates as this page knows them, to add only what the server added
    const made = new Map(shop.dishes.map((d) => [d.dish, d.plates]));
    addRef.current = async (dish, sets) => {
      const hook = addMenuRef.current;
      if (!hook) return;
      setMenuBusy(true);
      setMenuError(null);
      const r = await hook.send(dish, sets);
      setMenuBusy(false);
      if (!alive) return;
      if ("error" in r) {
        // the refusals a player can act on have their own words; anything else (offline, busy) says try again
        setMenuError(r.error === "no_ingredients" || r.error === "no_slot" ? t(`error.${r.error}`) : t("error.retry"));
        return;
      }
      for (const d of r.dishes) {
        const extra = d.plates - (made.get(d.dish) ?? 0);
        if (extra > 0) shift.addPlates(d.dish, extra, d.price);
        made.set(d.dish, d.plates);
      }
      // right away: the night is paused, so the every-second save would not run before a reload
      saveShift(localStorage, shop.serviceId, shift.s);
      bandal = { tex: "bandal_serve", until: now + 700 };
      setMenuOpen(false);
    };
    const press = () => {
      if (isPaused || ended || holdRef.current || menuOpenRef.current) return;
      // at an empty pass: Bandal's menu board
      if (promptOf(shift)?.verb === "menu" && addMenuRef.current) {
        setMenuError(null);
        setMenuOpen(true);
        return;
      }
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
      },
      pause: () => {
        isPaused = !isPaused;
        setPaused(isPaused);
      },
    };

    const handle = (e: ShiftEvent) => {
      sound(e);
      switch (e.type) {
        case "take":
        case "drink":
          hold.poseUntil = now + 250;
          break;
        case "served": {
          hold.poseUntil = now + 250;
          const at = guestAt(e.guest);
          if (at) {
            pop(at, t("service.tip", { n: e.tip }), "#ffd166");
            const grade = serveGrade(e.ratio);
            stamp({ x: at.x, y: at.y - 22 }, t(`service.grade.${grade}`), grade === "fast" ? "#ffd166" : grade === "good" ? "#bfe8a0" : "#d8c4a4");
            // a few coins jump off the guest and fly to the gold
            for (let i = 0; i < 4; i++) fx.push({ id: ++popId, kind: "coin", x: at.x + (i - 1.5) * 8, y: at.y, tx: GOLD_AT.x, ty: GOLD_AT.y, delay: i * 70, frames: FX.coin, born: now });
            sprite(FX.heart, { x: at.x + 14, y: at.y - 40 });
          }
          bandal = { tex: "bandal_smile", until: now + 700 };
          break;
        }
        case "cooked":
          bandal = { tex: "bandal_serve", until: now + 500 };
          sprite(FX.steam, view.project(LAYOUT.pass - 30, FLOOR_Y + PASS.h + 30, Z.pass));
          break;
        case "angry": {
          const at = guestAt(e.guest);
          if (at) {
            pop(at, t("service.angry"), "#ff8080");
            sprite(FX.puff, { x: at.x, y: at.y - 30 });
          }
          shakeAt = now;
          break;
        }
        case "scrub":
          hold.busy = "scrub";
          sprite(e.done ? FX.sparkle : FX.foam, view.project(shift.s.seats[e.seat].x, FLOOR_Y + COUNTER.h + 8, Z.counter));
          if (e.done) pop(view.project(shift.s.seats[e.seat].x, FLOOR_Y + COUNTER.h + 20, Z.counter), t("service.tip", { n: e.tip }), "#ffd166");
          break;
        case "pour":
          stamp(view.project(LAYOUT.drinkCart, FLOOR_Y + 66, Z.station), t(`service.pour.${e.pour}`), e.pour === "perfect" ? "#ffd166" : e.pour === "good" ? "#bfe8a0" : "#ff8080");
          break;
        case "coal":
          hold.busy = "grind";
          sprite(FX.spark, view.project(LAYOUT.coalBox, FLOOR_Y + 36, Z.station));
          pop(view.project(LAYOUT.coalBox, FLOOR_Y + 56, Z.station), `${Math.round(e.level)}%`, "#ffb070");
          break;
        case "noCoal":
          pop(view.project(LAYOUT.coalBox, FLOOR_Y + 64, Z.station), t("service.coalOut"), "#ff8080");
          break;
        case "soldOut":
          band = { id: ++popId, key: "service.band.soldOut", born: now };
          break;
        case "closing":
          band = { id: ++popId, key: "service.band.closing", born: now };
          break;
      }
    };

    let lastGoal: NightGoal | null = null;
    const frame = (time: number) => {
      view.setWidth(layerW.current);
      if (!alive) return;
      now = time;
      const dt = Math.min(time - last, MAX_GAP_MS);
      last = time;
      const move = moveFrom(keys, stick);
      if (!isPaused && !ended && !holdRef.current && !menuOpenRef.current) {
        for (let left = dt; left > 0; left -= STEP_MS) shift.tick(Math.min(left, STEP_MS), move);
        if (shift.s.clock - savedAt > 1000) {
          savedAt = shift.s.clock;
          saveShift(localStorage, shop.serviceId, shift.s);
        }
        const events = shift.drain();
        for (const e of events) handle(e);
        for (const g of lookAt(shift, now, 0, hold).guests) {
          if (g.bubble && patienceTier(g.bubble.patience) === "late" && g.bubble.patience > 0) {
            if (!late.has(g.id)) sfx.play("tick");
            late.add(g.id);
          } else late.delete(g.id);
        }
        const s = shift.s;
        const goal = nightGoal({
          pouring: !!s.pouring,
          carryingDish: s.tray.some((i) => i.kind === "dish"),
          dishReady: s.pass.length > 0,
          dirty: s.seats.some((st) => st.dirty),
          coalLow: s.coal < COAL_LOW,
          teaWanted: shift.drinkWanted() !== null,
          cooking: s.kitchen.length > 0,
        });
        if (goal !== lastGoal) (lastGoal = goal), onGoalRef.current?.(goal);
        // the lid's line counts down with the night; when none is up, the next first-time moment gets one
        if (tip && (tip.left -= dt) <= 0) tip = null;
        if (!tip) {
          const id = nightTipDue(shift, events, seen);
          if (id && id !== "charcoal" && id !== "awakenApp") {
            tip = { id, left: TIP_MS };
            seen.add(id);
            markSeen(tipStore(), id);
          }
        }
        if (shift.done) {
          ended = true;
          saveShift(localStorage, shop.serviceId, shift.s);
          setTimeout(() => alive && onEndRef.current(shift.report()), 800);
        }
      }
      const look = lookAt(shift, time, isPaused ? 0 : move.x, hold);
      if (time < bandal.until) look.bandal = bandal.tex;
      view.render(look, isPaused ? 0 : dt / 1000);
      pops = pops.filter((p) => time - p.born < POP_MS);
      if (band && time - band.born > BAND_MS) band = null;
      fx = fx.filter((f) => time - f.born < FX_MS);
      // the HUD (bubbles, gauges, words) follows at most every HUD_MS: the room is drawn every frame, React
      // at half that (mobile frame drops, user 2026-10-27)
      if (time - hudAt >= HUD_MS) {
        hudAt = time;
        setHud({
          look,
          anchors: view.anchors(look),
          clock: shift.s.clock >= BALANCE.service.openMs ? t("service.closed") : clockText(shift.s.clock),
          time,
          pops: [...pops],
          tip: tip && { id: tip.id, face: TIP_FACE[tip.id], text: t(`tip.${tip.id}` as StringKey) },
          band: band && { id: band.id, text: t(band.key) },
          fx: [...fx],
          shake: time - shakeAt < SHAKE_MS,
        });
      }
      raf = requestAnimationFrame(frame);
    };

    const key = (down: boolean) => (e: KeyboardEvent) => {
      sfx.unlock();
      const k = e.key.toLowerCase();
      if (k === "a" || k === "arrowleft") keys.left = down;
      else if (k === "d" || k === "arrowright") keys.right = down;
      else if (k === "shift") keys.run = down;
      // the action key: E as by day and in the hunt (user, 2026-10-20), or Space
      else if (k === " " || k === "e") {
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
      <div className={`s3-layer${hud?.shake ? " shake" : ""}`} style={{ width: layer.w, transform: `scale(${layer.scale})` }}>
        <canvas ref={canvas} width={layer.w} height={540} />
        {hud && (
          <ShopHud
            look={hud.look}
            anchors={hud.anchors}
            total={shop.customers.length}
            clock={hud.clock}
            dishes={shop.dishes.slice(0, 6).map((d) => d.dish)}
            time={hud.time}
            paused={paused}
            pops={hud.pops}
            tip={hud.tip}
            band={hud.band}
            fx={hud.fx}
            touch={touch}
            onPause={() => ctl.current.pause()}
            onSettings={() => {
              if (!paused) ctl.current.pause();
              setSettings({ pausedBefore: paused });
            }}
            muted={muted}
            onMute={() => {
              sfx.unlock();
              sfx.setMuted(!muted);
              bgm.refresh();
              setMuted(!muted);
            }}
            onPress={() => (sfx.unlock(), ctl.current.press())}
            onRelease={() => ctl.current.release()}
            onStick={(x) => ctl.current.stick(x)}
          />
        )}
        {menuOpen && addMenu && <AddMenu options={addMenu.options} slots={addMenu.slots} busy={menuBusy} error={menuError} onAdd={(d, n) => addRef.current(d, n)} onClose={() => !menuBusy && setMenuOpen(false)} />}
      </div>
      {settings && (
        <Settings
          onClose={() => {
            if (!settings.pausedBefore) ctl.current.pause();
            setSettings(null);
            // the sound may have been switched there
            setMuted(sfx.isMuted());
          }}
        />
      )}
    </div>
  );
}
