import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext } from "../actions";
import { BALANCE } from "../balance";
import { newSave, type SaveData } from "../save";
import { planService } from "./plan";

const SV = BALANCE.service;
const ctx = (now: number): ActionContext => ({ now, random: () => 0.37 });

const kitchen: SaveData = {
  ...newSave(),
  stage: "kitchen",
  day: 3,
  reputation: 20,
  dishes: { grilled_belly: 1, garlic_neck: 1 },
  items: { "boar_belly:normal": 1, "boar_neck:normal": 1, wild_garlic: 1 },
};

// tonight: 3 plates of pork belly at 40, 3 of garlic neck at 50
function opened(now = 1_000_000) {
  const r = applyAction(kitchen, { type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }, { dish: "garlic_neck", sets: 1 }] }, ctx(now));
  if (r.error) throw new Error(r.error);
  return r.save;
}

describe("finishService (stage 1: plates go out when an order is tapped)", () => {
  const s0 = opened();
  const svc = s0.service!;
  const customers = planService(svc.seed, { day: kitchen.day, reputation: kitchen.reputation, menu: ["grilled_belly", "garlic_neck"] });
  const after = (ms: number) => ctx(svc.startedAt + ms);
  const report = (served: unknown[], left: unknown[] = [], extra: object = {}) => ({ type: "finishService", serviceId: svc.id, served, left, ...extra });
  const c = customers;
  const late = Math.max(...c.map((x) => x.arriveMs)) + 60_000;

  it("pays tonight's price per plate, moves reputation and keeps a summary", () => {
    const r = applyAction(s0, report([{ customer: c[0].id, dish: "grilled_belly" }, { customer: c[1].id, dish: "garlic_neck" }]), after(late));
    expect(r.error).toBeUndefined();
    expect(r.save.gold).toBe(90);
    expect(r.save.stage).toBe("settle");
    expect(r.save.service).toBeNull();
    // 6 plates, so every customer up to 6 who went without counts as gone
    const gone = Math.min(c.length, 6) - 2;
    expect(r.save.lastService).toEqual({ id: svc.id, served: 2, left: gone, sales: 90, tips: 0, happy: 2, repDelta: 2 * SV.rep.happy + gone * SV.rep.left });
    expect(r.save.reputation).toBe(Math.max(0, 20 + 2 * SV.rep.happy + gone * SV.rep.left));
  });
  it("does not count customers who came after every plate was sold as gone", () => {
    const served = c.slice(0, 6).map((x, i) => ({ customer: x.id, dish: i < 3 ? "grilled_belly" : "garlic_neck" }));
    const r = applyAction(s0, report(served), after(late));
    expect(r.error).toBeUndefined();
    expect(r.save.lastService!.left).toBe(0);
  });
  it("refuses more plates of a dish than were made, a dish not cooked tonight, unknown or repeated customers", () => {
    const four = c.slice(0, 4).map((x) => ({ customer: x.id, dish: "grilled_belly" }));
    expect(applyAction(s0, report(four), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report([{ customer: c[0].id, dish: "baeksuk" }]), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report([{ customer: "c999", dish: "grilled_belly" }]), after(late)).error).toBe("bad_service");
    const twice = [{ customer: c[0].id, dish: "grilled_belly" }, { customer: c[0].id, dish: "grilled_belly" }];
    expect(applyAction(s0, report(twice), after(late)).error).toBe("bad_service");
  });
  it("refuses a report faster than the customers could come or the plates could go out", () => {
    const last = c[c.length - 1];
    expect(applyAction(s0, report([{ customer: last.id, dish: "grilled_belly" }]), after(last.arriveMs - 1)).error).toBe("bad_service");
    // the first customer arrives at firstArriveMs (3 s), one plate needs minMsPerServe (4 s)
    expect(applyAction(s0, report([{ customer: c[0].id, dish: "grilled_belly" }]), after(SV.minMsPerServe - 1)).error).toBe("bad_service");
  });
  it("refuses a left list naming served, unknown or repeated customers", () => {
    const one = [{ customer: c[0].id, dish: "grilled_belly" }];
    expect(applyAction(s0, report(one, [c[0].id]), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report(one, ["c999"]), after(late)).error).toBe("bad_service");
    expect(applyAction(s0, report(one, [c[1].id, c[1].id]), after(late)).error).toBe("bad_service");
  });
  it("changes nothing when the settled report is sent again", () => {
    const done = applyAction(s0, report([{ customer: c[0].id, dish: "grilled_belly" }]), after(late)).save;
    const again = applyAction(done, report([{ customer: c[0].id, dish: "grilled_belly" }]), after(late));
    expect(again.error).toBeUndefined();
    expect(again.save).toBe(done);
  });
  it("refuses a report with no service going on", () => {
    expect(applyAction(kitchen, report([]), after(late)).error).toBe("bad_service");
  });
});
