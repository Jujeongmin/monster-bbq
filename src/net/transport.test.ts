import { describe, expect, it } from "vitest";
import { wantsOnline } from "./connection";
import { newSave } from "../../shared/save";
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
  it("waits for a context that arrives later (the dev-only recipe table) and cooks with it", async () => {
    const store = memory();
    store.setItem("monster-bbq:save", JSON.stringify({ ...newSave(), items: { shiitake: 1 } }));
    const recipes = Promise.resolve({ shiitake_grill: { method: "grill", items: ["shiitake"] } } as never);
    const t = new LocalTransport(store, undefined, async () => ({ now: 0, random: Math.random, recipes: await recipes }));
    const s = await t.act({ type: "cook", attemptId: "a1", items: ["shiitake"], method: "grill" });
    expect(s.lastCook?.outcome).toEqual({ kind: "new", dish: "shiitake_grill" });
    expect((await t.load()).cookbook).toHaveProperty("shiitake_grill");
  });
  it("refuses cooking without the recipe table and keeps the ingredients", async () => {
    const store = memory();
    store.setItem("monster-bbq:save", JSON.stringify({ ...newSave(), items: { shiitake: 1 } }));
    const t = new LocalTransport(store);
    await expect(t.act({ type: "cook", attemptId: "a1", items: ["shiitake"], method: "grill" })).rejects.toThrow("unavailable");
    expect((await t.load()).items).toEqual({ shiitake: 1 });
  });
  it("throws on a rejected action and keeps the save", async () => {
    const t = new LocalTransport(memory());
    await expect(t.act({ type: "finishHunt", huntId: "nope", events: [], ko: false })).rejects.toThrow("bad_hunt");
    expect((await t.load()).hunt).toBeNull();
  });
});

describe("Verse8Transport", () => {
  it("calls the server and checks the reply", async () => {
    const t = new Verse8Transport({ remoteFunction: async (fn) => (fn === "load" ? { ...newSave(), day: 3, gold: 5 } : null) });
    expect((await t.load()).day).toBe(3);
    await expect(t.act({ type: "endDay" })).rejects.toThrow("bad_reply");
  });
  it("refuses a reply from a server still on an old save version", async () => {
    const t = new Verse8Transport({ remoteFunction: async () => ({ ...newSave(), version: 3 }) });
    await expect(t.load()).rejects.toThrow("bad_reply");
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
