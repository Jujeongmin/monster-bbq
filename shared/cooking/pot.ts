import { BALANCE } from "../balance";
import { ITEMS, parseItemKey, type ItemId } from "../content/items";
import type { CookJudgement, NoteId } from "./notes";

// The stew pot (cooking-service design 2): a dial (off, low, mid, high), a lid, scum to skim, things
// that need their own time. Pure: every change returns a new pot.
const T = BALANCE.cooking.pot;
const ITEM = BALANCE.cooking.items;
const FRAME_MS = 50;
const BOIL = 99.5;

export type Dial = 0 | 1 | 2 | 3;

export interface PotItem {
  key: string;
  cooked: number;
  order: number;
}

export interface Pot {
  temp: number;
  dial: Dial;
  lid: boolean;
  foam: number;
  // scum the meat has given up so far (it runs out: 1 in all)
  foamMade: number;
  skims: number;
  boilOvers: number;
  fullBoilMs: number;
  items: PotItem[];
}

export function newPot(): Pot {
  return { temp: 20, dial: 0, lid: false, foam: 0, foamMade: 0, skims: 0, boilOvers: 0, fullBoilMs: 0, items: [] };
}

const idOf = (key: string): ItemId => parseItemKey(key)!.id;
const isMeat = (key: string) => ITEMS[idOf(key)].kind === "part" && !ITEM[idOf(key)].soft;

// `quality` (upgrades): a better pot holds a rolling boil longer before it spills.
function step(p: Pot, ms: number, quality: number): Pot {
  const target = T.target[p.dial];
  const rate = p.dial === 0 ? T.coolPerSec : T.heatPerSec[p.dial] * (p.lid ? T.lidBoost : 1);
  const move = (rate * ms) / 1000;
  let temp = p.temp < target ? Math.min(target, p.temp + move) : Math.max(target, p.temp - move);
  let { fullBoilMs, boilOvers } = p;
  // a rolling boil on high climbs the pot and spills over (a lid traps it sooner)
  if (temp >= BOIL && p.dial === 3) fullBoilMs += ms;
  else fullBoilMs = 0;
  if (fullBoilMs >= (p.lid ? T.boilOverMs / 2 : T.boilOverMs) * quality) {
    boilOvers += 1;
    fullBoilMs = 0;
    temp -= 5;
  }
  const cooking = temp >= T.cookFrom;
  let { foam, foamMade } = p;
  if (cooking && p.items.some((i) => isMeat(i.key)) && foamMade < 1) {
    const more = Math.min(1 - foamMade, (T.foamPerSec * ms) / 1000);
    foam = Math.min(1, foam + more);
    foamMade += more;
  }
  const items = cooking ? p.items.map((i) => ({ ...i, cooked: i.cooked + (ITEM[idOf(i.key)].potRate * ms) / 1000 })) : p.items;
  return { ...p, temp, fullBoilMs, boilOvers, foam, foamMade, items };
}

// Time passes (in steps of at most 50 ms, so a long frame cooks like many short ones).
export function stepPot(p: Pot, dt: number, quality = 1): Pot {
  if (!(dt > 0)) return p;
  let out = p;
  for (let t = 0; t < dt; t += FRAME_MS) out = step(out, Math.min(FRAME_MS, dt - t), quality);
  return out;
}

export const addToPot = (p: Pot, key: string): Pot => ({ ...p, items: [...p.items, { key, cooked: 0, order: p.items.length }] });
export const setDial = (p: Pot, dial: Dial): Pot => ({ ...p, dial });
export const toggleLid = (p: Pot): Pot => ({ ...p, lid: !p.lid });
// One pass of the ladle across the broth.
export const skim = (p: Pot): Pot => ({ ...p, foam: Math.max(0, p.foam - T.skimAmount), skims: p.skims + 1 });

// Meat in a stew forgives long cooking; vegetables and mushrooms fall apart.
function itemScore(i: PotItem): number {
  const c = i.cooked;
  if (isMeat(i.key)) {
    if (c < 0.5) return 0;
    if (c < 0.9) return (c - 0.5) / 0.4;
    if (c <= 2.5) return 1;
    return Math.max(0.5, 1 - ((c - 2.5) / 1.5) * 0.5);
  }
  if (c < 0.4) return 0;
  if (c < 0.8) return (c - 0.4) / 0.4;
  if (c <= 1.5) return 1;
  return Math.max(0.2, 1 - ((c - 1.5) / 1) * 0.8);
}

export function judgePot(p: Pot): CookJudgement {
  if (p.items.length === 0) return { accuracy: 0, notes: [] };
  const notes: NoteId[] = [];
  let acc = p.items.reduce((a, i) => a + itemScore(i), 0) / p.items.length;
  if (p.items.some((i) => itemScore(i) < 0.6 && i.cooked < 1)) notes.push("undercooked");
  if (p.items.some((i) => !isMeat(i.key) && i.cooked > 1.5)) notes.push("mushy");
  if (p.foam >= 0.3) notes.push("foamy");
  acc -= p.foam * 0.3;
  if (p.boilOvers > 0) {
    notes.push("boilOver");
    acc -= 0.1 * p.boilOvers;
  }
  if (p.skims > 0 && p.foam < 0.1) {
    notes.push("clear");
    acc += 0.05;
  }
  return { accuracy: Math.max(0, Math.min(1, acc)), notes };
}
