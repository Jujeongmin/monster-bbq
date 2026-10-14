import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { HuntScene } from "./scenes/HuntScene";
import { PlatformScene } from "./scenes/PlatformScene";

// The Phaser canvas, created once per mount (StrictMode mounts twice in dev; the first game is
// destroyed on the cleanup).
export function PhaserGame() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      pixelArt: true,
      backgroundColor: "#000000",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 } } },
      // ?mode=platform opens the platformer spike for comparison
      scene: new URLSearchParams(location.search).get("mode") === "platform" ? [PlatformScene] : [HuntScene],
    });
    return () => game.destroy(true);
  }, []);

  return <div ref={host} style={{ width: "100%", height: "100%" }} />;
}
