import { useEffect, useRef, useState } from "react";
import { STAFF } from "../../../shared/content/staff";
import { artUrl } from "../art";
import { t, type StringKey } from "../../i18n";
import { MenuLine } from "../../screens/hud/Book";
import { LidLine } from "../../screens/hud/LidLine";
import { seatXs } from "../service/shift";
import { daySpots, DAY_START, nearSpot, walk, type DayScene, type Spot, type SpotId } from "./day";
import { moveFrom } from "./input";
import { PAD_EVENT, pageStore, readPadPrefs, type PadPrefs } from "../padPrefs";
import { padButton, TouchStick } from "./TouchStick";
import { layerFit, FLOOR_Y, Z } from "./layout";
import type { ShopLook } from "./look";
import { ShopView } from "./ShopView";
import { visitOrder, visitSlots, walkIn, type Visitor } from "./visit";
import "./shop3d.css";

// the door's arrow over the doorway in the picture (the door's spot is where the aisle ends, right of it)
const DOOR_ARROW_X = 72;

// The shop by day (user, 2026-10-16): the night's room in daylight with no guests, the grandchild walking the
// aisle (A/D or the stick, Shift runs); at the door or at Bandal a bubble says what the action key (E or
// Space, the action button on touch) does there. `active` is false while a window is open over it: it stops
// listening and walking. A failed start (WebGL, textures) calls onFail so the page can use buttons instead.
// `point`: the first day's arrow over where to go now (tutorial A), hidden once the grandchild is there.
// `visit`: old friends coming in for the postcards (postcard reveal A, visit.ts): one by one they walk in
// through the door to a place along the aisle; on arriving their face pops up in a bubble with their name on
// a ribbon, the camera leans in (closer for the rarer) and ▶ (Space) lets the next one in. The last ▶ ends it.
export interface DayVisit {
  visitors: Visitor[];
  onDone: () => void;
}
const VISIT_ZOOM = { common: 1.15, rare: 1.25, hero: 1.4, legend: 1.6 } as const;
// the lid's face at a new friend of each rarity (one already met: plain)
const VISIT_FACE = { common: "normal", rare: "smug", hero: "surprised", legend: "surprised" } as const;

export function DayStage({ scene, stools, active, point = null, visit = null, onSpot, onFail }: { scene: DayScene; stools: number; active: boolean; point?: SpotId | null; visit?: DayVisit | null; onSpot: (id: SpotId) => void; onFail: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // the picture's width and on-screen scale (layerFit); the view reads the width each frame
  const [layer, setLayer] = useState({ w: 960, scale: 1 });
  const layerW = useRef(960);
  layerW.current = layer.w;
  const [near, setNear] = useState<{ spot: Spot; x: number; y: number } | null>(null);
  const live = useRef({ scene, active, point, onSpot, onFail });
  live.current = { scene, active, point, onSpot, onFail };
  const [arrow, setArrow] = useState<{ x: number; y: number } | null>(null);
  const ctl = useRef({ act: () => {}, stick: (_x: number) => {} });
  const touch = typeof window !== "undefined" && ("ontouchstart" in window || new URLSearchParams(location.search).has("touch"));
  // the friends coming in: their order and places (fixed when the visit starts), who is walking now and
  // since when; `shown` is the one standing there now with their bubble's place on screen
  const visitRun = useRef<{ order: Visitor[]; slots: number[]; i: number; since: number } | null>(null);
  const [shown, setShown] = useState<{ i: number; x: number; y: number } | null>(null);
  const boyX = useRef(DAY_START);
  useEffect(() => {
    visitRun.current = visit ? { order: visitOrder(visit.visitors), slots: visitSlots(visit.visitors.length, boyX.current), i: 0, since: performance.now() } : null;
    setShown(null);
  }, [visit]);
  const nextVisitor = () => {
    const run = visitRun.current;
    if (!run || !shown) return;
    if (run.i + 1 >= run.order.length) return visit?.onDone();
    run.i += 1;
    run.since = performance.now();
    setShown(null);
  };

  useEffect(() => {
    const el = stage.current!;
    const fit = () => setLayer(layerFit(el.clientWidth, el.clientHeight));
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
    let arrowShown: string | null = null;
    const act = () => {
      if (!live.current.active) return;
      const s = nearSpot(x, daySpots(live.current.scene));
      if (s?.open) live.current.onSpot(s.id);
    };
    ctl.current = { act, stick: (v) => (stick = v) };
    const frame = (time: number) => {
      view.setWidth(layerW.current);
      if (!alive) return;
      view.setEvening(live.current.scene === "kitchen");
      const dt = Math.min(time - last, 50);
      last = time;
      const move = live.current.active ? moveFrom(keys, stick) : { x: 0, run: false };
      if (move.x !== 0) flip = move.x < 0;
      x = walk(x, move, dt);
      boyX.current = x;
      const spots = daySpots(live.current.scene);
      // the friends coming in: those before the current one stand at their places facing the grandchild,
      // the current one walks in from the door
      const run = visitRun.current;
      const helpers: ShopLook["helpers"] = [];
      let arrived: { i: number; x: number } | null = null;
      if (run) {
        for (let k = 0; k <= run.i; k++) {
          const to = run.slots[k];
          const w = k < run.i ? { x: to, arrived: true } : walkIn(to, time - run.since);
          helpers.push({ id: run.order[k].id, job: "serve", x: w.x, flip: w.arrived ? to > x : false, pose: w.arrived ? "stand" : "walk", carried: null });
          if (k === run.i && w.arrived) arrived = { i: k, x: to };
        }
        const rarity = STAFF[run.order[run.i].id].rarity;
        view.setFocus(arrived ? arrived.x : null, VISIT_ZOOM[rarity]);
      } else view.setFocus(null);
      const look: ShopLook = {
        helpers,
        waiter: { x, flip, pose: move.x !== 0 ? "walk" : "stand", carried: null },
        guests: [],
        seats: seatsX.map((sx) => ({ x: sx, stool: true, plate: null, mess: false })),
        pass: [],
        bandal: Math.floor(time / 900) % 2 ? "bandal_breathe" : "bandal_idle",
        coal: 40,
        pour: null,
        glow: null,
        prompt: null,
        plates: {},
        served: 0,
        gold: 0,
        platesLeft: 0,
      };
      view.render(look, dt / 1000);
      // the arrived friend's bubble over their head (re-rendered only when it moves on screen)
      const here = arrived;
      const head = here ? view.anchors(look).helpers?.[here.i] : undefined;
      setShown((prev) => (!head || !here ? null : prev && prev.i === here.i && prev.x === head.x && prev.y === head.y ? prev : { i: here.i, x: head.x, y: head.y }));
      const s = live.current.active ? nearSpot(x, spots) : null;
      // the bubble only re-renders when its spot, its words or its place on screen change
      const at = s ? view.project(s.x, FLOOR_Y + 82, Z.waiter) : null;
      const key = s && at ? `${s.id}:${s.open}:${s.label}:${at.x}:${at.y}` : null;
      if (key !== shown) {
        shown = key;
        setNear(s && at ? { spot: s, x: at.x, y: at.y } : null);
      }
      // the arrow over the spot to go to, until the grandchild stands at it
      const goal = live.current.point ? daySpots(live.current.scene).find((p) => p.id === live.current.point) : null;
      const to = goal && s?.id !== goal.id ? view.project(goal.id === "door" ? DOOR_ARROW_X : goal.x, FLOOR_Y + 104, Z.waiter) : null;
      const arrowKey = to ? `${to.x}:${to.y}` : null;
      if (arrowKey !== arrowShown) {
        arrowShown = arrowKey;
        setArrow(to);
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

  const who = shown && visitRun.current ? visitRun.current.order[shown.i] : null;
  const lastShown = !!shown && !!visitRun.current && shown.i + 1 >= visitRun.current.order.length;
  // a hero or a legend arriving shakes the room once
  const visitShake = !!who && (STAFF[who.id].rarity === "hero" || STAFF[who.id].rarity === "legend");
  // the pad's size and shade, as last set in the settings or the hunt's pause menu
  const [pad, setPad] = useState(() => readPadPrefs(pageStore()));
  useEffect(() => {
    const on = (e: Event) => setPad((e as CustomEvent<PadPrefs>).detail);
    addEventListener(PAD_EVENT, on);
    return () => removeEventListener(PAD_EVENT, on);
  }, []);
  return (
    <div ref={stage} className="s3-stage day-stage">
      <div className={`s3-layer${visitShake ? " visit-shake" : ""}`} style={{ width: layer.w, transform: `scale(${layer.scale})` }}>
        <canvas ref={canvas} width={layer.w} height={540} />
        <div className={`s3-hud${touch ? " touch" : ""}`}>
          {near && (
            <div className={`ui-bubble day-prompt${near.spot.open ? "" : " closed"}`} style={{ left: near.x, top: near.y }}>
              {near.spot.open && !touch && <span className="day-key">E</span>}
              {t(near.spot.label)}
            </div>
          )}
          {arrow && active && (
            <div className="day-arrow" style={{ left: arrow.x, top: arrow.y }} aria-hidden>
              ▼
            </div>
          )}
          {active && !near && <div className="day-hint">{t(touch ? "day.hintTouch" : "day.hint")}</div>}
          {who && shown && (
            <div className={`visit-pop ${STAFF[who.id].rarity}`} key={shown.i} style={{ left: shown.x, top: shown.y }}>
              <div className="ui-bubble visit-face">
                <img src={artUrl(`test/staff/${who.id}/portrait.png`)} alt="" />
              </div>
              <div className="ui-ribbon visit-ribbon">
                <b>{t(`staff.name.${who.id}` as StringKey)}</b>
                <span className="visit-rarity">{t(`staff.rarity.${STAFF[who.id].rarity}` as StringKey)}</span>
                <span className={who.isNew ? "visit-new" : "visit-shards"}>{who.isNew ? t("friends.new") : t("friends.shards", { n: who.shards })}</span>
              </div>
            </div>
          )}
          {who && shown && (
            <LidLine key={`lid${shown.i}`} face={who.isNew ? VISIT_FACE[STAFF[who.id].rarity] : "normal"} text={t(who.isNew ? (`visit.${STAFF[who.id].rarity}` as StringKey) : "visit.again")} low />
          )}
          {visit && shown && (
            <div className="visit-next">
              <MenuLine label={t(lastShown ? "friends.visitDone" : "friends.visitNext")} onPress={nextVisitor} />
            </div>
          )}
          {touch && active && (
            <>
              <TouchStick prefs={pad} onMove={(v) => ctl.current.stick(v ?? 0)} />
              <button className="ui-btn s3-act" style={padButton(pad)} disabled={!near?.spot.open} onPointerDown={() => ctl.current.act()}>
                {t("day.act")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
