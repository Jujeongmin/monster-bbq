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
Promise.all(fonts).finally(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
