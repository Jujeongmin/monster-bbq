import { BALANCE } from "../balance";
import { MAX_STARS } from "../awaken";
import { isPosition, isStaffId, STAFF, STAFF_IDS, type Rarity, type StaffId } from "../content/staff";
import { staffSlots } from "../growth";
import type { SaveData } from "../save";

// Grandma's old friends on the server (staff design 6-7): postcards (the published rates, a legend by the
// hundredth, a hero in every ten, the first one free), putting friends to work, awakening them. The
// rolls use the server's random; the page only shows what came back.
const B = BALANCE.staff;
const PULL_IDS_KEPT = 20;

// One postcard's rarity: the pity first, then the rates; a ten's last card is at least a hero when the
// other nine were not.
export function rollRarity(rand: () => number, sinceLegend: number, guaranteeHero: boolean): Rarity {
  if (sinceLegend >= B.pity - 1) return "legend";
  const r = rand();
  const rarity: Rarity = r < B.rates.legend ? "legend" : r < B.rates.legend + B.rates.hero ? "hero" : r < B.rates.legend + B.rates.hero + B.rates.rare ? "rare" : "common";
  return guaranteeHero && (rarity === "common" || rarity === "rare") ? "hero" : rarity;
}

const busy = (save: SaveData) => !!save.hunt || !!save.service;

export function summon(save: SaveData, a: Record<string, unknown>, random: () => number): { save: SaveData; error?: string } {
  const { count, free, pullId } = a;
  if ((count !== 1 && count !== 10) || typeof pullId !== "string" || pullId.length === 0 || pullId.length > 64) return { save, error: "bad_action" };
  // already done (a retry after a lost reply): the postcards stand as they came back
  if (save.staff.pullIds.includes(pullId)) return { save };
  if (busy(save)) return { save, error: "wrong_stage" };
  const isFree = free === true;
  if (isFree && (count !== 1 || save.staff.freeUsed)) return { save, error: "bad_action" };
  const cost = isFree ? 0 : count === 1 ? B.cost.one : B.cost.ten;
  if (save.charcoal < cost) return { save, error: "no_charcoal" };
  const owned = { ...save.staff.owned };
  let since = save.staff.sinceLegend;
  let heroSeen = false;
  for (let i = 0; i < count; i++) {
    const rarity = rollRarity(random, since, count === 10 && i === count - 1 && !heroSeen);
    const ids = STAFF_IDS.filter((id) => STAFF[id].rarity === rarity);
    const id: StaffId = ids[Math.min(ids.length - 1, Math.floor(random() * ids.length))];
    since = rarity === "legend" ? 0 : since + 1;
    if (rarity === "hero" || rarity === "legend") heroSeen = true;
    const had = owned[id];
    owned[id] = had ? { ...had, shards: had.shards + (rarity === "legend" ? B.shards.dupeLegend : B.shards.dupe) } : { shards: 0, stars: 0 };
  }
  const staff = { ...save.staff, owned, sinceLegend: since, pulls: save.staff.pulls + count, freeUsed: save.staff.freeUsed || isFree, pullIds: [...save.staff.pullIds, pullId].slice(-PULL_IDS_KEPT) };
  return { save: { ...save, charcoal: save.charcoal - cost, staff } };
}

export function assignStaff(save: SaveData, a: Record<string, unknown>): { save: SaveData; error?: string } {
  const { position, staffId } = a;
  if (!isPosition(position) || (staffId !== null && !isStaffId(staffId))) return { save, error: "bad_action" };
  if (busy(save)) return { save, error: "wrong_stage" };
  const roster = { ...save.staff.roster };
  if (staffId === null) {
    delete roster[position];
    return { save: { ...save, staff: { ...save.staff, roster } } };
  }
  if (!save.staff.owned[staffId]) return { save, error: "not_owned" };
  // one position each: moving someone frees where they were
  for (const [p, id] of Object.entries(roster)) if (id === staffId) delete roster[p as keyof typeof roster];
  roster[position] = staffId;
  if (Object.keys(roster).length > staffSlots(save)) return { save, error: "slot_full" };
  return { save: { ...save, staff: { ...save.staff, roster } } };
}

// shards and gold for the next star (the same gold as gear: 200 a star squared)
export const staffAwakenCost = (toStar: number) => ({ shards: Math.max(1, Math.ceil(toStar / 2)), gold: 200 * toStar * toStar });

export function awakenStaff(save: SaveData, a: Record<string, unknown>): { save: SaveData; error?: string } {
  const { staffId, from } = a;
  if (!isStaffId(staffId) || typeof from !== "number" || !Number.isInteger(from)) return { save, error: "bad_action" };
  const mine = save.staff.owned[staffId];
  if (!mine) return { save, error: "not_owned" };
  if (from > mine.stars) return { save, error: "bad_action" };
  // already done (a retry after a lost reply)
  if (from < mine.stars) return { save };
  if (busy(save)) return { save, error: "wrong_stage" };
  if (mine.stars >= MAX_STARS) return { save, error: "max_stars" };
  const cost = staffAwakenCost(mine.stars + 1);
  if (mine.shards < cost.shards) return { save, error: "no_shards" };
  if (save.gold < cost.gold) return { save, error: "no_gold" };
  const owned = { ...save.staff.owned, [staffId]: { shards: mine.shards - cost.shards, stars: mine.stars + 1 } };
  return { save: { ...save, gold: save.gold - cost.gold, staff: { ...save.staff, owned } } };
}

