import { CARRY, type Guest, type Shift } from "../service/shift";
import { Z } from "./layout";

// What the 3D night shop shows this frame (shop 3D design 4-6), worked out from the night's state alone so
// it can be tested without WebGL: the same rules the 2D ServiceScene drew with, less the counter grills
// (gone, user 2026-10-16): a dish on the counter while its guest eats, leftovers where a messy guest sat,
// and a stool only where no one sits (the seated pictures carry their own stool). x stays in the rules'
// 960-wide game pixels; ShopView maps it into the room.

export type Pose = "stand" | "walk" | "carry" | "serve" | "scrub" | "grind" | "pour";
export type Glow = { kind: "pass" } | { kind: "drinks" } | { kind: "coal" } | { kind: "seat"; seat: number; mess: boolean } | { kind: "guest"; id: string };
// What the action key does at the nearest thing (shop remake step 3): a bubble over it says so, grey with
// the reason when it cannot right now.
export type PromptVerb = "take" | "give" | "scrub" | "coal" | "pour";
export type PromptWhy = "handsFull" | "cooking" | "otherDish" | "noDrink";
export interface Prompt {
  at: { kind: "pass" } | { kind: "drinks" } | { kind: "coal" } | { kind: "seat"; seat: number };
  verb: PromptVerb;
  ok: boolean;
  why: PromptWhy | null;
}
export type PatienceTier = "ok" | "warn" | "late";
export type ServeGrade = "fast" | "good" | "late";
export interface GuestLook {
  id: string;
  tex: string;
  x: number;
  z: number;
  flip: boolean;
  bubble: { icon: string; patience: number; shake: boolean } | null;
}
export interface SeatLook {
  x: number;
  stool: boolean;
  plate: string | null;
  mess: boolean;
}
export interface ShopLook {
  waiter: { x: number; flip: boolean; pose: Pose; carried: string | null };
  guests: GuestLook[];
  seats: SeatLook[];
  pass: string[];
  bandal: string;
  coal: number;
  pour: number | null;
  glow: Glow | null;
  prompt: Prompt | null;
  plates: Record<string, number>;
  served: number;
  gold: number;
  platesLeft: number;
}

export const YOKAI = ["dokkaebi", "gumiho", "reaper", "ghost"] as const;
const DRINK = { tea: "prop_cup_tea", cider: "prop_cup_cider", sikhye: "prop_bowl_sikhye" } as const;
const WALKING: Guest["phase"][] = ["queue", "walk", "leaving"];

function guestTex(g: Guest, time: number): { tex: string; flip: boolean } {
  const who = YOKAI[g.kind];
  const step = Math.floor(time / 220) % 2;
  switch (g.phase) {
    case "queue":
    case "walk":
      return { tex: `yk_${who}_walk_${g.phase === "walk" ? step : 0}`, flip: false };
    case "eating":
      return { tex: `yk_${who}_${Math.floor(time / 300) % 2 ? "eat" : "sit"}`, flip: false };
    case "thirsty":
      return { tex: `yk_${who}_happy`, flip: false };
    case "leaving":
      return g.angry ? { tex: `yk_${who}_angry`, flip: false } : { tex: `yk_${who}_walk_${step}`, flip: true };
    default:
      return { tex: `yk_${who}_sit`, flip: false };
  }
}

// the bubble: leftovers to clear before ordering, the dish (patience filling), the tea asked for with it,
// the cider or sikhye after the meal
function bubbleOf(shift: Shift, g: Guest): GuestLook["bubble"] {
  const seat = g.seat !== null ? shift.s.seats[g.seat] : null;
  const dirty = g.phase === "seated" && !g.ordered && !!seat?.dirty;
  const wantsDish = g.phase === "seated" && g.ordered && g.servedMs === null;
  const wantsTea = g.drink === "tea" && !g.pour && g.ordered && (g.phase === "seated" || g.phase === "eating");
  const wantsAfter = g.phase === "thirsty" && (g.drink === "cider" || g.drink === "sikhye");
  if (!dirty && !wantsDish && !wantsTea && !wantsAfter) return null;
  const icon = dirty ? "prop_plate_dirty" : wantsDish ? `dish_${g.dish}` : wantsTea ? DRINK.tea : DRINK[g.drink as "cider" | "sikhye"];
  const patience = wantsDish || dirty ? Math.min(1, g.waitedMs / g.patienceMs) : 0;
  return { icon, patience, shake: patience > 0.75 || dirty };
}

const can = (at: Prompt["at"], verb: PromptVerb): Prompt => ({ at, verb, ok: true, why: null });
const cannot = (at: Prompt["at"], verb: PromptVerb, why: PromptWhy): Prompt => ({ at, verb, ok: false, why });

export function promptOf(shift: Shift): Prompt | null {
  const s = shift.s;
  const t = shift.target();
  if (!t) return null;
  const full = s.tray.length >= CARRY;
  switch (t.kind) {
    case "pass":
      if (!s.pass.length) return s.kitchen.length ? cannot(t, "take", "cooking") : null;
      return full ? cannot(t, "take", "handsFull") : can(t, "take");
    case "coal":
      return s.coal < 100 ? can(t, "coal") : null;
    case "drinks":
      if (!s.pouring && shift.drinkWanted() === null) return cannot(t, "pour", "noDrink");
      return full && !s.pouring ? cannot(t, "pour", "handsFull") : can(t, "pour");
    case "seat": {
      const at = { kind: "seat" as const, seat: t.seat };
      const seat = s.seats[t.seat];
      if (seat.dirty) return can(at, "scrub");
      const g = s.guests.find((x) => x.id === seat.guest);
      if (!g) return null;
      if (shift.giftFor(g) >= 0) return can(at, "give");
      const wantsDish = g.phase === "seated" && g.ordered && g.servedMs === null;
      return wantsDish && s.tray.some((i) => i.kind === "dish") ? cannot(at, "give", "otherDish") : null;
    }
  }
}

// the bubble's patience colour: green, yellow from half, red from three quarters
export const patienceTier = (p: number): PatienceTier => (p < 0.5 ? "ok" : p < 0.75 ? "warn" : "late");

// how a guest takes their dish, by the share of their patience the wait used: only a reaction, the tip
// does not depend on it (shared/service/settle tipFor)
export const serveGrade = (ratio: number): ServeGrade => (ratio < 0.4 ? "fast" : ratio < 0.75 ? "good" : "late");

function glowOf(shift: Shift): Glow | null {
  const target = shift.canAct() ? shift.target() : null;
  if (!target) return null;
  if (target.kind !== "seat") return { kind: target.kind };
  const seat = shift.s.seats[target.seat];
  if (seat.dirty) return { kind: "seat", seat: target.seat, mess: true };
  return seat.guest ? { kind: "guest", id: seat.guest } : null;
}

export function lookAt(shift: Shift, time: number, moveX: number, hold: { poseUntil: number; busy: Pose }): ShopLook {
  const s = shift.s;
  const item = s.tray[0];
  const pose: Pose = s.pouring ? "pour" : s.busyMs > 0 ? hold.busy : time < hold.poseUntil ? "serve" : moveX !== 0 ? (item ? "carry" : "walk") : "stand";
  const cooking = s.kitchen[0]?.started;
  return {
    waiter: { x: s.x, flip: s.facing < 0, pose, carried: item ? (item.kind === "dish" ? `dish_${item.dish}` : DRINK[item.drink]) : null },
    guests: s.guests
      .filter((g) => g.phase !== "gone")
      .map((g) => ({ id: g.id, ...guestTex(g, time), x: g.x, z: WALKING.includes(g.phase) ? Z.walk : Z.seated, bubble: bubbleOf(shift, g) })),
    seats: s.seats.map((seat) => {
      const g = s.guests.find((x) => x.id === seat.guest);
      return { x: seat.x, stool: !g || g.phase === "walk", plate: g && g.phase === "eating" ? `dish_${g.dish}` : null, mess: seat.dirty };
    }),
    pass: s.pass.map((d) => `dish_${d}`),
    bandal: cooking ? (Math.floor(time / 300) % 2 ? "bandal_grill" : "bandal_turn") : Math.floor(time / 900) % 2 ? "bandal_breathe" : "bandal_idle",
    coal: s.coal,
    pour: s.pouring ? s.pouring.fill : null,
    glow: glowOf(shift),
    prompt: promptOf(shift),
    plates: { ...s.plates } as Record<string, number>,
    served: s.guests.filter((g) => g.servedMs !== null).length,
    gold: shift.earned(),
    platesLeft: shift.platesLeft(),
  };
}
