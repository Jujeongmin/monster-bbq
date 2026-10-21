// The new dish's cooking cut (Bancho-style, user 2026-10-21, made from the art already in: Bandal's frames,
// the round grill, the parts' icons, the spark/steam/sparkle effects). Bars close in; the dish's makings
// drop onto the grill one by one; the fire: Bandal flips fast, sparks and steam, the room shakes, a white
// flash; the dish lands big with its name stamped while he holds it out; his secret smile and his line.
// About four and a half seconds, then it waits for a tap (ResearchCutIn); a tap while it plays jumps to the end.
export type BandalFrame = "grill" | "turn" | "serve" | "smile";
export type CutPhase = "in" | "drop" | "fire" | "plate" | "smile";
export const CUT_IN_MS = 4600;
const DROP_AT = 300;
const DROP_EVERY = 250;
const FIRE_AT = 1500;
const PLATE_AT = 2600;
const SMILE_AT = 3500;
const FLIP_MS = 120;

export interface CutStep {
  phase: CutPhase;
  frame: BandalFrame;
  landed: number; // how many of the makings are on the grill
  shake: boolean;
  flash: boolean;
  stamp: boolean;
  line: boolean;
  done: boolean;
}

export function cutInStep(ms: number, makings: number): CutStep {
  const phase: CutPhase = ms < DROP_AT ? "in" : ms < FIRE_AT ? "drop" : ms < PLATE_AT ? "fire" : ms < SMILE_AT ? "plate" : "smile";
  const landed = phase === "in" ? 0 : Math.min(makings, Math.max(0, Math.floor((ms - DROP_AT) / DROP_EVERY)));
  const frame: BandalFrame = phase === "fire" ? (Math.floor((ms - FIRE_AT) / FLIP_MS) % 2 ? "turn" : "grill") : phase === "plate" ? "serve" : phase === "smile" ? "smile" : "grill";
  return {
    phase,
    frame,
    landed,
    shake: phase === "fire",
    flash: ms >= PLATE_AT - 200 && ms < PLATE_AT + 150,
    stamp: ms >= PLATE_AT,
    line: ms >= SMILE_AT,
    done: ms >= CUT_IN_MS,
  };
}
