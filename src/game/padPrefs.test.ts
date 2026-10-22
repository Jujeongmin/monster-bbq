import { describe, expect, it } from "vitest";
import { nextPadPrefs, PAD_ALPHA, PAD_SCALE, readPadPrefs, writePadPrefs } from "./padPrefs";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("pad prefs", () => {
  it("starts at the normal size and the normal shade", () => {
    expect(readPadPrefs(memory())).toEqual({ size: "normal", alpha: "normal" });
  });

  it("keeps what was set, per device", () => {
    const store = memory();
    writePadPrefs(store, { size: "big", alpha: "faint" });
    expect(readPadPrefs(store)).toEqual({ size: "big", alpha: "faint" });
  });

  it("falls back on anything it does not know, or no storage at all", () => {
    const store = memory();
    store.setItem("monster-bbq:pad", '{"size":"huge","alpha":3}');
    expect(readPadPrefs(store)).toEqual({ size: "normal", alpha: "normal" });
    store.setItem("monster-bbq:pad", "not json");
    expect(readPadPrefs(store)).toEqual({ size: "normal", alpha: "normal" });
    expect(readPadPrefs(null)).toEqual({ size: "normal", alpha: "normal" });
  });

  it("steps each setting round: small, normal, big; solid, normal, faint", () => {
    let p = readPadPrefs(null);
    p = nextPadPrefs(p, "size");
    expect(p.size).toBe("big");
    p = nextPadPrefs(p, "size");
    expect(p.size).toBe("small");
    p = nextPadPrefs(p, "alpha");
    expect(p.alpha).toBe("faint");
    p = nextPadPrefs(p, "alpha");
    expect(p).toEqual({ size: "small", alpha: "solid" });
  });

  it("grows and fades in order", () => {
    expect(PAD_SCALE.small).toBeLessThan(PAD_SCALE.normal);
    expect(PAD_SCALE.normal).toBe(1);
    expect(PAD_SCALE.big).toBeGreaterThan(PAD_SCALE.normal);
    expect(PAD_ALPHA.solid).toBe(1);
    expect(PAD_ALPHA.faint).toBeLessThan(PAD_ALPHA.normal);
  });
});
