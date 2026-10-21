import { AWAKEN_GEAR } from "./awaken";
import { BALANCE } from "./balance";
import { DISHES, type DishId } from "./content/dishes";
import { STAFF, type StaffId } from "./content/staff";
import { baseLevel, level, UPGRADE_IDS } from "./growth";
import type { SaveData } from "./save";

// The shop's power: everything grown, as one number for the ranking (user 2026-10-21: "level, combat power,
// something intuitive"). Gear: levels bought over each upgrade's start and its awakening stars; dishes: each
// one known, its levels and stars; old friends: by rarity, more with stars. The server works it out from the
// save, so the client never sends a score.
const P = BALANCE.power;

export interface Power {
  gear: number;
  dishes: number;
  staff: number;
  total: number;
}

export function powerOf(save: Pick<SaveData, "upgrades" | "stars" | "dishes" | "staff">): Power {
  const stars = (t: string) => save.stars[t as keyof typeof save.stars] ?? 0;
  const bought = UPGRADE_IDS.reduce((a, id) => a + Math.max(0, level(save, id) - baseLevel(id)), 0);
  const gear = bought * P.upgradeLevel + AWAKEN_GEAR.reduce((a, g) => a + stars(g), 0) * P.star;
  const known = (Object.keys(DISHES) as DishId[]).filter((d) => (save.dishes[d] ?? 0) > 0);
  const dishes = known.reduce((a, d) => a + P.dishKnown + (save.dishes[d] ?? 0) * P.dishLevel + stars(d) * P.star, 0);
  const staff = Math.round(
    (Object.keys(save.staff.owned) as StaffId[]).reduce((a, id) => {
      const mine = save.staff.owned[id];
      return mine ? a + P.rarity[STAFF[id].rarity] * (1 + mine.stars * P.staffStar) : a;
    }, 0),
  );
  return { gear, dishes, staff, total: gear + dishes + staff };
}

// Each milestone reached and not yet paid pays its charcoal, once (applyAction runs this after every change).
export function claimPowerRewards(save: SaveData): SaveData {
  const total = powerOf(save).total;
  const due = P.milestones.filter((m) => total >= m.at && !save.powerRewards.includes(m.at));
  if (due.length === 0) return save;
  return { ...save, charcoal: save.charcoal + due.reduce((a, m) => a + m.charcoal, 0), powerRewards: [...save.powerRewards, ...due.map((m) => m.at)] };
}
