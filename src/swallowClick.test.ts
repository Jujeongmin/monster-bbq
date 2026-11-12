import { afterEach, describe, expect, it, vi } from "vitest";
import { swallowNextClick } from "./swallowClick";

// The window as the catcher sees it: listeners by type, the list taken as it stands when an event starts
// (as the DOM does; Node's own EventTarget loses track when a listener takes itself off mid-event). A
// button deeper in the page hears the click only if the window let it go on down.
type Fake = { stopped: boolean; prevented: boolean; stopPropagation(): void; preventDefault(): void };
function page() {
  const on = new Map<string, Set<(e: Fake) => void>>();
  const target = {
    addEventListener: (type: string, f: (e: Fake) => void) => void (on.get(type) ?? on.set(type, new Set()).get(type)!).add(f),
    removeEventListener: (type: string, f: (e: Fake) => void) => void on.get(type)?.delete(f),
  } as unknown as EventTarget;
  const button = vi.fn();
  const fire = (type: string) => {
    const e: Fake = { stopped: false, prevented: false, stopPropagation: () => void (e.stopped = true), preventDefault: () => void (e.prevented = true) };
    for (const f of [...(on.get(type) ?? [])]) f(e);
    if (type === "click" && !e.stopped) button();
    return e;
  };
  return { target, fire, button };
}

afterEach(() => vi.useRealTimers());

describe("the click after a press that closed a line", () => {
  it("is dropped", () => {
    const p = page();
    swallowNextClick(p.target);
    p.fire("pointerup");
    expect(p.fire("click").prevented).toBe(true);
    expect(p.button).not.toHaveBeenCalled();
  });
  it("is the only one dropped", () => {
    const p = page();
    swallowNextClick(p.target);
    p.fire("click");
    p.fire("click");
    expect(p.button).toHaveBeenCalledTimes(1);
  });
  it("never comes after a drag: the next tap still lands", () => {
    const p = page();
    swallowNextClick(p.target);
    // the drag ends with no click; the next tap starts
    p.fire("pointerup");
    p.fire("pointerdown");
    p.fire("pointerup");
    p.fire("click");
    expect(p.button).toHaveBeenCalledTimes(1);
  });
  it("is given up a moment after the press ends with no click", () => {
    vi.useFakeTimers();
    const p = page();
    swallowNextClick(p.target, 500);
    p.fire("pointercancel");
    vi.advanceTimersByTime(500);
    p.fire("click");
    expect(p.button).toHaveBeenCalledTimes(1);
  });
});
