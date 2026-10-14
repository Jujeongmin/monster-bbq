import { describe, expect, it } from "vitest";
import { newSave, readSave } from "./save";

describe("newSave", () => {
  it("starts on day 1 with nothing", () => {
    expect(newSave()).toEqual({ version: 1, day: 1, gold: 0, meat: { premium: 0, normal: 0 } });
  });
});

describe("readSave", () => {
  it("keeps a valid save as it is", () => {
    const s = { version: 1, day: 4, gold: 120, meat: { premium: 2, normal: 3 } };
    expect(readSave(s)).toEqual(s);
  });
  it("starts fresh for nothing, garbage or an unknown version", () => {
    expect(readSave(undefined)).toEqual(newSave());
    expect(readSave("nope")).toEqual(newSave());
    expect(readSave({ version: 99, day: 5 })).toEqual(newSave());
  });
  it("repairs broken fields instead of failing", () => {
    expect(readSave({ version: 1, day: -3, gold: "x", meat: { premium: 2.7, normal: null } })).toEqual({
      version: 1,
      day: 1,
      gold: 0,
      meat: { premium: 2, normal: 0 },
    });
  });
});
