import { BALANCE } from "../balance";
import { ITEMS, parseItemKey, type ItemId } from "../content/items";
import type { CookJudgement, NoteId } from "./notes";

// The Korean BBQ grill plate (cooking-service design 2). Coordinates are relative to the plate: the
// centre is (0, 0) and the rim is radius 1, +y toward the fat spout. Doneness 1 = just right; the side
// touching the plate cooks, the top only shows it once flipped. Pure: every change returns a new grill.
const T = BALANCE.cooking.grill;
const ITEM = BALANCE.cooking.items;
const FRAME_MS = 50;

export interface GrillPiece {
  id: string;
  key: string;
  x: number;
  y: number;
  down: number;
  up: number;
  flips: number;
  cut: boolean;
  cutFace: number;
  cutEarly: boolean;
  stuck: boolean;
  char: number;
  fried: number;
  sootSeen: number;
  // doneness of the inside: follows the outside with a lag (thick cuts lag more), catches up on the board
  core: number;
  // pinches of salt, and whether any went on before cooking (salting first draws moisture out, so the
  // surface browns better)
  salt: number;
  saltEarly: boolean;
  // resting on the wooden board, off the heat
  onBoard: boolean;
  restMs: number;
}

export interface Grill {
  heat: number;
  soot: number;
  fat: number;
  pieces: GrillPiece[];
}

export function newGrill(): Grill {
  return { heat: 0, soot: 0, fat: 0, pieces: [] };
}

// 1 in the middle, edgeHeat at the rim: done meat moved outward keeps warm without burning.
export function heatAt(x: number, y: number): number {
  return 1 - (1 - T.edgeHeat) * Math.min(1, x * x + y * y);
}

const idOf = (p: GrillPiece): ItemId => parseItemKey(p.key)!.id;

function onPlate(x: number, y: number): { x: number; y: number } {
  const r = Math.hypot(x, y);
  return r <= 1 ? { x, y } : { x: (x / r) * 0.98, y: (y / r) * 0.98 };
}

// the inside closing in on the outside over `ms` with time constant `tau`
const follow = (core: number, surface: number, ms: number, tau: number) => (tau <= 0 ? surface : core + (surface - core) * (1 - Math.exp(-ms / tau)));
const surfaceOf = (p: GrillPiece) => (p.up + p.down) / 2;

function step(g: Grill, ms: number): Grill {
  const heat = Math.min(1, g.heat + ms / T.preheatMs);
  let soot = g.soot;
  let fat = g.fat;
  const pieces = g.pieces.map((p) => {
    const id = idOf(p);
    const it = ITEM[id];
    // on the board: no heat from below; the rest carries the heat inward
    if (p.onBoard) return { ...p, core: follow(p.core, surfaceOf(p), ms, T.restLagMs * it.thick), restMs: p.restMs + ms };
    const h = heatAt(p.x, p.y) * heat;
    const down = p.down + (it.grillRate * h * ms) / T.sideMs;
    let char = p.char;
    if (down > it.burnAt) {
      const burnt = Math.min(1 - char, (it.grillRate * h * ms) / T.charMs);
      char += burnt;
      soot += burnt * T.sootPerChar;
    }
    if (id === "boar_belly" && down > 0.3) fat += (T.fatPerSec * h * ms) / 1000;
    const garnish = id === "wild_garlic" || id === "shiitake";
    const fried = garnish && p.y > T.fatZoneY && fat >= T.fatNeeded ? Math.min(1, p.fried + (h * ms) / T.friedMs) : p.fried;
    const cutFace = p.cut ? Math.min(1, p.cutFace + (h * ms) / T.cutFaceMs) : p.cutFace;
    // cut on the grill, the faces sear and the inside cooks much sooner
    const core = follow(p.core, (p.up + down) / 2, ms, T.coreLagMs * it.thick * (p.cut ? 0.3 : 1));
    return { ...p, down, char, fried, cutFace, core };
  });
  soot = Math.min(1, soot + (fat * T.sootPerFatSec * ms) / 1000);
  fat = Math.min(1, fat);
  return { heat, soot, fat, pieces: pieces.map((p) => ({ ...p, sootSeen: Math.max(p.sootSeen, soot) })) };
}

// Time passes (in steps of at most 50 ms, so a long frame cooks like many short ones).
export function stepGrill(g: Grill, dt: number): Grill {
  if (!(dt > 0)) return g;
  let out = g;
  for (let t = 0; t < dt; t += FRAME_MS) out = step(out, Math.min(FRAME_MS, dt - t));
  return out;
}

const update = (g: Grill, id: string, f: (p: GrillPiece) => GrillPiece): Grill => ({ ...g, pieces: g.pieces.map((p) => (p.id === id ? f(p) : p)) });

// Laid on the plate (pulled back onto it if dropped past the rim). A plate not hot enough yet grabs it.
export function placePiece(g: Grill, id: string, key: string, x: number, y: number): Grill {
  const at = onPlate(x, y);
  const p: GrillPiece = { id, key, ...at, down: 0, up: 0, flips: 0, cut: false, cutFace: 0, cutEarly: false, stuck: g.heat < T.stickBelow, char: 0, fried: 0, sootSeen: g.soot, core: 0, salt: 0, saltEarly: false, onBoard: false, restMs: 0 };
  return { ...g, pieces: [...g.pieces, p] };
}

export const flipPiece = (g: Grill, id: string): Grill => update(g, id, (p) => ({ ...p, up: p.down, down: p.up, flips: p.flips + 1 }));
export const movePiece = (g: Grill, id: string, x: number, y: number): Grill => update(g, id, (p) => ({ ...p, ...onPlate(x, y), onBoard: false }));
// Onto the wooden board beside the grill to rest.
export const restPiece = (g: Grill, id: string): Grill => update(g, id, (p) => ({ ...p, onBoard: true }));
// One pinch from the shaker; counts as salting first while it is still raw.
export const saltPiece = (g: Grill, id: string): Grill =>
  update(g, id, (p) => ({ ...p, salt: p.salt + 1, saltEarly: p.saltEarly || Math.max(p.up, p.down) < T.saltEarlyBelow }));
// Scissors: bite-size pieces. Cut while either side is still half raw and the juice runs out.
export const cutPiece = (g: Grill, id: string): Grill =>
  update(g, id, (p) => (p.cut ? p : { ...p, cut: true, cutEarly: Math.min(p.up, p.down) < T.cutReady && !ITEM[idOf(p)].oneSide }));
export const removePiece = (g: Grill, id: string): Grill => ({ ...g, pieces: g.pieces.filter((p) => p.id !== id) });
// A fresh plate: clean, but cooler (it has to heat up again).
export const replaceGrill = (g: Grill): Grill => ({ ...g, soot: 0, fat: 0, heat: g.heat * 0.5 });

// The cue to flip: juice beading on top once the bottom is nearly done.
export const juicy = (p: GrillPiece): boolean => p.down >= 0.75 && p.up < 0.5;

// How good one side is: nothing raw, full marks in the right window, then falling as it overcooks.
function sideScore(d: number): number {
  if (d < 0.4) return 0;
  if (d < 0.85) return (d - 0.4) / 0.45;
  if (d <= 1.25) return 1;
  if (d < 1.8) return 1 - ((d - 1.25) / 0.55) * 0.7;
  return 0.3;
}

export function judgePiece(p: GrillPiece): CookJudgement {
  const id = idOf(p);
  const it = ITEM[id];
  const meat = ITEMS[id].kind === "part" && !it.oneSide;
  const sides = it.oneSide ? [Math.max(p.up, p.down)] : [p.up, p.down];
  let acc = sides.reduce((a, d) => a + sideScore(d), 0) / sides.length;
  const notes: NoteId[] = [];
  const mark = (note: NoteId, change: number) => {
    acc += change;
    if (!notes.includes(note)) notes.push(note);
  };
  acc -= p.char * 0.5;
  if (p.char > 0.15 || Math.max(...sides) > 1.6) mark("burnt", 0);
  if (Math.min(...sides) < 0.6) mark("raw", 0);
  if (p.stuck) mark("stuck", -0.15);
  if (!it.oneSide && p.flips >= 3) mark("manyFlips", -0.05 * (p.flips - 2));
  if (p.cutEarly) mark("cutEarly", -0.1);
  if (p.cut && p.cutFace < T.cutReady) mark("raw", -0.1);
  if (meat && !p.cut) mark("uncut", -0.05);
  if (p.sootSeen > 0.3) mark("soot", -0.2 * p.sootSeen);
  if (it.thick > 0 && p.core < 0.85 && Math.min(...sides) >= 0.6) mark("insideRaw", -0.15);
  if (p.salt > T.saltMax) mark("salty", -0.15);
  if (p.saltEarly && p.salt <= T.saltMax) mark("saltFirst", 0.08);
  if (it.thick > 0 && p.restMs >= T.restNeededMs) mark("rested", 0.05);
  if (!it.oneSide && p.flips === 1) mark("onceFlip", 0.05);
  if (p.fried >= 1) mark("fatFried", 0.1);
  const praise: NoteId[] = ["onceFlip", "fatFried", "rested", "saltFirst"];
  const flawless = sides.every((d) => sideScore(d) >= 0.9) && notes.every((n) => praise.includes(n));
  if (flawless) notes.unshift("perfect");
  return { accuracy: Math.max(0, Math.min(1, acc)), notes };
}

// Whether `key` can join a plate already holding `keys`: up to maxIngredients different items, each once
// (what the research kitchen's cook action accepts).
export function canPlate(keys: string[], key: string): boolean {
  const item = parseItemKey(key);
  if (!item) return false;
  const ids = keys.map((k) => parseItemKey(k)?.id);
  return !ids.includes(item.id) && ids.length < BALANCE.kitchen.maxIngredients;
}
