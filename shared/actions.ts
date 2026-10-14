import { BALANCE } from "./balance";
import type { SaveData } from "./save";

type Meat = SaveData["meat"];
export type Action = { type: "huntResult"; meat: Meat } | { type: "sellAll" } | { type: "endDay" };

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

// The server's rules for every change to a save (the in-page LocalTransport runs the same code).
// `action` comes from the client, so it is checked here; a rejected action leaves the save as it was.
export function applyAction(save: SaveData, action: unknown): { save: SaveData; error?: string } {
  const a = action as { type?: unknown; meat?: Partial<Meat> | null } | null;
  if (!a || typeof a !== "object") return { save, error: "bad_action" };
  switch (a.type) {
    case "huntResult": {
      const m = a.meat;
      if (!m || !isCount(m.premium) || !isCount(m.normal) || m.premium + m.normal > BALANCE.economy.maxMeatPerHunt) return { save, error: "bad_hunt" };
      return { save: { ...save, meat: { premium: save.meat.premium + m.premium, normal: save.meat.normal + m.normal } } };
    }
    case "sellAll": {
      const p = BALANCE.economy.meatPrice;
      return { save: { ...save, gold: save.gold + save.meat.premium * p.premium + save.meat.normal * p.normal, meat: { premium: 0, normal: 0 } } };
    }
    case "endDay":
      return { save: { ...save, day: save.day + 1 } };
    default:
      return { save, error: "bad_action" };
  }
}

// Knocked out on the hunt: half of each grade is lost (spec 3).
export function koPenalty(meat: Meat): Meat {
  return { premium: Math.floor(meat.premium / 2), normal: Math.floor(meat.normal / 2) };
}
