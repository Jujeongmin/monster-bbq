import { BALANCE } from "../balance";
import { isDishId, type DishId } from "../content/dishes";
import { seatBonus } from "../growth";
import type { SaveData } from "../save";
import { planService } from "./plan";

const SV = BALANCE.service;
const MAX_SERVED = 60;

// The night's report checked against the customers the seed brought (restaurant v2, stage 1: a plate
// goes out the moment its order is tapped). Each served customer real, once, already arrived, given a
// dish cooked tonight, no more plates of a dish than were made; not faster than minMsPerServe a plate.
// Pays tonight's price per plate (no tips until the waiter serves by hand, stage 2). Every plate served
// is a happy customer; customers who went without while there were plates to give count as gone (those
// after the last plate do not). The same report sent again after it was settled changes nothing.
export function settleService(save: SaveData, a: Record<string, unknown>, now: number): { save: SaveData; error?: string } {
  if (typeof a.serviceId === "string" && a.serviceId === save.lastService?.id) return { save };
  const svc = save.service;
  const bad = { save, error: "bad_service" };
  if (!svc || a.serviceId !== svc.id || !Array.isArray(a.served) || !Array.isArray(a.left) || a.served.length > MAX_SERVED || a.left.length > MAX_SERVED) return bad;
  const menu = svc.dishes.map((d) => d.dish);
  const customers = new Map(planService(svc.seed, { day: save.day, reputation: save.reputation, menu, seats: seatBonus(save) }).map((c) => [c.id, c]));
  const plates = new Map(svc.dishes.map((d) => [d.dish, d.plates]));
  const price = new Map(svc.dishes.map((d) => [d.dish, d.price]));
  const seen = new Set<string>();
  let sales = 0;
  let latest = 0;
  for (const raw of a.served as unknown[]) {
    const e = raw as { customer?: unknown; dish?: unknown } | null;
    if (!e || typeof e !== "object" || typeof e.customer !== "string" || seen.has(e.customer) || !isDishId(e.dish)) return bad;
    const c = customers.get(e.customer);
    const left = plates.get(e.dish as DishId) ?? 0;
    if (!c || left < 1) return bad;
    plates.set(e.dish, left - 1);
    seen.add(e.customer);
    latest = Math.max(latest, c.arriveMs);
    sales += price.get(e.dish)!;
  }
  for (const id of a.left as unknown[]) {
    if (typeof id !== "string" || !customers.has(id) || seen.has(id)) return bad;
  }
  if (new Set(a.left as string[]).size !== (a.left as string[]).length) return bad;
  const elapsed = now - svc.startedAt;
  if (elapsed < latest || elapsed < seen.size * SV.minMsPerServe) return bad;
  const made = svc.dishes.reduce((n, d) => n + d.plates, 0);
  const gone = Math.max(0, Math.min(customers.size, made) - seen.size);
  const happy = seen.size;
  const reputation = Math.max(0, save.reputation + happy * SV.rep.happy + gone * SV.rep.left);
  return {
    save: {
      ...save,
      gold: save.gold + sales,
      reputation,
      stage: "settle",
      service: null,
      lastService: { id: svc.id, served: seen.size, left: gone, sales, tips: 0, happy, repDelta: reputation - save.reputation },
    },
  };
}
