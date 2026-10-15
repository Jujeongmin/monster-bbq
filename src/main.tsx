// First, before anything reaches for storage: @agent8/gameserver touches localStorage while its
// module is being evaluated. See storageFallback.ts.
import "./storageFallback";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { detectLocale, setLocale } from "./i18n";
import "./index.css";

setLocale(detectLocale(location.search, navigator.language));

// Phaser draws its text once into a canvas: the pixel fonts must be ready before the first scene, or it
// keeps the fallback face. A missing font only costs the look, so the game starts anyway.
const fonts = ["12px Galmuri11", "bold 12px Galmuri11", "10px Galmuri9"].map((f) => document.fonts.load(f).catch(() => []));
// The game is landscape: everything lives in one 16:9 frame, letterboxed in whatever window it gets.
// The UI's pixel scale (--s) is the frame width in whole multiples of the game's 640 px, so pixel art and
// pixel fonts stay crisp.
function fitFrame() {
  const width = Math.min(window.innerWidth, (window.innerHeight * 16) / 9);
  document.documentElement.style.setProperty("--s", String(Math.max(1, Math.floor(width / 640))));
}
fitFrame();
window.addEventListener("resize", fitFrame);

Promise.all(fonts).finally(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <div className="frame">
        <App />
      </div>
    </StrictMode>,
  ),
);
