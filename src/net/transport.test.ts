import { describe, expect, it } from "vitest";
import { wantsOnline } from "./connection";
import { LocalTransport, Verse8Transport } from "./transport";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("LocalTransport", () => {
  it("plays by the shared rules and remembers the save", async () => {
    const store = memory();
    await new LocalTransport(store).act({ type: "startHunt", zone: "forest" });
    expect((await new LocalTransport(store).load()).hunt?.zone).toBe("forest");
  });
  it("starts fresh instead of failing when the stored save is not even JSON", async () => {
    const store = memory();
    store.setItem("monster-bbq:save", "{broken");
    expect((await new LocalTransport(store).load()).day).toBe(1);
  });
  it("throws on a rejected action and keeps the save", async () => {
    const t = new LocalTransport(memory());
    await expect(t.act({ type: "finishHunt", huntId: "nope", events: [], ko: false })).rejects.toThrow("bad_hunt");
    expect((await t.load()).hunt).toBeNull();
  });
});

describe("Verse8Transport", () => {
  it("calls the server and checks the reply", async () => {
    const t = new Verse8Transport({ remoteFunction: async (fn) => (fn === "load" ? { version: 2, day: 3, gold: 5, items: {}, hunt: null } : null) });
    expect((await t.load()).day).toBe(3);
    await expect(t.act({ type: "endDay" })).rejects.toThrow("bad_reply");
  });
  it("gives up on a server that never answers", async () => {
    const t = new Verse8Transport({ remoteFunction: () => new Promise(() => {}) }, 10);
    await expect(t.load()).rejects.toThrow("timeout");
  });
});

describe("wantsOnline", () => {
  it("is online only with a Verse8 project, and ?local opts out in development", () => {
    expect(wantsOnline(undefined, "", true)).toBe(false);
    expect(wantsOnline("verse-1", "", true)).toBe(true);
    expect(wantsOnline("verse-1", "?local", true)).toBe(false);
    expect(wantsOnline("verse-1", "?local", false)).toBe(true);
  });
});
