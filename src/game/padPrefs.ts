// The touch pad's size and shade (Dave the Diver mobile's button settings, user 2026-10-22): one choice per
// device, kept in local storage like the auto-mash switch, read by the hunt and the shop alike.
export type PadSize = "small" | "normal" | "big";
export type PadAlpha = "solid" | "normal" | "faint";
export interface PadPrefs {
  size: PadSize;
  alpha: PadAlpha;
}

export const PAD_SCALE: Record<PadSize, number> = { small: 0.75, normal: 1, big: 1.25 };
export const PAD_ALPHA: Record<PadAlpha, number> = { solid: 1, normal: 0.8, faint: 0.55 };
// the stick while nobody holds it: fainter still, out of the way (Dave mobile's invisible stick)
export const IDLE_STICK_ALPHA = 0.45;

const KEY = "monster-bbq:pad";
export const SIZES: PadSize[] = ["small", "normal", "big"];
export const ALPHAS: PadAlpha[] = ["solid", "normal", "faint"];
const DEFAULT: PadPrefs = { size: "normal", alpha: "normal" };

type Store = Pick<Storage, "getItem" | "setItem">;

export function readPadPrefs(store: Store | null): PadPrefs {
  try {
    const p = JSON.parse(store?.getItem(KEY) ?? "null") as Partial<PadPrefs> | null;
    return {
      size: SIZES.includes(p?.size as PadSize) ? (p!.size as PadSize) : DEFAULT.size,
      alpha: ALPHAS.includes(p?.alpha as PadAlpha) ? (p!.alpha as PadAlpha) : DEFAULT.alpha,
    };
  } catch {
    return { ...DEFAULT };
  }
}

// sent on the window when a choice changes, for a screen already showing the pad (the day's shop)
export const PAD_EVENT = "monster-bbq:pad";

export function writePadPrefs(store: Store | null, p: PadPrefs): void {
  try {
    store?.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage blocked: the choice lasts this visit only
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<PadPrefs>(PAD_EVENT, { detail: p }));
}

// the next choice of one setting, round and round
export function nextPadPrefs(p: PadPrefs, which: keyof PadPrefs): PadPrefs {
  if (which === "size") return { ...p, size: SIZES[(SIZES.indexOf(p.size) + 1) % SIZES.length] };
  return { ...p, alpha: ALPHAS[(ALPHAS.indexOf(p.alpha) + 1) % ALPHAS.length] };
}

// the page's storage, or none (an embed with storage blocked)
export const pageStore = (): Store | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};
