import { useEffect, useState } from "react";
import { allArtUrls, artUrl } from "../game/art";
import { t } from "../i18n";
import { loadFile, loadImage, pageCssUrls, runAll } from "../preload";

const SOUNDS = Object.values(
  import.meta.glob(["../../bgm/*.mp3", "../../sfx/*.mp3"], { eager: true, query: "?url", import: "default" }) as Record<string, string>,
);
// a few files at a time: enough to fill a phone's connection without starving the first ones
const AT_ONCE = 6;

// The loading screen (mobile pass, user 2026-10-22): the lid over the kit's gauge while every picture, sound
// and tune is fetched (preload.ts), then the game. Nothing loads mid-game after it.
export function Loading({ onDone }: { onDone: () => void }) {
  const [part, setPart] = useState(0);
  useEffect(() => {
    let live = true;
    const pictures = [...new Set([...allArtUrls(), ...pageCssUrls()])];
    const all = [...pictures.map((url) => ({ url, image: true })), ...SOUNDS.map((url) => ({ url, image: false }))];
    const byUrl = new Map(all.map((f) => [f.url, f.image]));
    runAll(
      all.map((f) => f.url),
      (url) => (byUrl.get(url) ? loadImage(url) : loadFile(url)),
      (done, total) => live && setPart(total ? done / total : 1),
      AT_ONCE,
    ).then(() => live && onDone());
    return () => {
      live = false;
    };
  }, []);
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
