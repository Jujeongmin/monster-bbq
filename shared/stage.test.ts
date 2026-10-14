import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "./actions";
import type { DishId } from "./content/dishes";
import type { Recipe } from "./kitchen/cook";
import { newSave, readSave, type SaveData } from "./save";

// The day goes hunt -> kitchen -> (service) -> settle -> next day, and the server holds which stage it
// is in, so a reload cannot skip ahead or hunt twice in one day.
const TABLE = { grilled_belly: { method: "grill", items: ["boar_belly"] } } as Record<DishId, Recipe>;
const ctx = (now = 1_000_000): ActionContext => ({ now, random: () => 0.4, recipes: TABLE });

function hunted(): SaveData {
  const s = applyAction(newSave(), { type: "startHunt", zone: "forest" }, ctx()).save;
  const r = applyAction(s, { type: "finishHunt", huntId: s.hunt!.id, events: [], ko: false }, ctx());
  if (r.error) throw new Error(r.error);
  return r.save;
}

describe("the day's stage", () => {
  it("starts a new save at the hunt", () => {
    expect(newSave().stage).toBe("hunt");
  });
  it("moves to the kitchen once the hunt is settled, and refuses a second hunt that day", () => {
    const s = hunted();
    expect(s.stage).toBe("kitchen");
    expect(applyAction(s, { type: "startHunt", zone: "forest" }, ctx()).error).toBe("wrong_stage");
  });
  it("opens the shop only from the kitchen, and settles to the settle stage", () => {
    expect(applyAction({ ...newSave(), menu: ["grilled_belly"], cookbook: TABLE, items: { "boar_belly:normal": 1 } }, { type: "startService" }, ctx()).error).toBe("wrong_stage");
    const k = { ...hunted(), menu: ["grilled_belly" as DishId], cookbook: TABLE, items: { "boar_belly:normal": 1 } };
    const open = applyAction(k, { type: "startService" }, ctx()).save;
    const done = applyAction(open, { type: "finishService", serviceId: open.service!.id, served: [], left: [] }, ctx(2_000_000));
    expect(done.error).toBeUndefined();
    expect(done.save.stage).toBe("settle");
  });
  it("ends the day from the settle stage, or from the kitchen when the shop stays shut, but not mid-hunt", () => {
    const settled = { ...newSave(), stage: "settle" as const };
    expect(applyAction(settled, { type: "endDay" }, ctx()).save).toMatchObject({ day: 2, stage: "hunt" });
    expect(applyAction(hunted(), { type: "endDay" }, ctx()).save).toMatchObject({ day: 2, stage: "hunt" });
    expect(applyAction(newSave(), { type: "endDay" }, ctx()).error).toBe("wrong_stage");
  });
  it("reads an older save at the stage it must be in", () => {
    const v4 = { ...newSave(), version: 4, stage: undefined };
    expect(readSave(v4).stage).toBe("hunt");
    expect(readSave({ ...v4, service: { id: "s1", seed: 1, startedAt: 0, menu: [] } }).stage).toBe("kitchen");
    expect(readSave({ ...newSave(), stage: "dancing" }).stage).toBe("hunt");
  });
});
