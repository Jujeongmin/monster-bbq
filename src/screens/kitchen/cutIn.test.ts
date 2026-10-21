import { describe, expect, it } from "vitest";
import { CUT_IN_MS, cutInStep } from "./cutIn";

describe("the new dish's cooking cut (Bancho-style, user 2026-10-21)", () => {
  it("closes the bars first, then drops the makings on the grill one by one", () => {
    expect(cutInStep(100, 3)).toMatchObject({ phase: "in", landed: 0, frame: "grill" });
    expect(cutInStep(400, 3).phase).toBe("drop");
    expect(cutInStep(400, 3).landed).toBe(0);
    expect(cutInStep(900, 3).landed).toBe(2);
    expect(cutInStep(1450, 3).landed).toBe(3);
  });
  it("works the fire next: Bandal flipping fast, the room shaking, a white flash at the end", () => {
    const fire = cutInStep(1800, 3);
    expect(fire).toMatchObject({ phase: "fire", landed: 3, shake: true, flash: false });
    expect(new Set([cutInStep(1600, 3).frame, cutInStep(1720, 3).frame])).toEqual(new Set(["grill", "turn"]));
    expect(cutInStep(2500, 3).flash).toBe(true);
  });
  it("then the dish lands with its name stamped, Bandal holding it out, and his smile with his line", () => {
    expect(cutInStep(2800, 3)).toMatchObject({ phase: "plate", frame: "serve", stamp: true, line: false, shake: false });
    expect(cutInStep(3800, 3)).toMatchObject({ phase: "smile", frame: "smile", stamp: true, line: true, done: false });
    expect(cutInStep(CUT_IN_MS, 3).done).toBe(true);
  });
});
