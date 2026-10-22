import { describe, expect, it } from "vitest";
import { fitGameWidth, GAME_HEIGHT } from "./config";

describe("fitGameWidth", () => {
  it("is 640 at 16:9 and wider on a longer phone, in even pixels", () => {
    expect(fitGameWidth(16 / 9)).toBe(640);
    expect(fitGameWidth(844 / 390)).toBe(780);
    expect(fitGameWidth(2)).toBe(720);
    expect(GAME_HEIGHT).toBe(360);
  });
  it("never narrower than 16:9 nor wider than 19.5:9", () => {
    expect(fitGameWidth(4 / 3)).toBe(640);
    expect(fitGameWidth(3)).toBe(780);
  });
});
