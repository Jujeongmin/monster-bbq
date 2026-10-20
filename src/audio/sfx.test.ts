import { describe, expect, it } from "vitest";
import { makeSfx } from "./sfx";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const setup = (over: Partial<Parameters<typeof makeSfx>[0]> = {}) => {
  const played: string[] = [];
  let t = 0;
  const sfx = makeSfx({ urls: { coin: "coin.mp3", bell: "bell.mp3" }, make: (url) => ({ play: () => void played.push(url), volume: 1 }), store: memory(), now: () => t, ...over });
  return { sfx, played, tick: (ms: number) => (t += ms) };
};

describe("the night's sounds", () => {
  it("stays silent until the player first presses something, then plays", () => {
    const { sfx, played } = setup();
    sfx.play("coin");
    expect(played).toEqual([]);
    sfx.unlock();
    sfx.play("coin");
    expect(played).toEqual(["coin.mp3"]);
  });
  it("does not play a sound that has no file yet", () => {
    const { sfx, played } = setup();
    sfx.unlock();
    sfx.play("angry");
    expect(played).toEqual([]);
  });
  it("plays the same sound once within 80 ms", () => {
    const { sfx, played, tick } = setup();
    sfx.unlock();
    sfx.play("coin");
    tick(50);
    sfx.play("coin");
    tick(40);
    sfx.play("coin");
    expect(played).toEqual(["coin.mp3", "coin.mp3"]);
  });
  it("stays quiet when muted and remembers it", () => {
    const store = memory();
    const { sfx, played } = setup({ store });
    sfx.unlock();
    sfx.setMuted(true);
    sfx.play("bell");
    expect(played).toEqual([]);
    expect(setup({ store }).sfx.isMuted()).toBe(true);
  });
  it("works when storage throws", () => {
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const { sfx } = setup({ store: bad });
    expect(sfx.isMuted()).toBe(false);
    expect(() => sfx.setMuted(true)).not.toThrow();
    expect(sfx.isMuted()).toBe(true);
  });
});
