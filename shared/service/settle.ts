import { BALANCE } from "../balance";
import { isDishId, type DishId } from "../content/dishes";
import { RECIPES } from "../content/recipes";
import type { SaveData } from "../save";
import { planService } from "./plan";

const SV = BALANCE.service;
const MAX_SERVED = 60;

export type Pour = "bad" | "good" | "perfect";
const isPour = (v: unknown): v is Pour => v === "bad" || v === "good" || v === "perfect";

// One served guest in the night's report: the dish, how long after coming in they got it, and how the
// drink they asked for was poured (missing = none poured).
export interface ServedEntry {
  customer: string;
  dish: DishId;
  waitMs: number;
  drink?: Pour;
}

// A plate's tip as a share of its price, by how much of the guest's patience the wait used.
export function tipRate(waitMs: number, patienceMs: number): number {
  const used = waitMs / patienceMs;
  return used <= SV.tips.within[0] ? SV.tips.rate[0] : used <= SV.tips.within[1] ? SV.tips.rate[1] : 0;
}

// The night's report checked against the customers the seed brought (restaurant v2 design 4). Each
// served customer real, once, given a dish cooked tonight, no more plates of a dish than were made; the
// wait no shorter than the dish takes Bandal and no longer than that guest's patience, and over before
// the report came; a pour only for a guest who asked for a drink. The wait and the pour are the page's
// word, so what they can earn is capped (best tip, perfect pour). The server pays tonight's price per
// plate, the tip, the drinks, and moves the reputation; customers who went without while there were
// plates to give count as gone (those after the last plate do not). The same report sent again after it
// was settled changes nothing.
export function settleService(save: SaveData, a: Record<string, unknown>, now: number): { save: SaveData; error?: string } {
  if (typeof a.serviceId === "string" && a.serviceId === save.lastService?.id) return { save };
  const svc = save.service;
  const bad = { save, error: "bad_service" };
  if (!svc || a.serviceId !== svc.id || !Array.isArray(a.served) || !Array.isArray(a.left) || a.served.length > MAX_SERVED || a.left.length > MAX_SERVED) return bad;
  const menu = svc.dishes.map((d) => d.dish);
  const customers = new Map(planService(svc.seed, { day: save.day, reputation: save.reputation, menu }).map((c) => [c.id, c]));
  const plates = new Map(svc.dishes.map((d) => [d.dish, d.plates]));
  const price = new Map(svc.dishes.map((d) => [d.dish, d.price]));
  const seen = new Set<string>();
  const elapsed = now - svc.startedAt;
  let sales = 0;
  let tips = 0;
  let drinks = 0;
  let badPours = 0;
  for (const raw of a.served as unknown[]) {
    const e = raw as Partial<Record<keyof ServedEntry, unknown>> | null;
    if (!e || typeof e !== "object" || typeof e.customer !== "string" || seen.has(e.customer) || !isDishId(e.dish)) return bad;
    const c = customers.get(e.customer);
    const left = plates.get(e.dish) ?? 0;
    if (!c || left < 1) return bad;
    const wait = e.waitMs;
    if (typeof wait !== "number" || !Number.isFinite(wait) || wait < RECIPES[e.dish].cookMs || wait > c.patienceMs || c.arriveMs + wait > elapsed) return bad;
    if (e.drink !== undefined && (!isPour(e.drink) || c.drink === "none")) return bad;
    plates.set(e.dish, left - 1);
    seen.add(e.customer);
    const p = price.get(e.dish)!;
    sales += p;
    const perfectTea = c.drink === "tea" && e.drink === "perfect";
    tips += Math.round(p * tipRate(wait, c.patienceMs) * (perfectTea ? SV.tips.teaMul : 1));
    if (e.drink && c.drink !== "none") drinks += Math.round(SV.drinks.price[c.drink] * (e.drink === "perfect" ? SV.drinks.perfectMul : 1));
    if (e.drink === "bad") badPours++;
  }
  for (const id of a.left as unknown[]) {
    if (typeof id !== "string" || !customers.has(id) || seen.has(id)) return bad;
  }
  if (new Set(a.left as string[]).size !== (a.left as string[]).length) return bad;
  if (elapsed < seen.size * SV.minMsPerServe) return bad;
  const made = svc.dishes.reduce((n, d) => n + d.plates, 0);
  const gone = Math.max(0, Math.min(customers.size, made) - seen.size);
  const happy = seen.size;
  const reputation = Math.max(0, save.reputation + happy * SV.rep.happy + gone * SV.rep.left + badPours * SV.rep.badDrink);
  return {
    save: {
      ...save,
      gold: save.gold + sales + tips + drinks,
      reputation,
      stage: "settle",
      service: null,
      lastService: { id: svc.id, served: seen.size, left: gone, sales, tips, drinks, happy, repDelta: reputation - save.reputation },
    },
  };
}
