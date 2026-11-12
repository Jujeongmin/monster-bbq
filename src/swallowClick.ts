// Drops the click that follows a press already used up (a tap that only closed a line), wherever it lands.
// A press that gives no click (a drag on the stick, a touch on a game canvas, which keeps the click from
// coming) must not leave the catcher waiting to eat the next real tap (mobile freeze report, user
// 2026-11-12): it is given up at the next press, or a moment after this one ends. Returns the give-up.
export function swallowNextClick(target: EventTarget, waitMs = 500): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const eat = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    drop();
  };
  const ended = () => {
    if (timer === null) timer = setTimeout(drop, waitMs);
  };
  const drop = () => {
    target.removeEventListener("click", eat, true);
    target.removeEventListener("pointerdown", drop, true);
    target.removeEventListener("pointerup", ended, true);
    target.removeEventListener("pointercancel", ended, true);
    if (timer !== null) clearTimeout(timer);
  };
  target.addEventListener("click", eat, true);
  target.addEventListener("pointerdown", drop, true);
  target.addEventListener("pointerup", ended, true);
  target.addEventListener("pointercancel", ended, true);
  return drop;
}
