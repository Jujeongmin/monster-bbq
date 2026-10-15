// Map objects (Codex art, art/test/objects). `foot` is the solid base around the anchor (bottom
// centre), so the hunter can walk behind a canopy; trees fade while they hide him.
export const OBJECT_KINDS = {
  tree_round: { foot: { w: 22, h: 10 }, tree: true },
  tree_pine: { foot: { w: 18, h: 10 }, tree: true },
  tree_cluster: { foot: { w: 24, h: 10 }, tree: true },
  bush_pink: { foot: { w: 40, h: 16 }, tree: false },
  bush_blue: { foot: { w: 40, h: 16 }, tree: false },
  rock_big: { foot: { w: 38, h: 18 }, tree: false },
  rock_small: { foot: { w: 30, h: 12 }, tree: false },
  // the misty swamp (floor 3): reeds hide the hunter like trees; a lily pond and a mossy log to walk round
  reeds: { foot: { w: 30, h: 10 }, tree: true },
  lily_pond: { foot: { w: 44, h: 22 }, tree: false },
  mossy_log: { foot: { w: 48, h: 14 }, tree: false },
  // the mossy cave (floor 4)
  stalagmite: { foot: { w: 28, h: 12 }, tree: true },
  crystals: { foot: { w: 30, h: 12 }, tree: false },
  cave_rock: { foot: { w: 44, h: 18 }, tree: false },
} as const;

export type ObjectKind = keyof typeof OBJECT_KINDS;
export const TREES: ObjectKind[] = ["tree_round", "tree_pine", "tree_cluster"];
export const SMALL_OBJECTS: ObjectKind[] = ["bush_pink", "bush_blue", "rock_big", "rock_small"];
export const SWAMP_OBJECTS = { trees: ["reeds"] as ObjectKind[], smalls: ["lily_pond", "mossy_log"] as ObjectKind[] };
export const CAVE_OBJECTS = { trees: ["stalagmite"] as ObjectKind[], smalls: ["crystals", "cave_rock"] as ObjectKind[] };
