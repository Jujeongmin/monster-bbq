import { describe, expect, it } from "vitest";
import { press, start, tick } from "./dialogueState";

const lines = [{ text: "불을 그렇게" }, { text: "다시!" }];

describe("the dialogue box", () => {
  it("types the first line out one letter at a time", () => {
    let s = start();
    expect(s).toEqual({ index: 0, shown: 0 });
    s = tick(s, lines, 3);
    expect(s.shown).toBe(3);
    s = tick(s, lines, 100);
    expect(s.shown).toBe("불을 그렇게".length);
  });

  it("finishes the line on a press while it is still typing", () => {
    const r = press(tick(start(), lines, 2), lines);
    expect(r).toEqual({ state: { index: 0, shown: "불을 그렇게".length }, done: false });
  });

  it("moves to the next line on a press once the line is out", () => {
    const full = tick(start(), lines, 100);
    expect(press(full, lines)).toEqual({ state: { index: 1, shown: 0 }, done: false });
  });

  it("is done after the last line is out and pressed", () => {
    const last = tick({ index: 1, shown: 0 }, lines, 100);
    expect(press(last, lines).done).toBe(true);
  });

  it("is done at once with no lines", () => {
    expect(press(start(), []).done).toBe(true);
  });
});
