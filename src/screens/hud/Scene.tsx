import type { ReactNode } from "react";
import { artUrl } from "../../game/art";
import { HUD_ART } from "./hud";

// A result or setting-out window over the shop, dimmed, instead of an empty screen (Dave-style UI design 7).
export function Scene({ children }: { children: ReactNode }) {
  return (
    <div className="dayflow-screen hud-scene" style={{ backgroundImage: `url(${artUrl(HUD_ART.shopBg)})` }}>
      <div className="hud-scene-dim" />
      {children}
    </div>
  );
}
