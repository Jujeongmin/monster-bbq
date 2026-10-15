import { describe, expect, it } from "vitest";
import { CUT_IN_MS, cutInStep } from "./cutIn";

describe("cutInStep", () => {
  it("runs the Bandal cut-in in order: grill, flip, the plate with the stamp, the secret smile with the lid's line", () => {
    expect(cutInStep(0)).toEqual({ frame: "grill", stamp: false, line: false, done: false });
    expect(cutInStep(1000)).toEqual({ frame: "turn", stamp: false, line: false, done: false });
    expect(cutInStep(2000)).toEqual({ frame: "serve", stamp: true, line: false, done: false });
    expect(cutInStep(3000)).toEqual({ frame: "smile", stamp: true, line: true, done: false });
    expect(cutInStep(CUT_IN_MS)).toEqual({ frame: "smile", stamp: true, line: true, done: true });
  });
});
