import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { HuntScene, type HuntResult } from "./scenes/HuntScene";

// The Phaser canvas for one hunt, created once per mount (StrictMode mounts twice in dev; the first
// game is destroyed on the cleanup). The scene's "hunt:end" event reaches onHuntEnd.
export function PhaserGame({ onHuntEnd }: { onHuntEnd: (result: HuntResult) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const onEnd = useRef(onHuntEnd);
  onEnd.current = onHuntEnd;

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      pixelArt: true,
      backgroundColor: "#000000",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [HuntScene],
    });
    game.events.on("hunt:end", (result: HuntResult) => onEnd.current(result));
    return () => game.destroy(true);
  }, []);

  return <div ref={host} style={{ width: "100%", height: "100%" }} />;
}
