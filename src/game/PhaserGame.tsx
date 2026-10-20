import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { holdLoop } from "./holdLoop";
import { HuntScene, type HuntData, type HuntResult } from "./scenes/HuntScene";
import type { HuntStep } from "../screens/tutorial";

// The Phaser canvas for one hunt (the server's seed), created once per mount (StrictMode mounts twice
// in dev; the first game is destroyed on the cleanup). The scene's "hunt:end" event reaches onHuntEnd.
// `hold`: the day's title card is over it, so the hunt waits (nothing moves, stamina holds) until it is gone.
// onTutorial: the first hunt's step due now (tutorial A).
export function PhaserGame({ hunt, hold = false, onHuntEnd, onTutorial }: { hunt: HuntData; hold?: boolean; onHuntEnd: (result: HuntResult) => void; onTutorial?: (step: HuntStep) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const onEnd = useRef(onHuntEnd);
  onEnd.current = onHuntEnd;
  const onTut = useRef(onTutorial);
  onTut.current = onTutorial;

  const holdRef = useRef(hold);
  holdRef.current = hold;
  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      pixelArt: true,
      backgroundColor: "#000000",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    game.scene.add("hunt", HuntScene, true, hunt);
    game.events.on("hunt:end", (result: HuntResult) => onEnd.current(result));
    game.events.on("hunt:tutorial", (step: HuntStep) => onTut.current?.(step));
    gameRef.current = game;
    return () => game.destroy(true);
  }, []);
  useEffect(() => holdLoop(gameRef.current, hold, holdRef), [hold]);

  return <div ref={host} style={{ width: "100%", height: "100%" }} />;
}
