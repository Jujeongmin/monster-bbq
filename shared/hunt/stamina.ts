import { FLOORS, type FloorId } from "../content/floors";

// Stamina (hunt v3 design 3, Dave the Diver's oxygen): one gauge that runs down with time, faster on
// deeper floors, and with every hit taken; a lunch fills it; at zero the hunter goes down. Its top is the
// armour upgrade's health table until the stamina tank comes (stage 3).
export const LOW_STAMINA = 0.25;

export function drainStamina(stamina: number, dtMs: number, floor: FloorId): number {
  return Math.max(0, stamina - (FLOORS[floor].drainPerSec * dtMs) / 1000);
}
