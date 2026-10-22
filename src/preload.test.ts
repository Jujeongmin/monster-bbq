import { describe, expect, it } from "vitest";
import { cssUrls, runAll } from "./preload";

describe("runAll", () => {
  it("loads every url once, a few at a time, reporting each one done", async () => {
    let open = 0;
    let most = 0;
    const seen: string[] = [];
    const progress: number[] = [];
    await runAll(
      ["a", "b", "c", "d", "e"],
      async (url) => {
        open++;
        most = Math.max(most, open);
        await new Promise((r) => setTimeout(r, 1));
        seen.push(url);
        open--;
      },
      (done, total) => progress.push(done / total),
      2,
    );
    expect(seen.sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(most).toBe(2);
    expect(progress).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
  });

  it("counts a failed load as done, so one missing file never holds the game", async () => {
    const progress: number[] = [];
    await runAll(["ok", "bad"], async (url) => (url === "bad" ? Promise.reject(new Error("404")) : undefined), (d) => progress.push(d), 4);
    expect(progress).toEqual([1, 2]);
  });

  it("finishes at once with nothing to load", async () => {
    const progress: number[] = [];
    await runAll([], async () => {}, (d, t) => progress.push(d, t), 4);
    expect(progress).toEqual([0, 0]);
  });
});

describe("cssUrls", () => {
  it("finds the pictures a stylesheet points at, made absolute against the sheet", () => {
    const text = '.a { border-image: url("../art/test/ui2/card.png") 5 fill; } .b { background: url(/x/y.png) } .c { src: url("data:font/woff2;base64,AA") }';
    expect(cssUrls(text, "http://h/src/index.css")).toEqual(["http://h/art/test/ui2/card.png", "http://h/x/y.png"]);
  });
});
