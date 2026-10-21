import { BALANCE } from "../balance";
import { isDishId, type DishId } from "../content/dishes";
import { RECIPES } from "../content/recipes";
import type { SaveData } from "../save";
import { staffEffects } from "../staff/effects";
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

// A plate's tip (Dave: a tenth of the price), half as much again after a perfect barley tea.
export function tipFor(price: number, perfectTea: boolean): number {
  return Math.round(price * SV.tipRate * (perfectTea ? SV.teaMul : 1));
}

// The night's report checked against the customers the seed brought (restaurant v2 design 4). Each
// served customer real, once, given a dish cooked tonight, no more plates of a dish than were made; the
// wait no shorter than the dish takes Bandal and no longer than that guest's patience, and over before
// the report came; a pour only for a guest who asked for a drink. The wait and the pour are the page's
// word, so what they can earn is capped (a perfect pour). Grills scrubbed (`cleaned`) only count for
// guests the seed made messy who were served. The server pays tonight's price per plate, the tip, the
// drinks, the scrubbing, and moves the reputation; customers who went without while there were
// plates to give count as gone (those after the last plate do not). The same report sent again after it
// was settled changes nothing.
export function settleService(save: SaveData, a: Record<string, unknown>, now: number): { save: SaveData; error?: string } {
  if (typeof a.serviceId === "string" && a.serviceId === save.lastService?.id) return { save };
  const svc = save.service;
  const bad = { save, error: "bad_service" };
  if (!svc || a.serviceId !== svc.id || !Array.isArray(a.served) || !Array.isArray(a.left) || a.served.length > MAX_SERVED || a.left.length > MAX_SERVED) return bad;
  // tonight's dishes (with any added during the night), and the guests planned from the opening menu
  const menu = svc.dishes.map((d) => d.dish);
  // tonight's friends: faster cooking, longer patience, more guests and tips (staff design 5)
  const fx = staffEffects(svc.staff);
  const customers = new Map(planService(svc.seed, { day: save.day, reputation: save.reputation, menu: svc.planMenu, extra: fx.extraGuests }).map((c) => [c.id, c]));
  const plates = new Map(svc.dishes.map((d) => [d.dish, d.plates]));
  const price = new Map(svc.dishes.map((d) => [d.dish, d.price]));
  const seen = new Set<string>();
  const elapsed = now - svc.startedAt;
  let sales = 0;
  let tips = 0;
  let drinks = 0;
  let badPours = 0;
  const sold = new Map<DishId, { plates: number; gold: number }>();
  for (const raw of a.served as unknown[]) {
    const e = raw as Partial<Record<keyof ServedEntry, unknown>> | null;
    if (!e || typeof e !== "object" || typeof e.customer !== "string" || seen.has(e.customer) || !isDishId(e.dish)) return bad;
    const c = customers.get(e.customer);
    const left = plates.get(e.dish) ?? 0;
    if (!c || left < 1) return bad;
    const wait = e.waitMs;
    if (typeof wait !== "number" || !Number.isFinite(wait) || wait < Math.floor(RECIPES[e.dish].cookMs * fx.cookMul) || wait > Math.ceil(c.patienceMs * fx.patienceMul * (fx.calm ? 1.5 : 1)) || c.arriveMs + wait > elapsed) return bad;
    if (e.drink !== undefined && (!isPour(e.drink) || c.drink === "none")) return bad;
    plates.set(e.dish, left - 1);
    seen.add(e.customer);
    const p = price.get(e.dish)!;
    sales += p;
    const line = sold.get(e.dish) ?? { plates: 0, gold: 0 };
    sold.set(e.dish, { plates: line.plates + 1, gold: line.gold + p });
    const perfectTea = c.drink === "tea" && e.drink === "perfect";
    tips += Math.round(tipFor(p, perfectTea) * fx.tipMul);
    if (e.drink && c.drink !== "none") drinks += Math.round(SV.drinks.price[c.drink] * (e.drink === "perfect" ? SV.drinks.perfectMul : 1));
    if (e.drink === "bad") badPours++;
  }
  for (const id of a.left as unknown[]) {
    if (typeof id !== "string" || !customers.has(id) || seen.has(id)) return bad;
  }
  if (new Set(a.left as string[]).size !== (a.left as string[]).length) return bad;
  const cleaned = a.cleaned ?? [];
  if (!Array.isArray(cleaned) || new Set(cleaned).size !== cleaned.length) return bad;
  for (const id of cleaned as unknown[]) if (typeof id !== "string" || !seen.has(id) || !customers.get(id)!.messy) return bad;
  tips += cleaned.length * SV.cleanTip;
  if (elapsed < seen.size * SV.minMsPerServe) return bad;
  // every guest of the night who went without counts as gone, however few plates were made (balance check
  // 2026-10-21: counting only up to the plates made let a short menu spare the reputation)
  const gone = Math.max(0, customers.size - seen.size);
  const happy = seen.size;
  const reputation = Math.max(0, save.reputation + happy * SV.rep.happy + gone * SV.rep.left + badPours * SV.rep.badDrink);
  return {
    save: {
      ...save,
      gold: save.gold + sales + tips + drinks,
      reputation,
      stage: "settle",
      service: null,
      lastService: { id: svc.id, served: seen.size, left: gone, sales, tips, drinks, cleaned: cleaned.length, happy, repDelta: reputation - save.reputation, dishes: menu.filter((d) => sold.has(d)).map((dish) => ({ dish, ...sold.get(dish)! })) },
    },
  };
}
