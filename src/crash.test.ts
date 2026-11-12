import { describe, expect, it, vi } from "vitest";
import { createCrashLog, guardStep } from "./crash";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("the crash log", () => {
  it("keeps what went wrong, where and when, on the device", () => {
    const store = memory();
    const log = createCrashLog(() => store, () => 1000);
    log.report("hunt", new Error("boom"));
    expect(createCrashLog(() => store).list()).toEqual([expect.objectContaining({ at: 1000, where: "hunt", message: "boom" })]);
  });
  it("writes the same error once (a loop that fails every frame)", () => {
    const store = memory();
    const log = createCrashLog(() => store);
    for (let i = 0; i < 60; i++) log.report("shop", new Error("again"));
    expect(log.list()).toHaveLength(1);
  });
  it("keeps the last few only", () => {
    const store = memory();
    const log = createCrashLog(() => store);
    for (let i = 0; i < 30; i++) log.report("x", new Error(`e${i}`));
    expect(log.list()).toHaveLength(10);
    expect(log.list().at(-1)?.message).toBe("e29");
  });
  it("still works when storage is refused", () => {
    const log = createCrashLog(() => {
      throw new Error("denied");
    });
    expect(() => log.report("x", "not even an Error")).not.toThrow();
    expect(log.list()).toEqual([]);
  });
});

describe("a guarded game loop step", () => {
  it("keeps going past an error, which is reported", () => {
    const report = vi.fn();
    let calls = 0;
    const game = {
      step(_time: number, _delta: number) {
        calls++;
        if (calls === 1) throw new Error("bad frame");
      },
    };
    guardStep(game, "hunt", report);
    expect(() => game.step(0, 16)).not.toThrow();
    game.step(16, 16);
    expect(calls).toBe(2);
    expect(report).toHaveBeenCalledWith("hunt", expect.objectContaining({ message: "bad frame" }));
  });
});
