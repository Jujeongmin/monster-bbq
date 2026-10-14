import { describe, expect, it } from "vitest";
import { BALANCE } from "../balance";
import {
  canPlate,
  cutPiece,
  flipPiece,
  heatAt,
  judgePiece,
  juicy,
  movePiece,
  newGrill,
  placePiece,
  removePiece,
  replaceGrill,
  restPiece,
  saltPiece,
  stepGrill,
  type Grill,
} from "./grill";

const G = BALANCE.cooking.grill;

// run the grill for `ms` in frames of `frame` ms
function run(g: Grill, ms: number, frame = 50): Grill {
  for (let t = 0; t < ms; t += frame) g = stepGrill(g, Math.min(frame, ms - t));
  return g;
}
const hot = () => run(newGrill(), G.preheatMs + 100);
const piece = (g: Grill, id = "a") => g.pieces.find((p) => p.id === id)!;

describe("preheating", () => {
  it("makes meat stick on a cold grill and not on a hot one", () => {
    expect(piece(placePiece(newGrill(), "a", "boar_belly:normal", 0, 0)).stuck).toBe(true);
    expect(piece(placePiece(hot(), "a", "boar_belly:normal", 0, 0)).stuck).toBe(false);
  });
  it("needs heating again after the plate is replaced, and the new plate is clean", () => {
    let g = placePiece(hot(), "a", "boar_belly:normal", 0, 0);
    g = run(g, 30_000); // burns, soots the plate
    expect(g.soot).toBeGreaterThan(0);
    const fresh = replaceGrill(removePiece(g, "a"));
    expect(fresh.soot).toBe(0);
    expect(fresh.fat).toBe(0);
    expect(fresh.heat).toBeLessThan(G.stickBelow);
  });
});

describe("heat and doneness", () => {
  it("is hottest in the middle", () => {
    expect(heatAt(0, 0)).toBe(1);
    expect(heatAt(1, 0)).toBeCloseTo(G.edgeHeat);
    expect(heatAt(0.5, 0)).toBeGreaterThan(heatAt(0.9, 0));
  });
  it("cooks the side touching the plate, faster in the middle", () => {
    let g = placePiece(hot(), "a", "boar_belly:normal", 0, 0);
    g = placePiece(g, "b", "boar_neck:normal", 0.95, 0);
    g = run(g, 3000);
    expect(piece(g).down).toBeGreaterThan(0.25);
    expect(piece(g).up).toBe(0);
    expect(piece(g).down).toBeGreaterThan(piece(g, "b").down);
  });
  it("cooks pork neck slower than belly and burns honey sooner", () => {
    let g = placePiece(hot(), "a", "boar_belly:normal", -0.3, 0);
    g = placePiece(g, "b", "boar_neck:normal", 0.3, 0);
    g = run(g, 5000);
    expect(piece(g, "b").down).toBeLessThan(piece(g).down);
    let h = placePiece(hot(), "h", "honeycomb:normal", 0, 0);
    h = run(h, 8000);
    let b = placePiece(hot(), "a", "boar_belly:normal", 0, 0);
    b = run(b, 8000);
    expect(piece(h, "h").char).toBeGreaterThan(piece(b).char);
  });
  it("flips sides and counts the flips", () => {
    let g = run(placePiece(hot(), "a", "boar_belly:normal", 0, 0), 4000);
    const before = piece(g).down;
    g = flipPiece(g, "a");
    expect(piece(g).up).toBe(before);
    expect(piece(g).down).toBe(0);
    expect(piece(g).flips).toBe(1);
  });
  it("shows juice on top when the bottom is nearly done and the top still raw", () => {
    let g = placePiece(hot(), "a", "boar_belly:normal", 0, 0);
    expect(juicy(piece(g))).toBe(false);
    g = run(g, G.sideMs * 0.8);
    expect(juicy(piece(g))).toBe(true);
  });
  it("chars a forgotten piece and soots the plate", () => {
    const g = run(placePiece(hot(), "a", "boar_belly:normal", 0, 0), 25_000);
    expect(piece(g).char).toBeGreaterThan(0.5);
    expect(g.soot).toBeGreaterThan(0);
  });
});

describe("handling", () => {
  it("pulls a piece dropped off the plate back onto it", () => {
    const g = placePiece(hot(), "a", "boar_belly:normal", 2, 0);
    expect(Math.hypot(piece(g).x, piece(g).y)).toBeLessThanOrEqual(1);
    const m = movePiece(g, "a", 0, -3);
    expect(Math.hypot(piece(m).x, piece(m).y)).toBeLessThanOrEqual(1);
  });
  it("loses juice when cut half raw, and cooks the cut faces after", () => {
    const early = cutPiece(run(placePiece(hot(), "a", "boar_belly:normal", 0, 0), 1000), "a");
    expect(piece(early).cutEarly).toBe(true);
    let g = run(placePiece(hot(), "a", "boar_belly:normal", 0, 0), G.sideMs);
    g = run(flipPiece(g, "a"), G.sideMs);
    g = cutPiece(g, "a");
    expect(piece(g).cutEarly).toBe(false);
    g = run(g, G.cutFaceMs);
    expect(piece(g).cutFace).toBeGreaterThanOrEqual(0.95);
  });
  it("fries garlic in the pork fat pooling at the low edge, only when there is fat", () => {
    const lonely = run(placePiece(hot(), "g", "wild_garlic", 0, 0.8), 3000);
    expect(piece(lonely, "g").fried).toBe(0);
    let g = placePiece(hot(), "a", "boar_belly:normal", 0, -0.2);
    g = run(g, 6000); // the belly lets its fat out
    g = run(placePiece(g, "g", "wild_garlic", 0, 0.8), 3000);
    expect(piece(g, "g").fried).toBeGreaterThan(0.5);
  });
  it("allows at most three different items on the plate, each once", () => {
    expect(canPlate(["boar_belly:normal"], "perilla")).toBe(true);
    expect(canPlate(["boar_belly:normal"], "boar_belly:premium")).toBe(false);
    expect(canPlate(["boar_belly:normal", "perilla", "wild_garlic"], "shiitake")).toBe(false);
    expect(canPlate([], "nonsense")).toBe(false);
  });
});

describe("judgePiece", () => {
  function cooked(flips: number) {
    let g = placePiece(hot(), "a", "boar_belly:normal", 0, 0);
    g = run(g, G.sideMs);
    for (let i = 0; i < flips; i++) g = run(flipPiece(g, "a"), i === flips - 1 ? G.sideMs : 300);
    g = run(cutPiece(g, "a"), G.cutFaceMs);
    return piece(g);
  }
  it("rates both sides just right with one flip near the top, praising it", () => {
    const r = judgePiece(cooked(1));
    expect(r.accuracy).toBeGreaterThan(0.9);
    expect(r.notes).toContain("perfect");
    expect(r.notes).toContain("onceFlip");
  });
  it("takes points for flipping again and again", () => {
    const r = judgePiece(cooked(5));
    expect(r.notes).toContain("manyFlips");
    expect(r.accuracy).toBeLessThan(judgePiece(cooked(1)).accuracy);
  });
  it("calls out raw, burnt and stuck pieces", () => {
    expect(judgePiece(piece(run(placePiece(hot(), "a", "boar_belly:normal", 0, 0), 2000))).notes).toContain("raw");
    expect(judgePiece(piece(run(placePiece(hot(), "a", "boar_belly:normal", 0, 0), 25_000))).notes).toContain("burnt");
    expect(judgePiece(piece(placePiece(newGrill(), "a", "boar_belly:normal", 0, 0))).notes).toContain("stuck");
  });
  it("stays between 0 and 1", () => {
    for (const ms of [0, 1000, 9000, 60_000]) {
      const r = judgePiece(piece(run(placePiece(hot(), "a", "boar_belly:normal", 0, 0), ms)));
      expect(r.accuracy).toBeGreaterThanOrEqual(0);
      expect(r.accuracy).toBeLessThanOrEqual(1);
    }
  });
});

describe("big frames", () => {
  it("gives about the same result for one 10 s frame as for many small ones, never NaN", () => {
    const big = stepGrill(placePiece(hot(), "a", "boar_belly:normal", 0, 0), 10_000);
    const small = run(placePiece(hot(), "a", "boar_belly:normal", 0, 0), 10_000, 16);
    expect(piece(big).down).toBeCloseTo(piece(small).down, 1);
    expect(Number.isFinite(piece(big).char)).toBe(true);
    expect(stepGrill(big, -5)).toEqual(big);
  });
});

describe("salt", () => {
  it("counts salt shaken on before cooking as salting first", () => {
    let g = saltPiece(placePiece(hot(), "a", "boar_neck:normal", 0, 0), "a");
    expect(piece(g).salt).toBe(1);
    expect(piece(g).saltEarly).toBe(true);
    g = run(g, G.sideMs);
    expect(piece(saltPiece(g, "a")).saltEarly).toBe(true);
    const late = saltPiece(run(placePiece(hot(), "b", "boar_neck:normal", 0, 0), G.sideMs), "b");
    expect(piece(late, "b").saltEarly).toBe(false);
  });
  it("praises salting first and calls too much salt salty", () => {
    const done = (g: Grill) => {
      g = run(g, G.sideMs * 1.3);
      g = run(flipPiece(g, "a"), G.sideMs * 1.3);
      return run(restPiece(g, "a"), G.restNeededMs);
    };
    const salted = judgePiece(piece(done(saltPiece(placePiece(hot(), "a", "boar_neck:normal", 0, 0), "a"))));
    const plain = judgePiece(piece(done(placePiece(hot(), "a", "boar_neck:normal", 0, 0))));
    expect(salted.notes).toContain("saltFirst");
    expect(salted.accuracy).toBeGreaterThanOrEqual(plain.accuracy);
    let heavy = placePiece(hot(), "a", "boar_neck:normal", 0, 0);
    for (let i = 0; i < G.saltMax + 2; i++) heavy = saltPiece(heavy, "a");
    expect(judgePiece(piece(done(heavy))).notes).toContain("salty");
  });
});

describe("resting", () => {
  // a thick pork neck, both sides just done, straight off the grill
  function offTheGrill() {
    let g = run(placePiece(hot(), "a", "boar_neck:normal", 0, 0), G.sideMs * 1.33);
    return run(flipPiece(g, "a"), G.sideMs * 1.33);
  }
  it("leaves the inside behind the outside while it cooks", () => {
    const p = piece(offTheGrill());
    expect(p.core).toBeLessThan((p.up + p.down) / 2);
  });
  it("calls a thick piece served without resting undercooked inside", () => {
    expect(judgePiece(piece(offTheGrill())).notes).toContain("insideRaw");
  });
  it("brings the inside up on the board, off the heat, and praises the rest", () => {
    let g = restPiece(offTheGrill(), "a");
    const surface = piece(g).down;
    g = run(g, G.restNeededMs);
    expect(piece(g).onBoard).toBe(true);
    expect(piece(g).down).toBe(surface); // no more heat from below
    const r = judgePiece(piece(g));
    expect(r.notes).not.toContain("insideRaw");
    expect(r.notes).toContain("rested");
    expect(r.accuracy).toBeGreaterThan(judgePiece(piece(offTheGrill())).accuracy);
  });
  it("matters little for thin pork belly", () => {
    let g = run(placePiece(hot(), "a", "boar_belly:normal", 0, 0), G.sideMs);
    g = run(flipPiece(g, "a"), G.sideMs);
    expect(judgePiece(piece(g)).notes).not.toContain("insideRaw");
  });
  it("goes back on the heat when moved from the board to the grill", () => {
    const g = movePiece(restPiece(offTheGrill(), "a"), "a", 0, 0);
    expect(piece(g).onBoard).toBe(false);
    expect(piece(run(g, 1000)).down).toBeGreaterThan(piece(g).down);
  });
  it("cooks the inside faster once cut on the grill (the cut faces sear)", () => {
    const whole = run(placePiece(hot(), "a", "boar_neck:normal", 0, 0), 6000);
    const cut = run(cutPiece(placePiece(hot(), "a", "boar_neck:normal", 0, 0), "a"), 6000);
    expect(piece(cut).core).toBeGreaterThan(piece(whole).core);
  });
});

describe("tool quality", () => {
  it("lets a better grill take longer to burn past just right", () => {
    const base = stepGrill(placePiece(hot(), "a", "boar_belly:normal", 0, 0), 16_000);
    const better = stepGrill(placePiece(hot(), "a", "boar_belly:normal", 0, 0), 16_000, 1.3);
    expect(piece(better).char).toBeLessThan(piece(base).char);
    expect(piece(better).down).toBeCloseTo(piece(base).down, 5); // cooks at the same pace
  });
});
