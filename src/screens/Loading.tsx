import { useEffect, useState, type ReactNode } from "react";
import { allArtUrls, artUrl } from "../game/art";
import { isStoryArt } from "./story/story";
import { loadGameChunks } from "../game/lazy";
import { t } from "../i18n";
import { loadFile, loadImage, pageCssUrls, runAll } from "../preload";

const SOUNDS = Object.values(import.meta.glob("../../sfx/*.mp3", { eager: true, query: "?url", import: "default" }) as Record<string, string>);
// the music (half of all the game's bytes) does not hold the loading screen (user 2026-10-28: loading too
// long): a tune streams as it plays, and all of them are fetched one by one in the background afterwards
const MUSIC = Object.values(import.meta.glob("../../bgm/*.mp3", { eager: true, query: "?url", import: "default" }) as Record<string, string>);
// files at a time: the count of files, not their size, held the loading screen (user 2026-10-30)
const AT_ONCE = 12;

// The pictures only the hunt shows (user 2026-10-30, loading by screen): the hunter, the monsters, the
// fields and what stands on them, the stamina ring. Fetched right after the loading screen, the hunt waiting
// on them (HuntArt) only if they are not in yet.
const HUNT_ART = ["hunter", "rabbit", "chicken", "boar", "frog", "crab", "snake", "bee", "bat", "objects", "bg", "hunt", "ui/stamina"].map((f) => `test/${f}/`);
export const isHuntArt = (path: string): boolean => HUNT_ART.some((f) => path.startsWith(f));

// the hunt's pictures: how many are in, and when all are
const hunt = { done: 0, total: 0, ready: null as Promise<void> | null };
const huntSeen = new Set<() => void>();
function loadHuntArt(): Promise<void> {
  if (!hunt.ready) {
    const urls = allArtUrls(isHuntArt);
    hunt.total = urls.length;
    hunt.ready = runAll(
      urls,
      loadImage,
      (done) => ((hunt.done = done), huntSeen.forEach((f) => f())),
      AT_ONCE,
    );
  }
  return hunt.ready;
}

// After the loading screen, quietly: the hunt's pictures, the story's (a scene also waits for its own),
// then the music.
function loadTheRest() {
  void loadHuntArt()
    .then(() => runAll(allArtUrls(isStoryArt), loadImage, () => {}, AT_ONCE))
    .then(() => runAll(MUSIC, loadFile, () => {}, 1));
}

// The lid over the kit's gauge.
function LoadingView({ part }: { part: number }) {
  const pct = Math.round(part * 100);
  return (
    <div className="loading" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <img className="loading-lid" src={artUrl("test/lid/normal.png")} alt="" />
      <div className="loading-gauge">
        <div className="loading-gauge-full" style={{ width: `${pct}%` }} />
      </div>
      <p className="loading-text">
        {t("loading.text")} {pct}%
      </p>
    </div>
  );
}

// The loading screen (mobile pass, user 2026-10-22): the lid over the kit's gauge while the pictures the
// day and the night show, the sound effects and the Phaser part of the game are fetched (preload.ts), then
// the game; the hunt's pictures, the story's (only a new player sees them, user 2026-10-28) and the music
// follow in the background.
export function Loading({ onDone }: { onDone: () => void }) {
  const [part, setPart] = useState(0);
  useEffect(() => {
    let live = true;
    const pictures = [...new Set([...allArtUrls((p) => !isStoryArt(p) && !isHuntArt(p)), ...pageCssUrls()])];
    const all = [...pictures.map((url) => ({ url, image: true })), ...SOUNDS.map((url) => ({ url, image: false }))];
    const byUrl = new Map(all.map((f) => [f.url, f.image]));
    Promise.all([
      runAll(
        all.map((f) => f.url),
        (url) => (byUrl.get(url) ? loadImage(url) : loadFile(url)),
        (done, total) => live && setPart(total ? done / total : 1),
        AT_ONCE,
      ),
      loadGameChunks().catch(() => {}),
    ]).then(() => {
      if (!live) return;
      onDone();
      loadTheRest();
    });
    return () => {
      live = false;
    };
  }, []);
  return <LoadingView part={part} />;
}

// The hunt, once its pictures are in: the same gauge for the moment they are still coming (a hunt started
// straight after the loading screen, or a reload in the middle of one).
export function HuntArt({ children }: { children: ReactNode }) {
  const [, redraw] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    const seen = () => live && redraw((n) => n + 1);
    huntSeen.add(seen);
    void loadHuntArt().then(() => live && setReady(true));
    return () => {
      live = false;
      huntSeen.delete(seen);
    };
  }, []);
  return ready ? <>{children}</> : <LoadingView part={hunt.total ? hunt.done / hunt.total : 0} />;
}
