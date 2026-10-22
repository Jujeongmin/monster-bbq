// First, before anything reaches for storage: @agent8/gameserver touches localStorage while its
// module is being evaluated. See storageFallback.ts.
import "./storageFallback";

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { RotatePrompt } from "./screens/hud/RotatePrompt";
import { Loading } from "./screens/Loading";
import { detectLocale, setLocale } from "./i18n";
import "./index.css";

setLocale(detectLocale(location.search, navigator.language));

// Phaser draws its text once into a canvas: the pixel fonts must be ready before the first scene, or it
// keeps the fallback face. A missing font only costs the look, so the game starts anyway.
const fonts = ["12px Galmuri11", "bold 12px Galmuri11", "10px Galmuri9"].map((f) => document.fonts.load(f).catch(() => []));
// The game is landscape: everything lives in one 16:9 frame, letterboxed in whatever window it gets.
// The UI's pixel scale (--s) is the frame width in whole multiples of the game's 640 px, so pixel art and
// pixel fonts stay crisp.
// On a small touch screen (a phone, --s 1) the smallest lettering is too small to read (mobile pass, user
// 2026-10-21): it goes up to 12 px, set in Galmuri11 (crisp at 12) in place of Galmuri9 (crisp at 10).
const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0 || new URLSearchParams(location.search).has("touch");
function fitFrame() {
  const width = Math.min(window.innerWidth, (window.innerHeight * 16) / 9);
  const s = Math.max(1, Math.floor(width / 640));
  document.documentElement.style.setProperty("--s", String(s));
  document.documentElement.classList.toggle("touch-small", touch && s === 1);
}
fitFrame();
window.addEventListener("resize", fitFrame);
// on a phone the small face is Galmuri11's file under Galmuri9's name, so every small line takes it
if (document.documentElement.classList.contains("touch-small")) {
  const face = document.createElement("style");
  face.textContent = '@font-face { font-family: "Galmuri9"; src: url("/fonts/Galmuri11.woff2") format("woff2"); font-display: block; }';
  document.head.appendChild(face);
}

// Everything is fetched behind the loading screen first, so nothing waits on the network mid-game.
function Boot() {
  const [ready, setReady] = useState(false);
  return ready ? <App /> : <Loading onDone={() => setReady(true)} />;
}

Promise.all(fonts).finally(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <div className="frame">
        <Boot />
      </div>
      <RotatePrompt />
    </StrictMode>,
  ),
);
