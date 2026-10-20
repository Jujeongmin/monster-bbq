import type { Shift, ShiftEvent } from "../game/service/shift";
import type { LidFace } from "./dialogue/Dialogue";

// The lid's one-line tips, each shown the first time its moment comes (shop remake step 3): which one is
// due, and which were seen. Seen tips are a convenience of this browser, not progress (a new device just
// shows them once more), so they live in local storage and a blocked storage only means no memory.

export type TipId = "open" | "cooked" | "carry" | "coalLow" | "drink" | "mess" | "angry" | "charcoal" | "awakenApp";

export const COAL_LOW = 30;
const KEY = "monster-bbq:tips";

export const TIP_FACE: Record<Exclude<TipId, "awakenApp">, LidFace> = {
  open: "smug",
  cooked: "normal",
  carry: "normal",
  coalLow: "surprised",
  drink: "normal",
  mess: "angry",
  angry: "angry",
  charcoal: "smug",
};

export function readSeen(store: Pick<Storage, "getItem"> | null): Set<TipId> {
  try {
    const v: unknown = JSON.parse(store?.getItem(KEY) ?? "[]");
    return new Set(Array.isArray(v) ? (v.filter((x) => typeof x === "string") as TipId[]) : []);
  } catch {
    return new Set();
  }
}

export function markSeen(store: Pick<Storage, "getItem" | "setItem"> | null, id: TipId): void {
  try {
    const seen = readSeen(store);
    seen.add(id);
    store?.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    // blocked storage: the tip may show again another time, nothing worse
  }
}

// The night's tip due now, if any: the opening one first, then whichever moment came first in this order.
export function nightTipDue(shift: Shift, events: ShiftEvent[], seen: ReadonlySet<TipId>): TipId | null {
  const s = shift.s;
  const due: [TipId, boolean][] = [
    ["open", true],
    ["angry", events.some((e) => e.type === "angry")],
    ["cooked", events.some((e) => e.type === "cooked")],
    ["carry", events.some((e) => e.type === "take")],
    ["mess", s.seats.some((st) => st.dirty)],
    ["coalLow", s.coal < COAL_LOW],
    ["drink", shift.drinkWanted() !== null],
  ];
  return due.find(([id, now]) => now && !seen.has(id))?.[0] ?? null;
}
