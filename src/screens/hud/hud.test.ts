import { describe, expect, it } from "vitest";
import { bagRows, notebookApps, receiptAt, receiptLines, sceneOf, showDayHud, timeOfDay, transitionCard, RECEIPT } from "./hud";

const summary = { id: "s", served: 8, left: 4, sales: 360, tips: 61, drinks: 15, cleaned: 1, happy: 8, repDelta: 0, dishes: [{ dish: "grilled_belly" as const, plates: 4, gold: 160 }, { dish: "garlic_neck" as const, plates: 4, gold: 200 }] };

describe("the day HUD", () => {
  it("names the time of day from the stage of the day", () => {
    expect(timeOfDay("hunt", null)).toBe("morning"); // setting out
    expect(timeOfDay("hunt", "morning")).toBe("morning");
    expect(timeOfDay("lunch", null)).toBe("noon");
    expect(timeOfDay("hunt", "afternoon")).toBe("afternoon");
    expect(timeOfDay("kitchen", null)).toBe("evening");
    expect(timeOfDay("service", null)).toBe("night");
    expect(timeOfDay("settle", null)).toBe("night");
  });
  it("steps aside while hunting and during the night's service, which carry their own HUD", () => {
    expect(showDayHud("hunt", false)).toBe(true);
    expect(showDayHud("hunt", true)).toBe(false);
    expect(showDayHud("service", false)).toBe(false);
    expect(["lunch", "kitchen", "settle"].every((p) => showDayHud(p as "lunch", false))).toBe(true);
  });
});

describe("the bag", () => {
  const items = { "boar_neck:normal": 2, "boar_belly:normal": 3, "boar_belly:premium": 1, shiitake: 4, iron_ore: 2, "rabbit_leg:normal": 0 };
  it("lists one tab's items in the item table's order, premium before normal, none of the empty ones", () => {
    expect(bagRows(items, "part").map((c) => c.key)).toEqual(["boar_belly:premium", "boar_belly:normal", "boar_neck:normal"]);
    expect(bagRows(items, "part")[0]).toMatchObject({ id: "boar_belly", premium: true, count: 1 });
    expect(bagRows(items, "forage").map((c) => c.key)).toEqual(["shiitake"]);
    expect(bagRows(items, "material").map((c) => c.key)).toEqual(["iron_ore"]);
  });
  it("skips keys that are not items", () => {
    expect(bagRows({ nonsense: 3, "boar_belly:gold": 2 }, "part")).toEqual([]);
  });
});

describe("Grandma's notebook", () => {
  it("opens the menu board only in the evening kitchen, everything else always", () => {
    const at = (p: "kitchen" | "lunch") => Object.fromEntries(notebookApps(p).map((a) => [a.app, a.open]));
    expect(at("kitchen")).toEqual({ bag: true, upgrade: true, awaken: true, cookbook: true, menu: true, shop: true });
    expect(at("lunch").menu).toBe(false);
    expect(notebookApps("settle").map((a) => a.app)).toEqual(["bag", "upgrade", "awaken", "cookbook", "menu", "shop"]);
  });
});

describe("the night's receipt", () => {
  it("lists the night line by line, the scrubbing only when there was some, the total of what came in", () => {
    const r = receiptLines(summary, 40);
    expect(r.total).toBe(360 + 61 + 15);
    expect(r.lines.map((l) => l.key)).toEqual(["receipt.guests", "receipt.dish", "receipt.dish", "receipt.sales", "receipt.tips", "receipt.drinks", "receipt.cleaned", "receipt.rep"]);
    expect(r.lines[1]).toEqual({ key: "receipt.dish", dish: "grilled_belly", vars: { n: 4, gold: 160 } });
    expect(receiptLines({ ...summary, cleaned: 0 }, 40).lines.map((l) => l.key)).not.toContain("receipt.cleaned");
    expect(r.lines.find((l) => l.key === "receipt.rep")!.vars).toEqual({ rep: 40, delta: "+0" });
  });
  it("brings the lines up one by one, then rolls the total up, then is done", () => {
    expect(receiptAt(0, 6, 400)).toEqual({ shown: 0, total: 0, done: false });
    expect(receiptAt(RECEIPT.lineMs * 2, 6, 400).shown).toBe(2);
    const rolling = receiptAt(RECEIPT.lineMs * 6 + RECEIPT.rollMs / 2, 6, 400);
    expect(rolling).toEqual({ shown: 6, total: 200, done: false });
    expect(receiptAt(RECEIPT.lineMs * 6 + RECEIPT.rollMs, 6, 400)).toEqual({ shown: 6, total: 400, done: true });
    expect(receiptAt(Infinity, 6, 400)).toEqual({ shown: 6, total: 400, done: true });
  });
});

describe("the title card between the stages of the day", () => {
  it("names where the day goes next, with its time of day", () => {
    expect(transitionCard("settle", "prep")).toEqual({ time: "morning", line: "card.prep" });
    expect(transitionCard("prep", "hunt-morning")).toEqual({ time: "morning", line: "card.huntMorning" });
    expect(transitionCard("hunt-morning", "lunch")).toEqual({ time: "noon", line: "card.lunch" });
    expect(transitionCard("lunch", "hunt-afternoon")).toEqual({ time: "afternoon", line: "card.huntAfternoon" });
    expect(transitionCard("hunt-afternoon", "kitchen")).toEqual({ time: "evening", line: "card.kitchen" });
    expect(transitionCard("kitchen", "service")).toEqual({ time: "night", line: "card.service" });
  });
  it("shows none on the first screen, for the same stage, or for the receipt (it is its own show)", () => {
    expect(transitionCard(null, "kitchen")).toBeNull();
    expect(transitionCard("lunch", "lunch")).toBeNull();
    expect(transitionCard("service", "settle")).toBeNull();
  });
  it("tells the stages apart by the hunt", () => {
    expect(sceneOf("hunt", null)).toBe("prep");
    expect(sceneOf("hunt", "afternoon")).toBe("hunt-afternoon");
    expect(sceneOf("kitchen", null)).toBe("kitchen");
  });
});
