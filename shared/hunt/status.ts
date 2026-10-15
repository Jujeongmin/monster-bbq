import { BALANCE } from "../balance";

// What the side weapons do to a monster, on top of its own behaviour (hunt v3 design 4.4): stunned by a
// pebble or a firecracker, drowsy from sleep darts until enough hit, then asleep (bag it with E for ★★★),
// tied up by the net. A held monster does not move or attack. A hit wakes a sleeping or drowsy one.
export type MobStatus =
  | { kind: "free" }
  | { kind: "stunned"; ms: number }
  | { kind: "drowsy"; hits: number; fallMs: number | null }
  | { kind: "asleep"; ms: number }
  | { kind: "bound"; ms: number };

export const FREE: MobStatus = { kind: "free" };

export const isHeld = (s: MobStatus): boolean => s.kind === "stunned" || s.kind === "asleep" || s.kind === "bound";

export const stun = (s: MobStatus, ms: number): MobStatus => (s.kind === "asleep" ? s : { kind: "stunned", ms });
export const bind = (_s: MobStatus, ms: number): MobStatus => ({ kind: "bound", ms });
export const wake = (s: MobStatus): MobStatus => (s.kind === "asleep" || s.kind === "drowsy" ? FREE : s);

// One more sleep dart: drowsier, and once there are enough, the fall begins.
export function dart(s: MobStatus, hitsNeeded: number, fallMs: number): MobStatus {
  if (s.kind === "asleep") return s;
  const hits = (s.kind === "drowsy" ? s.hits : 0) + 1;
  return { kind: "drowsy", hits, fallMs: hits >= hitsNeeded ? (s.kind === "drowsy" && s.fallMs !== null ? s.fallMs : fallMs) : null };
}

export function stepStatus(s: MobStatus, dtMs: number): { s: MobStatus; event: "fell_asleep" | "woke" | null } {
  switch (s.kind) {
    case "stunned":
    case "bound":
      return { s: s.ms - dtMs <= 0 ? FREE : { ...s, ms: s.ms - dtMs }, event: null };
    case "asleep":
      return s.ms - dtMs <= 0 ? { s: FREE, event: "woke" } : { s: { ...s, ms: s.ms - dtMs }, event: null };
    case "drowsy":
      if (s.fallMs === null) return { s, event: null };
      return s.fallMs - dtMs <= 0 ? { s: { kind: "asleep", ms: BALANCE.hunt.sleepMs }, event: "fell_asleep" } : { s: { ...s, fallMs: s.fallMs - dtMs }, event: null };
    default:
      return { s, event: null };
  }
}
