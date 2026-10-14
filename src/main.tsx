// First, before anything reaches for storage: @agent8/gameserver touches localStorage while its
// module is being evaluated. See storageFallback.ts.
import "./storageFallback";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { detectLocale, setLocale } from "./i18n";
import "./index.css";

setLocale(detectLocale(location.search, navigator.language));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
