import { describe, expect, it } from "vitest";
import { pipsOf } from "./pips";

describe("a friend's stat as cells that fill one at a time", () => {
  it("one cell a 30 points, at least one for any stat, all ten from 300", () => {
    expect([0, 5, 20, 45, 70, 145, 300, 807].map(pipsOf)).toEqual([0, 1, 1, 2, 2, 5, 10, 10]);
  });
});
