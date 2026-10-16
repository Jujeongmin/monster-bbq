import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { HuntScene, type HuntData, type HuntResult } from "./scenes/HuntScene";

// The Phaser canvas for one hunt (the server's seed), created once per mount (StrictMode mounts twice
// in dev; the first game is destroyed on the cleanup). The scene's "hunt:end" event reaches onHuntEnd.
// `hold`: the day's title card is over it, so the hunt waits (nothing moves, stamina holds) until it is gone.
export function PhaserGame({ hunt, hold = false, onHuntEnd }: { hunt: HuntData; hold?: boolean; onHuntEnd: (result: HuntResult) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Phaser.Game | null>(null);
  const onEnd = useRef(onHuntEnd);
  onEnd.current = onHuntEnd;

  const gameRef = (g: Phaser.Game) => {
    game.current = g;
    if (hold) g.events.once(Phaser.Core.Events.POST_STEP, () => holdRef.current && g.loop.sleep());
  };
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
    gameRef(game);
    return () => game.destroy(true);
  }, []);
  useEffect(() => {
    const g = game.current;
    if (!g) return;
    // not running yet (the card comes up as the hunt boots): hold it after its first step
    if (hold) g.isRunning ? g.loop.sleep() : g.events.once(Phaser.Core.Events.POST_STEP, () => holdRef.current && g.loop.sleep());
    else g.loop.wake();
  }, [hold]);

  return <div ref={host} style={{ width: "100%", height: "100%" }} />;
}
