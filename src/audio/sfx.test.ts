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
  it("plays footsteps and the heartbeat softer than the rest", () => {
    const vols: number[] = [];
    const sfx = makeSfx({ urls: { coin: "c.mp3", step: "s.mp3", heartbeat: "h.mp3" }, make: () => { const p = { play: () => void vols.push(p.volume), volume: 1 }; return p; }, store: memory(), now: () => 0 });
    sfx.unlock();
    sfx.play("coin");
    sfx.play("step");
    sfx.play("heartbeat");
    expect(vols[1]).toBeLessThan(vols[0]);
    expect(vols[2]).toBeLessThan(vols[0]);
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

describe("sound players kept for reuse (mobile frame drops, user 2026-10-27)", () => {
  const pooled = () => {
    const made: { ended: boolean; currentTime: number; plays: number }[] = [];
    let t = 0;
    const sfx = makeSfx({
      urls: { step: "s.mp3" },
      make: () => {
        const p = { ended: false, currentTime: 5, plays: 0, volume: 1, play: () => void p.plays++ };
        made.push(p);
        return p;
      },
      store: memory(),
      now: () => t,
    });
    sfx.unlock();
    return { sfx, made, tick: (ms: number) => (t += ms) };
  };
  it("plays a finished player again from the start instead of making a new one", () => {
    const { sfx, made, tick } = pooled();
    for (let i = 0; i < 6; i++) {
      sfx.play("step");
      made.forEach((p) => (p.ended = true));
      tick(100);
    }
    expect(made).toHaveLength(1);
    expect(made[0].plays).toBe(6);
    expect(made[0].currentTime).toBe(0);
  });
  it("overlaps up to three at once, then restarts the oldest", () => {
    const { sfx, made, tick } = pooled();
    for (let i = 0; i < 5; i++) sfx.play("step"), tick(100);
    expect(made).toHaveLength(3);
    expect(made.map((p) => p.plays)).toEqual([2, 2, 1]);
  });
});
