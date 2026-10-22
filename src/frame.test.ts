import { describe, expect, it } from "vitest";
import { frameSize, isTyping } from "./frame";

describe("frameSize", () => {
  it("fills a phone held sideways edge to edge (iPhone 12 Pro, 19.5:9)", () => {
    expect(frameSize(844, 390)).toEqual({ width: 844, height: 390, s: 1 });
  });
  it("stops widening past 19.5:9, with narrow bars at the sides", () => {
    expect(frameSize(1000, 390)).toEqual({ width: 844, height: 390, s: 1 });
  });
  it("is 16:9 on a 16:9 screen, at a whole pixel scale", () => {
    expect(frameSize(1280, 720)).toEqual({ width: 1280, height: 720, s: 2 });
  });
  it("keeps 16:9 in a squarer window, with bars above and below", () => {
    expect(frameSize(1280, 1000)).toEqual({ width: 1280, height: 720, s: 2 });
  });
  it("is never zero, even in a collapsed window", () => {
    expect(frameSize(0, 0)).toEqual({ width: 1, height: 1, s: 1 });
  });
});

describe("isTyping", () => {
  it("is on while a text box has the focus (the phone's keyboard is up)", () => {
    expect(isTyping({ tagName: "INPUT" })).toBe(true);
    expect(isTyping({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTyping({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });
  it("is off for anything else", () => {
    expect(isTyping({ tagName: "BUTTON" })).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
