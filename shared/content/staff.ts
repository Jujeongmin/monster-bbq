// Grandma's old friends (staff and summon design, roster approved 2026-10-20): twelve who come when a
// postcard reaches them and help in the night shop, Dave's staff style — four stats, a position each, and a
// skill of their own (what each skill does lives in shared/staff/effects.ts and the night's helpers).

export const STAFF_IDS = ["park", "sundeok", "kkaebi", "dallae", "hongmae", "soedol", "ppareun", "ggultteok", "jang", "baekhwa", "baekdu", "mumyeong"] as const;
export type StaffId = (typeof STAFF_IDS)[number];
export type Rarity = "common" | "rare" | "hero" | "legend";
export const RARITIES: Rarity[] = ["common", "rare", "hero", "legend"];
export type Stat = "serving" | "cooking" | "dexterity" | "charm";
export const STATS: Stat[] = ["serving", "cooking", "dexterity", "charm"];
// where a friend works in the night: serving, helping Bandal, drinks, charcoal, clearing leftovers
export const POSITIONS = ["serve", "kitchen", "drinks", "coal", "clean"] as const;
export type Position = (typeof POSITIONS)[number];
// the stat each position works by (staff design 4); charm counts for the whole night wherever they are
export const POSITION_STAT: Record<Position, Stat> = { serve: "serving", kitchen: "cooking", drinks: "dexterity", coal: "dexterity", clean: "dexterity" };

export const isStaffId = (v: unknown): v is StaffId => typeof v === "string" && (STAFF_IDS as readonly string[]).includes(v);
export const isPosition = (v: unknown): v is Position => typeof v === "string" && (POSITIONS as readonly string[]).includes(v);

// each one's rarity and stats before any stars (draft numbers: 140, 190, 240 and 300 a rarity)
export const STAFF: Record<StaffId, { rarity: Rarity; stats: Record<Stat, number> }> = {
  park: { rarity: "common", stats: { serving: 20, cooking: 30, dexterity: 70, charm: 20 } },
  sundeok: { rarity: "common", stats: { serving: 30, cooking: 30, dexterity: 55, charm: 25 } },
  kkaebi: { rarity: "common", stats: { serving: 45, cooking: 20, dexterity: 35, charm: 40 } },
  dallae: { rarity: "common", stats: { serving: 25, cooking: 25, dexterity: 60, charm: 30 } },
  hongmae: { rarity: "rare", stats: { serving: 40, cooking: 30, dexterity: 75, charm: 45 } },
  soedol: { rarity: "rare", stats: { serving: 35, cooking: 45, dexterity: 85, charm: 25 } },
  ppareun: { rarity: "rare", stats: { serving: 90, cooking: 25, dexterity: 40, charm: 35 } },
  ggultteok: { rarity: "rare", stats: { serving: 35, cooking: 50, dexterity: 40, charm: 65 } },
  jang: { rarity: "hero", stats: { serving: 30, cooking: 120, dexterity: 60, charm: 30 } },
  baekhwa: { rarity: "hero", stats: { serving: 60, cooking: 30, dexterity: 50, charm: 100 } },
  baekdu: { rarity: "legend", stats: { serving: 60, cooking: 70, dexterity: 70, charm: 100 } },
  mumyeong: { rarity: "legend", stats: { serving: 100, cooking: 100, dexterity: 60, charm: 40 } },
};

// a stat with its stars: a tenth more a star, like every other awakening
export const statOf = (id: StaffId, stat: Stat, stars: number): number => Math.round(STAFF[id].stats[stat] * 1.1 ** stars);
