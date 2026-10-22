import { describe, expect, it } from "vitest";
import { newSave, type SaveData } from "../../../shared/save";
import { appAlerts, awakenDue, upgradeDue } from "./alerts";
import { UPGRADE_IDS } from "../../../shared/growth";
import { AWAKEN_GEAR } from "../../../shared/awaken";
import type { App } from "./hud";

const ALL: App[] = ["bag", "upgrade", "awaken", "friends", "cookbook", "menu", "shop", "ranking"];
const opened = new Set<App>(ALL);
const none = new Set<App>();
const used = (s: SaveData): SaveData => ({ ...s, staff: { ...s.staff, freeUsed: true } });
const hunted = (s: SaveData): SaveData => ({ ...s, items: { "chicken_breast:normal": 2 }, seenItems: ["chicken_breast"] });

describe("the notebook's ! marks (user, 2026-10-21: explanations A+C)", () => {
  it("marks nothing on a fresh save but the free postcard (no clutter on the first day)", () => {
    expect(appAlerts(newSave(), none, "hunt")).toEqual(["friends"]);
  });
  it("marks the bag and the cookbook once there is something in them, until first opened", () => {
    expect(appAlerts(hunted(used(newSave())), none, "lunch")).toEqual(["bag", "cookbook"]);
    expect(appAlerts(hunted(used(newSave())), opened, "lunch")).toEqual([]);
  });
  it("marks the menu board in the evening kitchen until first opened", () => {
    expect(appAlerts(used(newSave()), none, "kitchen")).toContain("menu");
    expect(appAlerts(used(newSave()), opened, "kitchen")).not.toContain("menu");
  });
  it("marks the upgrades whenever one can be bought now", () => {
    expect(appAlerts({ ...used(newSave()), gold: 200 }, opened, "hunt")).toEqual(["upgrade"]);
    expect(appAlerts({ ...used(newSave()), gold: 199 }, opened, "hunt")).toEqual([]);
  });
  it("marks the old friends while the free postcard is unused, even after opening", () => {
    expect(appAlerts(newSave(), opened, "hunt")).toEqual(["friends"]);
  });
  it("marks awakening and the shop once the golden charcoal is known, and awakening again when one can be done", () => {
    const knows = { ...used(newSave()), charcoal: 5 };
    expect(appAlerts(knows, none, "hunt")).toEqual(expect.arrayContaining(["awaken", "shop"]));
    expect(appAlerts({ ...knows, gold: 200 }, new Set(ALL), "hunt")).toEqual(expect.arrayContaining(["awaken"]));
  });
  it("marks the ranking from the second day until first opened", () => {
    expect(appAlerts({ ...used(newSave()), day: 2 }, none, "hunt")).toContain("ranking");
    expect(appAlerts({ ...used(newSave()), day: 2 }, opened, "hunt")).not.toContain("ranking");
  });
});

describe("the marks inside an app (user, 2026-10-22: what the notebook's ! is about)", () => {
  it("points at the upgrades the gold covers now, the same ones the app's ! counts", () => {
    const rich = { ...used(newSave()), gold: 200 };
    const due = UPGRADE_IDS.filter((id) => upgradeDue(rich, id));
    expect(due.length).toBeGreaterThan(0);
    expect(UPGRADE_IDS.filter((id) => upgradeDue({ ...rich, gold: 0 }, id))).toEqual([]);
  });
  it("points at the gear that can be awakened now", () => {
    const knows = { ...used(newSave()), charcoal: 5, gold: 200 };
    expect(AWAKEN_GEAR.some((g) => awakenDue(knows, g))).toBe(true);
    expect(AWAKEN_GEAR.some((g) => awakenDue({ ...knows, charcoal: 0, gold: 0 }, g))).toBe(false);
  });
});
