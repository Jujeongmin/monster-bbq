// What went wrong while playing, kept on the device (mobile freeze report, user 2026-11-12). A game loop
// that throws once stops for good, the screen frozen and taps dead, and nothing said why: the loops now go
// on past an error (guardStep, the shop's frames) and every error lands here and in the console.

export type Crash = { at: number; where: string; message: string; stack?: string };
type Store = Pick<Storage, "getItem" | "setItem">;

const KEY = "mb:crashes";
const MAX = 10;

export function createCrashLog(store: () => Store, now: () => number = Date.now) {
  // a loop failing every frame writes its error once
  const seen = new Set<string>();
  const list = (): Crash[] => {
    try {
      const v = JSON.parse(store().getItem(KEY) ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const report = (where: string, e: unknown) => {
    const err = e instanceof Error ? e : new Error(String(e));
    const sig = `${where}:${err.message}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    console.error(`[crash] ${where}`, err);
    try {
      const next = [...list(), { at: now(), where, message: err.message, stack: err.stack?.slice(0, 1500) }].slice(-MAX);
      store().setItem(KEY, JSON.stringify(next));
    } catch {
      // storage refused: the console has it
    }
  };
  return { report, list };
}

const log = createCrashLog(() => localStorage);
export const reportCrash = log.report;
export const crashes = log.list;

// Errors nothing caught (an event handler, a promise left alone) go to the log too.
export function watchCrashes(target: Window = window) {
  target.addEventListener("error", (e) => reportCrash("page", e.error ?? e.message));
  target.addEventListener("unhandledrejection", (e) => reportCrash("promise", e.reason));
}

// A Phaser game's step that never throws: Phaser asks for the next frame after the step, so one error
// would end the loop. Set before the game starts its loop (Game.start binds `step` then).
export function guardStep(game: { step(time: number, delta: number): void }, where: string, report: (where: string, e: unknown) => void = reportCrash) {
  const step = game.step.bind(game);
  game.step = (time, delta) => {
    try {
      step(time, delta);
    } catch (e) {
      report(where, e);
    }
  };
}
