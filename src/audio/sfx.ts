// The game's sound effects (shop remake step 3), all in one place: Mixkit files in sfx/<name>.mp3, approved
// before they go in. Nothing plays before the player's first key or tap (browsers block it), while muted, or
// for a sound whose file is not in yet; the same sound does not stack within 80 ms. Muting is remembered
// on this browser (a blocked storage only forgets it).

export type Sfx = "order" | "tick" | "cooked" | "take" | "coin" | "angry" | "pourPerfect" | "pourGood" | "pourBad" | "coal" | "coalOut" | "scrub" | "scrubDone" | "bell";

interface Player {
  play: () => unknown;
  volume: number;
}
interface Deps {
  urls: Partial<Record<Sfx, string>>;
  make: (url: string) => Player;
  store: Pick<Storage, "getItem" | "setItem"> | null;
  now: () => number;
}

const KEY = "monster-bbq:mute";
const GAP_MS = 80;

export function makeSfx(d: Deps) {
  let unlocked = false;
  let muted: boolean;
  try {
    muted = d.store?.getItem(KEY) === "1";
  } catch {
    muted = false;
  }
  const last = new Map<Sfx, number>();
  return {
    unlock: () => void (unlocked = true),
    isMuted: () => muted,
    setMuted(m: boolean) {
      muted = m;
      try {
        d.store?.setItem(KEY, m ? "1" : "0");
      } catch {
        // blocked storage: muted for now, not remembered
      }
    },
    play(name: Sfx) {
      const url = d.urls[name];
      if (!unlocked || muted || !url) return;
      const t = d.now();
      if (t - (last.get(name) ?? -Infinity) < GAP_MS) return;
      last.set(name, t);
      const p = d.make(url);
      p.volume = 0.6;
      Promise.resolve(p.play()).catch(() => {});
    },
  };
}

const FILES = import.meta.glob("../../sfx/*.mp3", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const URLS: Partial<Record<Sfx, string>> = Object.fromEntries(Object.entries(FILES).map(([path, url]) => [path.split("/").pop()!.replace(".mp3", ""), url]));

const storage = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

export const sfx = makeSfx({ urls: URLS, make: (url) => new Audio(url), store: storage(), now: () => performance.now() });
