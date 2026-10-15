import { describe, expect, it } from "vitest";
import { isSideWeaponId, SIDE_WEAPONS } from "./sideWeapons";

describe("side weapons", () => {
  it("lists the four the hunter can carry, one at a time", () => {
    expect(SIDE_WEAPONS).toEqual(["sling", "sleepGun", "netGun", "firecracker"]);
    expect([isSideWeaponId("netGun"), isSideWeaponId("bazooka"), isSideWeaponId(3)]).toEqual([true, false, false]);
  });
});
