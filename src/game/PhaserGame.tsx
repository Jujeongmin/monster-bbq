import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { fitGameWidth, GAME_HEIGHT } from "./config";
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
    // as wide as the frame's shape asks (a long phone sees more forest at the sides)
    const box = host.current!;
    const width = fitGameWidth(box.clientHeight > 0 ? box.clientWidth / box.clientHeight : 16 / 9);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: box,
      width,
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
    // the WebGL context goes with the game at once, not at the next garbage collection (a new game every
    // hunt; phones allow few contexts: mobile frame drops, user 2026-10-27)
    return () => {
      const gl = (game.renderer as Phaser.Renderer.WebGL.WebGLRenderer | null)?.gl;
      game.events.once(Phaser.Core.Events.DESTROY, () => setTimeout(() => gl?.getExtension("WEBGL_lose_context")?.loseContext(), 0));
      game.destroy(true);
    };
  }, []);
  useEffect(() => holdLoop(gameRef.current, hold, holdRef), [hold]);

  return <div ref={host} style={{ width: "100%", height: "100%" }} />;
}
