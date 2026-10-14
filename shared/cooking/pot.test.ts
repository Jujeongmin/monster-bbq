import { describe, expect, it } from "vitest";
import { BALANCE } from "../balance";
import { addToPot, judgePot, newPot, setDial, skim, stepPot, toggleLid, type Pot } from "./pot";

const P = BALANCE.cooking.pot;

function run(p: Pot, ms: number, frame = 50): Pot {
  for (let t = 0; t < ms; t += frame) p = stepPot(p, Math.min(frame, ms - t));
  return p;
}
const boiling = () => run(setDial(newPot(), 3), 12_000);

describe("heat", () => {
  it("comes to a boil on high", () => {
    expect(newPot().temp).toBe(20);
    expect(boiling().temp).toBeGreaterThanOrEqual(99.5);
  });
  it("cools with the fire off and stops cooking", () => {
    let p = run(addToPot(boiling(), "boar_rib:normal"), 5000);
    p = run(setDial(p, 0), 20_000);
    expect(p.temp).toBeLessThan(P.cookFrom);
    const cooled = p.items[0].cooked;
    expect(run(p, 10_000).items[0].cooked).toBe(cooled);
  });
  it("boils sooner with the lid on", () => {
    const open = run(setDial(newPot(), 2), 6000);
    const closed = run(toggleLid(setDial(newPot(), 2)), 6000);
    expect(closed.temp).toBeGreaterThan(open.temp);
  });
  it("boils over when left on high too long, sooner with the lid on", () => {
    expect(run(boiling(), P.boilOverMs + 500).boilOvers).toBeGreaterThanOrEqual(1);
    expect(run(toggleLid(boiling()), P.boilOverMs / 2 + 500).boilOvers).toBeGreaterThanOrEqual(1);
    expect(run(setDial(boiling(), 1), P.boilOverMs * 3).boilOvers).toBe(0);
  });
});

describe("foam", () => {
  it("rises when meat boils, not from vegetables alone", () => {
    expect(run(addToPot(boiling(), "boar_rib:normal"), 5000).foam).toBeGreaterThan(0.1);
    expect(run(addToPot(boiling(), "shiitake"), 5000).foam).toBe(0);
  });
  it("goes down with each pass of the ladle", () => {
    const p = run(addToPot(boiling(), "boar_rib:normal"), 8000);
    const s = skim(p);
    expect(s.foam).toBeCloseTo(Math.max(0, p.foam - P.skimAmount));
    expect(s.skims).toBe(1);
  });
  it("stops once the meat has given up its scum", () => {
    const p = run(setDial(addToPot(boiling(), "boar_rib:normal"), 1), 60_000);
    const cleared = run(skim(skim(skim(skim(p)))), 20_000);
    expect(cleared.foam).toBeLessThan(0.1);
  });
});

describe("judgePot", () => {
  // galbi-jjim the way it is done: ribs first, scum skimmed, simmered, mushrooms near the end
  function stew(skimIt: boolean) {
    let p = addToPot(boiling(), "boar_rib:normal");
    p = run(p, 10_000);
    if (skimIt) for (let i = 0; i < 4; i++) p = skim(p);
    p = run(setDial(p, 1), 15_000);
    if (skimIt) for (let i = 0; i < 4; i++) p = skim(p);
    p = run(addToPot(p, "shiitake"), 9000);
    return p;
  }
  it("rates a stew done right highly and calls the broth clear", () => {
    const r = judgePot(stew(true));
    expect(r.accuracy).toBeGreaterThan(0.85);
    expect(r.notes).toContain("clear");
  });
  it("takes points for scum left in the broth", () => {
    const r = judgePot(stew(false));
    expect(r.notes).toContain("foamy");
    expect(r.accuracy).toBeLessThan(judgePot(stew(true)).accuracy);
  });
  it("calls mushrooms boiled too long mushy", () => {
    const p = run(setDial(addToPot(addToPot(boiling(), "boar_rib:normal"), "shiitake"), 1), 30_000);
    expect(judgePot(p).notes).toContain("mushy");
  });
  it("calls meat pulled too early undercooked and counts spills", () => {
    expect(judgePot(run(addToPot(boiling(), "boar_rib:normal"), 3000)).notes).toContain("undercooked");
    expect(judgePot(run(addToPot(boiling(), "boar_rib:normal"), P.boilOverMs + 500)).notes).toContain("boilOver");
  });
  it("gives an empty pot nothing, and always stays between 0 and 1", () => {
    expect(judgePot(boiling()).accuracy).toBe(0);
    for (const ms of [0, 5000, 30_000, 120_000]) {
      const a = judgePot(run(addToPot(boiling(), "boar_rib:normal"), ms)).accuracy;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });
});

describe("big frames", () => {
  it("handles one long frame like many short ones and ignores negative time", () => {
    const big = stepPot(addToPot(boiling(), "boar_rib:normal"), 10_000);
    const small = run(addToPot(boiling(), "boar_rib:normal"), 10_000, 16);
    expect(big.items[0].cooked).toBeCloseTo(small.items[0].cooked, 1);
    expect(stepPot(big, -1)).toEqual(big);
  });
});
