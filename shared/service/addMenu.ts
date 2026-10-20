import { starMul } from "../awaken";
import { DISHES, isDishId, type DishId } from "../content/dishes";
import { menuSlots } from "../growth";
import { dishPrice, MAX_SETS, planShop, platesPerSet, setsAvailable, takeSets } from "../kitchen/dish";
import type { SaveData } from "../save";

// More dishes during the night (shop remake step 4): at the pass the grandchild adds sets of a dish already
// on tonight's menu (at tonight's price) or a new dish within the menu slots, from what is left in the
// fridge. The server takes the ingredients and grows tonight's dishes; tonight's guests stay planned from
// the opening menu (service.planMenu). Each addId is applied once, so a resent request changes nothing.

export interface AddOption {
  dish: DishId;
  maxSets: number;
  isNew: boolean;
  price: number;
}

const ADDS_KEPT = 50;

// What can be added now, tonight's dishes first, then the others in the dish table's order.
export function addOptions(save: SaveData): AddOption[] {
  const svc = save.service;
  if (save.stage !== "kitchen" || !svc) return [];
  const out: AddOption[] = [];
  for (const line of svc.dishes) {
    const left = MAX_SETS - (save.menu.find((l) => l.dish === line.dish)?.sets ?? 0);
    const maxSets = Math.min(setsAvailable(save.items, line.dish), left);
    if (maxSets >= 1) out.push({ dish: line.dish, maxSets, isNew: false, price: line.price });
  }
  if (svc.dishes.length < menuSlots(save)) {
    for (const dish of Object.keys(DISHES) as DishId[]) {
      const level = save.dishes[dish];
      if (!level || svc.dishes.some((d) => d.dish === dish)) continue;
      const maxSets = Math.min(setsAvailable(save.items, dish), MAX_SETS);
      if (maxSets >= 1) out.push({ dish, maxSets, isNew: true, price: Math.round(dishPrice(dish, level) * starMul(save.stars[dish] ?? 0)) });
    }
  }
  return out;
}

export function addToMenu(save: SaveData, a: Record<string, unknown>): { save: SaveData; error?: string } {
  const svc = save.service;
  if (save.stage !== "kitchen" || !svc) return { save, error: "wrong_stage" };
  if (a.serviceId !== svc.id) return { save, error: "bad_service" };
  const bad = { save, error: "bad_menu" };
  const { dish, sets, addId } = a;
  if (typeof addId !== "string" || addId.length === 0 || addId.length > 64) return bad;
  // already applied (a retry after a lost reply): tonight stands as it is
  if (svc.adds.includes(addId)) return { save };
  if (!isDishId(dish) || !save.dishes[dish] || typeof sets !== "number" || !Number.isInteger(sets) || sets < 1) return bad;
  const line = save.menu.find((l) => l.dish === dish);
  const tonight = svc.dishes.find((d) => d.dish === dish);
  if ((line?.sets ?? 0) + sets > MAX_SETS) return bad;
  if (!tonight && svc.dishes.length >= menuSlots(save)) return { save, error: "no_slot" };
  const adds = [...svc.adds, addId].slice(-ADDS_KEPT);
  const menu = line ? save.menu.map((l) => (l.dish === dish ? { ...l, sets: l.sets + sets } : l)) : [...save.menu, { dish, sets }];
  if (tonight) {
    const took = takeSets(save.items, dish, sets);
    if (!took) return { save, error: "no_ingredients" };
    const plates = sets * platesPerSet(save.dishes[dish]!);
    const dishes = svc.dishes.map((d) => (d.dish === dish ? { ...d, plates: d.plates + plates } : d));
    return { save: { ...save, items: took.items, menu, service: { ...svc, dishes, adds } } };
  }
  const plan = planShop(save.items, save.dishes, [{ dish, sets }], save.stars);
  if (!plan) return { save, error: "no_ingredients" };
  return { save: { ...save, items: plan.items, menu, service: { ...svc, dishes: [...svc.dishes, ...plan.dishes], adds } } };
}
