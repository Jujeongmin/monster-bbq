import type { ItemId } from "./items";

// Forest monsters (spec 3: four behaviours). Drops: [item, weight]; one part per kill.
// Movement and attack numbers per behaviour live in BALANCE.hunt.
export const MONSTERS = {
  boar: { kind: "charger", maxHp: 60, radius: 12, drops: [["boar_belly", 5], ["boar_neck", 3], ["boar_rib", 2]] },
  rabbit: { kind: "fleer", maxHp: 25, radius: 8, drops: [["rabbit_leg", 1]] },
  bee: { kind: "shooter", maxHp: 30, radius: 8, drops: [["honeycomb", 1]] },
  chicken: { kind: "pack", maxHp: 20, radius: 7, drops: [["chicken_thigh", 1], ["chicken_breast", 1]] },
  // the tusk boss (hunt v3 design 4.7): a big boar, floor 2 on some hunts; its parts count twice
  tusk: { kind: "boss", maxHp: 240, radius: 18, drops: [["boar_belly", 5], ["boar_neck", 3], ["boar_rib", 2]] },
} as const satisfies Record<string, { kind: "charger" | "fleer" | "shooter" | "pack" | "boss"; maxHp: number; radius: number; drops: readonly (readonly [ItemId, number])[] }>;

export type MonsterId = keyof typeof MONSTERS;
