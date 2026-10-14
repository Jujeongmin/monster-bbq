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
} as const;

export type ObjectKind = keyof typeof OBJECT_KINDS;
export const TREES: ObjectKind[] = ["tree_round", "tree_pine", "tree_cluster"];
export const SMALL_OBJECTS: ObjectKind[] = ["bush_pink", "bush_blue", "rock_big", "rock_small"];
