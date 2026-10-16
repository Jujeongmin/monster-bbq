import { BALANCE } from "../balance";
import { clampToField, distance, stepToward, unit } from "./geometry";
import type { Field, Vec } from "./types";

// The Charge King (plan 08d, chapter 1's boss): wanders his den until the hunter comes near, then runs
// his patterns in turn — a long-warned charge that stuns him when he hits a wall, a roll that brings
// rocks down (shadows warn where), a roar that calls piglets — with a breather after each. Below
// angryAt of his health he is angry: faster, and he charges twice before a wall stuns him. Stunned or
// out of breath he is open (hits count as counters, the harpoon can start a capture).
const K = BALANCE.hunt.king;
export type KingPattern = "charge" | "rocks" | "piglets";
const ORDER: KingPattern[] = ["charge", "rocks", "piglets"];
// how close counts as running into the hunter (his radius and the hunter's)
const TOUCH = 26 + BALANCE.hunt.player.radius;

export interface KingState {
  pos: Vec;
  phase: "wander" | "chargeTell" | "charge" | "stunned" | "rockTell" | "roar" | "breather";
  phaseMs: number;
  facing: Vec;
  chargeDir: Vec;
  chargesLeft: number;
  nextPattern: number;
  angry: boolean;
  // where the rocks will fall (warned by their shadows)
  rocks: Vec[];
  hitThisMove: boolean;
  wanderTarget: Vec | null;
}

export const newKing = (pos: Vec): KingState => ({
  pos, phase: "wander", phaseMs: 0, facing: { x: -1, y: 0 }, chargeDir: { x: -1, y: 0 }, chargesLeft: 0,
  nextPattern: 0, angry: false, rocks: [], hitThisMove: false, wanderTarget: null,
});

export const isKingOpen = (s: KingState): boolean => s.phase === "stunned" || s.phase === "breather";

export interface KingStep {
  state: KingState;
  hurt: { damage: number } | null;
  // rocks that came down this frame (for the dust), and piglets to call out
  fell: Vec[] | null;
  piglets: number;
}

// `health` is his share of health left (0..1); `pigletsOut` the piglets still running about.
export function updateKing(s: KingState, player: Vec, dtMs: number, field: Field, rand: () => number, health: number, pigletsOut: number): KingStep {
  const angry = s.angry || health <= K.angryAt;
  const mul = angry ? K.angryMul : 1;
  const dt = dtMs / 1000;
  const phaseMs = s.phaseMs + dtMs;
  const toPlayer = unit({ x: player.x - s.pos.x, y: player.y - s.pos.y }, s.facing);
  const quiet = { hurt: null, fell: null, piglets: 0 };
  const at = (next: Partial<KingState>): KingState => ({ ...s, angry, phaseMs, ...next });
  const begin = (pattern: KingPattern): KingState => {
    const base: KingState = { ...s, angry, phaseMs: 0, nextPattern: (ORDER.indexOf(pattern) + 1) % ORDER.length, facing: toPlayer, hitThisMove: false, wanderTarget: null };
    if (pattern === "charge") return { ...base, phase: "chargeTell", chargeDir: toPlayer, chargesLeft: angry ? 2 : 1 };
    if (pattern === "rocks") {
      // one where the hunter stands, the rest scattered around them
      const rocks = [player];
      for (let i = 1; i < K.rocks; i++) {
        const a = rand() * Math.PI * 2;
        const d = 60 + rand() * 200;
        rocks.push(clampToField({ x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d }, field));
      }
      return { ...base, phase: "rockTell", rocks };
    }
    return { ...base, phase: "roar" };
  };
  const breather = (): KingState => ({ ...s, angry, phase: "breather", phaseMs: 0, rocks: [], hitThisMove: false });

  switch (s.phase) {
    case "wander": {
      if (distance(s.pos, player) <= K.aggroRange) return { state: begin(ORDER[s.nextPattern]), ...quiet };
      const target = s.wanderTarget ?? { x: field.minX + rand() * (field.maxX - field.minX), y: field.minY + rand() * (field.maxY - field.minY) };
      const step = stepToward(s.pos, target, K.wanderSpeed * mul * dt);
      return { state: at({ pos: clampToField(step.pos, field), facing: unit({ x: target.x - s.pos.x, y: target.y - s.pos.y }, s.facing), wanderTarget: step.arrived ? null : target }), ...quiet };
    }
    case "chargeTell":
      // he paws the ground facing the hunter, then commits to the line
      if (phaseMs < K.chargeTelegraphMs / mul) return { state: at({ chargeDir: toPlayer, facing: toPlayer }), ...quiet };
      return { state: { ...s, angry, phase: "charge", phaseMs: 0, hitThisMove: false }, ...quiet };
    case "charge": {
      const want = { x: s.pos.x + s.chargeDir.x * K.chargeSpeed * mul * dt, y: s.pos.y + s.chargeDir.y * K.chargeSpeed * mul * dt };
      const pos = clampToField(want, field);
      const hit = !s.hitThisMove && distance(pos, player) <= TOUCH;
      const hurt = hit ? { damage: K.chargeDamage } : null;
      const wall = pos.x !== want.x || pos.y !== want.y;
      if (wall || phaseMs >= K.chargeMaxMs) {
        // angry, he turns and goes again before the wall gets him
        if (s.chargesLeft > 1) return { state: { ...s, angry, pos, phase: "chargeTell", phaseMs: K.chargeTelegraphMs / 2, chargesLeft: s.chargesLeft - 1, chargeDir: toPlayer, hitThisMove: false }, hurt, fell: null, piglets: 0 };
        return { state: { ...s, angry, pos, phase: wall ? "stunned" : "breather", phaseMs: 0, hitThisMove: false }, hurt, fell: null, piglets: 0 };
      }
      return { state: at({ pos, hitThisMove: s.hitThisMove || hit }), hurt, fell: null, piglets: 0 };
    }
    case "stunned":
      if (phaseMs < K.stunMs) return { state: at({}), ...quiet };
      return { state: breather(), ...quiet };
    case "rockTell": {
      if (phaseMs < K.rockTelegraphMs / mul) return { state: at({}), ...quiet };
      const crushed = s.rocks.some((r) => distance(r, player) <= K.rockRadius);
      return { state: breather(), hurt: crushed ? { damage: K.rockDamage } : null, fell: s.rocks, piglets: 0 };
    }
    case "roar": {
      if (phaseMs < K.roarMs / mul) return { state: at({}), ...quiet };
      const n = Math.max(0, Math.min(K.piglets, K.maxPiglets - pigletsOut));
      return { state: breather(), hurt: null, fell: null, piglets: n };
    }
    case "breather":
      if (phaseMs < K.breatherMs / mul) return { state: at({}), ...quiet };
      return { state: distance(s.pos, player) <= K.aggroRange ? begin(ORDER[s.nextPattern]) : { ...s, angry, phase: "wander", phaseMs: 0 }, ...quiet };
  }
}
