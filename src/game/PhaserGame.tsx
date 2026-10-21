import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { holdLoop } from "./holdLoop";
import { HuntScene, type HuntData, type HuntResult } from "./scenes/HuntScene";
import type { HuntTut } from "../screens/tutorial";

// The Phaser canvas for one hunt (the server's seed), created once per mount (StrictMode mounts twice
// in dev; the first game is destroyed on the cleanup). The scene's "hunt:end" event reaches onHuntEnd.
// `hold`: the day's title card is over it, so the hunt waits (nothing moves, stamina holds) until it is gone.
// onTutorial: the first hunt's step due now (tutorial A); onControls: the pause menu asked for the controls;
// onTip: a moment the lid explains once (a monster weak enough to capture).
export function PhaserGame({ hunt, hold = false, onHuntEnd, onTutorial, onControls, onTip }: { hunt: HuntData; hold?: boolean; onHuntEnd: (result: HuntResult) => void; onTutorial?: (tut: HuntTut) => void; onControls?: () => void; onTip?: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const onEnd = useRef(onHuntEnd);
  onEnd.current = onHuntEnd;
  const onTut = useRef(onTutorial);
  onTut.current = onTutorial;
  const onCtl = useRef(onControls);
  onCtl.current = onControls;
  const onTipRef = useRef(onTip);
  onTipRef.current = onTip;

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
    game.events.on("hunt:tutorial", (tut: HuntTut) => onTut.current?.(tut));
    game.events.on("hunt:controls", () => onCtl.current?.());
    game.events.on("hunt:tip", (id: string) => onTipRef.current?.(id));
    gameRef.current = game;
    // the dev server only: the running game for headless checks (never in a build)
    if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game;
    return () => game.destroy(true);
  }, []);
  useEffect(() => holdLoop(gameRef.current, hold, holdRef), [hold]);

  return <div ref={host} style={{ width: "100%", height: "100%" }} />;
}
