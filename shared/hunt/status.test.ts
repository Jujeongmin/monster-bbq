import { describe, expect, it } from "vitest";
import { bind, dart, FREE, isHeld, stepStatus, stun, wake } from "./status";

describe("monster status (hunt v3 design 4.4)", () => {
  it("is held still while stunned, asleep or tied up, and free again after", () => {
    const s = stun(FREE, 1000);
    expect(isHeld(s)).toBe(true);
    expect(stepStatus(s, 1000).s).toEqual(FREE);
    expect(isHeld(bind(FREE, 500))).toBe(true);
  });
  it("falls asleep after enough darts and the fall time, then sleeps", () => {
    let s = dart(FREE, 2, 1500);
    expect(s).toEqual({ kind: "drowsy", hits: 1, fallMs: null });
    s = dart(s, 2, 1500);
    expect(s).toEqual({ kind: "drowsy", hits: 2, fallMs: 1500 });
    const r = stepStatus(s, 1500);
    expect(r.event).toBe("fell_asleep");
    expect(r.s.kind).toBe("asleep");
  });
  it("wakes when hit, and wakes by itself after its sleep", () => {
    expect(wake({ kind: "asleep", ms: 9000 })).toEqual(FREE);
    expect(wake({ kind: "drowsy", hits: 1, fallMs: null })).toEqual(FREE);
    expect(stepStatus({ kind: "asleep", ms: 100 }, 100)).toEqual({ s: FREE, event: "woke" });
  });
  it("keeps drowsiness between darts that are not enough yet", () => {
    expect(stepStatus({ kind: "drowsy", hits: 1, fallMs: null }, 5000).s).toEqual({ kind: "drowsy", hits: 1, fallMs: null });
  });
});
