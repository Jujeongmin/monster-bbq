import { powerOf } from "./power";
import type { SaveData } from "./save";
import { vipLevel } from "./shop";

// A shop's line on the power ranking (user 2026-10-21): kept by the server in a Global Collection, one per
// account, written from the save (the client never sends it). Not currency: losing a write costs a stale
// line, nothing else (Verse8 docs).
export const RANKING = "power";
export const RANKING_TOP = 20;

export interface RankEntry {
  name: string;
  power: number;
  vip: number;
}

export const rankEntry = (save: SaveData): RankEntry => ({ name: save.shopName, power: powerOf(save).total, vip: vipLevel(save.vip.spent) });
export const sameRank = (a: RankEntry, b: RankEntry): boolean => a.name === b.name && a.power === b.power && a.vip === b.vip;

// What the client sees of the ranking: the top lines (no accounts) with the player's own marked, and their rank.
export interface RankingView {
  top: (RankEntry & { me: boolean })[];
  mine: { rank: number; entry: RankEntry } | null;
}
