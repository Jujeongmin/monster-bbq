import { statOf, type StaffId } from "../content/staff";
import type { PendingService } from "../save";

// What tonight's friends change in the night (staff design 4-5), from the roster fixed when the shop
// opened. The night's rules and the server's settlement use the same numbers, so a faster plate or a
// longer wait a friend made possible is checked, not trusted. Draft formulas, tuned in play.
export interface StaffEffects {
  cookMul: number;
  patienceMul: number;
  extraGuests: number;
  tipMul: number;
  coalMul: number;
  calm: boolean;
}

export function staffEffects(staff: PendingService["staff"]): StaffEffects {
  const on = Object.values(staff).filter((s): s is { id: StaffId; stars: number } => !!s);
  const has = (id: StaffId) => on.some((s) => s.id === id);
  // the kitchen helper's cooking (Mumyeong helps from serving too; the better cook counts)
  const cooks = [staff.kitchen, ...on.filter((s) => s.id === "mumyeong")].filter((s): s is { id: StaffId; stars: number } => !!s);
  const cooking = Math.max(0, ...cooks.map((s) => statOf(s.id, "cooking", s.stars)));
  const cookMul = Math.max(0.5, (1 - cooking / 250) * (has("jang") ? 0.85 : 1));
  const charm = on.reduce((n, s) => n + statOf(s.id, "charm", s.stars), 0);
  const patienceMul = 1 + charm / 1000 + (has("ggultteok") ? 0.15 : 0) + (has("baekdu") ? 0.25 : 0);
  return {
    // Jang hurries Bandal along from wherever he works
    cookMul: cooks.length ? cookMul : has("jang") ? 0.85 : 1,
    patienceMul,
    extraGuests: has("baekhwa") ? 2 : 0,
    tipMul: has("baekhwa") ? 1.3 : 1,
    coalMul: has("soedol") ? 0.8 : 1,
    calm: has("baekdu"),
  };
}
