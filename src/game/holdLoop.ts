import Phaser from "phaser";

// Holds a Phaser game still while the day's title card is over it (nothing moves, no time passes) and lets
// it go again. A game that has not started its loop yet (the card comes up as it boots) is held after its
// first step, if it should still be held by then.
export function holdLoop(game: Phaser.Game | null, hold: boolean, still: { current: boolean }) {
  if (!game) return;
  if (!hold) game.loop.wake();
  else if (game.isRunning) game.loop.sleep();
  else game.events.once(Phaser.Core.Events.POST_STEP, () => still.current && game.loop.sleep());
}
