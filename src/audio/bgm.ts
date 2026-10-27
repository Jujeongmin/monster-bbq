import { sfx } from "./sfx";

// The background music (user-picked, CC BY 4.0, credited in src/screens/credits.ts): one track per scene,
// looping, quieter than the sounds. Files are bgm/<scene>_<source>_<title>.mp3. Like the sounds it waits for
// the player's first key or tap, and the night shop's mute button silences it too. A scene with no track is
// quiet.
export type Track = "day" | "night" | "hunt";

interface Player {
  play: () => unknown;
  pause: () => void;
  volume: number;
  loop: boolean;
  release?: () => void;
}
interface Deps {
  urls: Partial<Record<Track, string>>;
  make: (url: string) => Player;
  isMuted: () => boolean;
}

const VOLUME = 0.3;

export function makeBgm(d: Deps) {
  let unlocked = false;
  let wanted: Track | null = null;
  let playing: { track: Track; p: Player } | null = null;
  // a tune stopped lets go of its file too (an element only paused keeps its buffered audio until collected)
  const stop = () => {
    if (playing) {
      playing.p.pause();
      playing.p.release?.();
    }
    playing = null;
  };
  // play what the scene wants, if allowed and not already playing
  const sync = () => {
    const url = wanted ? d.urls[wanted] : undefined;
    if (!unlocked || d.isMuted() || !url || !wanted) return stop();
    if (playing?.track === wanted) return;
    stop();
    const p = d.make(url);
    p.loop = true;
    p.volume = VOLUME;
    Promise.resolve(p.play()).catch(() => {});
    playing = { track: wanted, p };
  };
  return {
    unlock: () => ((unlocked = true), sync()),
    set: (track: Track | null) => ((wanted = track), sync()),
    // after muting or unmuting
    refresh: sync,
  };
}

const FILES = import.meta.glob("../../bgm/*.mp3", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const URLS: Partial<Record<Track, string>> = Object.fromEntries(Object.entries(FILES).map(([path, url]) => [path.split("/").pop()!.split("_")[0], url]));

// an element let go of drops its source, so the browser frees what it buffered
const element = (url: string) => Object.assign(new Audio(url), { release(this: HTMLAudioElement) { this.removeAttribute("src"); this.load(); } });
export const bgm = makeBgm({ urls: URLS, make: element, isMuted: () => sfx.isMuted() });

if (typeof window !== "undefined") {
  const first = () => (bgm.unlock(), removeEventListener("pointerdown", first, true), removeEventListener("keydown", first, true));
  addEventListener("pointerdown", first, true);
  addEventListener("keydown", first, true);
}
