import Phaser from "phaser";
import { BALANCE } from "../../../shared/balance";
import { MONSTERS, type MonsterId } from "../../../shared/content/monsters";
import { newCharger, updateCharger, type ChargerState } from "../../../shared/hunt/charger";
import { EMPTY_HIT_LOG, type HitLog } from "../../../shared/hunt/combat";
import { fleerHit, newFleer, updateFleer, type FleerState } from "../../../shared/hunt/fleer";
import { clampToField, pushOutOfRects, type Rect } from "../../../shared/hunt/geometry";
import { angerPack, newPackMember, updatePackMember, type PackMemberState } from "../../../shared/hunt/pack";
import type { FloorPlan } from "../../../shared/hunt/plan";
import { newShooter, updateShooter, type ShooterState, type Shot } from "../../../shared/hunt/shooter";
import type { Field, Vec } from "../../../shared/hunt/types";
import { lookOf, stepBob } from "./anims";

// One monster on the hunting ground: its spawn (from the hunt plan), its behaviour's state machine
// (shared/hunt), its sprite, and what it has taken (for the meat grade).
const H = BALANCE.hunt;
// Where the feet are inside each sheet's cells (measured when slicing).
const FEET: Record<MonsterId, number> = { boar: 0.92, rabbit: 0.885, bee: 0.885, chicken: 0.89 };

export type Spawn = FloorPlan["spawns"][number];
export type MobAI =
  | { kind: "charger"; s: ChargerState }
  | { kind: "fleer"; s: FleerState }
  | { kind: "shooter"; s: ShooterState }
  | { kind: "pack"; s: PackMemberState };

export interface Mob {
  spawn: Spawn;
  sprite: Phaser.GameObjects.Sprite;
  ai: MobAI;
  hp: number;
  hits: HitLog;
  dead: boolean;
}

// Hunter and monsters are drawn smaller than their frames (user, 2026-10-15: they filled too much of the
// field); only the look changes, the hit sizes stay in shared/balance.
export const CHAR_SCALE = 0.7;

export function createMob(scene: Phaser.Scene, spawn: Spawn): Mob {
  const pos = { x: spawn.x, y: spawn.y };
  const kind = MONSTERS[spawn.monster].kind;
  const ai: MobAI =
    kind === "charger"
      ? { kind, s: newCharger(pos) }
      : kind === "fleer"
        ? { kind, s: newFleer(pos) }
        : kind === "shooter"
          ? { kind, s: newShooter(pos) }
          : { kind, s: newPackMember(pos) };
  const sprite = scene.add.sprite(pos.x, pos.y, `${spawn.monster}_side_0`).setOrigin(0.5, FEET[spawn.monster]).setScale(CHAR_SCALE).setDepth(pos.y);
  sprite.setAlpha(0);
  scene.tweens.add({ targets: sprite, alpha: 1, duration: 400 });
  return { spawn, sprite, ai, hp: MONSTERS[spawn.monster].maxHp, hits: EMPTY_HIT_LOG, dead: false };
}

export const mobPos = (m: Mob): Vec => m.ai.s.pos;
export const mobFacing = (m: Mob): Vec => m.ai.s.facing;
export const mobRadius = (m: Mob): number => MONSTERS[m.spawn.monster].radius;

export function setMobPos(m: Mob, pos: Vec) {
  m.ai = { kind: m.ai.kind, s: { ...m.ai.s, pos } } as MobAI;
  m.sprite.setPosition(pos.x, pos.y).setDepth(pos.y);
}

// Open for a counter: the moment after each kind's attack (or its rest).
export function isMobVulnerable(m: Mob): boolean {
  switch (m.ai.kind) {
    case "charger":
      return m.ai.s.phase === "recover";
    case "fleer":
      return m.ai.s.phase === "rest";
    case "shooter":
      return m.ai.s.phase === "cooldown";
    case "pack":
      return m.ai.s.phase === "recover";
  }
}

// Reeled in by the harpoon: dazed for dazeMs in the kind's open phase (started early).
export function dazeMob(m: Mob, toward: Vec) {
  const d = H.harpoon.dazeMs;
  switch (m.ai.kind) {
    case "charger":
      m.ai = { kind: "charger", s: { ...m.ai.s, phase: "recover", phaseMs: H.boar.recoverMs - d, facing: toward } };
      break;
    case "fleer":
      m.ai = { kind: "fleer", s: { ...m.ai.s, phase: "rest", phaseMs: H.rabbit.restMs - d, facing: toward } };
      break;
    case "shooter":
      m.ai = { kind: "shooter", s: { ...m.ai.s, phase: "cooldown", phaseMs: H.bee.cooldownMs - d, facing: toward } };
      break;
    case "pack":
      m.ai = { kind: "pack", s: { ...m.ai.s, phase: "recover", phaseMs: H.chicken.recoverMs - d, facing: toward } };
      break;
  }
}

// A rabbit bolts the moment it is hit (a flock's anger is the scene's job: it knows the flock).
export function mobWasHit(m: Mob) {
  if (m.ai.kind === "fleer") m.ai = { kind: "fleer", s: fleerHit(m.ai.s) };
}

export function angerFlock(mobs: Mob[], flock: string) {
  for (const m of mobs) {
    if (m.dead || m.ai.kind !== "pack" || m.spawn.flock !== flock) continue;
    m.ai = { kind: "pack", s: angerPack([m.ai.s])[0] };
  }
}

export interface MobStep {
  hurt?: { damage: number; dir: Vec };
  shot?: Shot;
  phaseChanged: boolean;
}

// One frame of the monster's behaviour, kept out of trees and rocks. `player` null = knocked out.
export function stepMob(m: Mob, dt: number, player: Vec | null, field: Field, obstacles: Rect[]): MobStep {
  const seen = player ?? { x: -99999, y: -99999 };
  const before = m.ai.s.phase;
  const out: MobStep = { phaseChanged: false };
  switch (m.ai.kind) {
    case "charger": {
      const r = updateCharger(m.ai.s, seen, dt, H.boar, field, Math.random);
      m.ai = { kind: "charger", s: r.state };
      if (r.hit) out.hurt = { damage: H.boar.contactDamage, dir: r.state.chargeDir };
      break;
    }
    case "fleer":
      m.ai = { kind: "fleer", s: updateFleer(m.ai.s, seen, dt, H.rabbit, field, Math.random) };
      break;
    case "shooter": {
      const r = updateShooter(m.ai.s, seen, dt, H.bee, field);
      m.ai = { kind: "shooter", s: r.state };
      if (r.shot) out.shot = { ...r.shot, pos: { x: r.shot.pos.x, y: r.shot.pos.y - 10 } };
      break;
    }
    case "pack": {
      const r = updatePackMember(m.ai.s, seen, dt, H.chicken, field, Math.random);
      m.ai = { kind: "pack", s: r.state };
      if (r.hit) out.hurt = { damage: H.chicken.peckDamage, dir: r.state.peckDir };
      break;
    }
  }
  // pushed back by a tree or rock: a stroll toward that spot would never arrive, so pick another
  const s = m.ai.s;
  const pos = clampToField(pushOutOfRects(s.pos, obstacles, mobRadius(m)), field);
  if (pos.x !== s.pos.x || pos.y !== s.pos.y) {
    m.ai = { kind: m.ai.kind, s: { ...s, pos, ...("wanderTarget" in s ? { wanderTarget: null } : {}) } } as MobAI;
  }
  out.phaseChanged = m.ai.s.phase !== before;
  return out;
}

// The monster's picture for its phase and heading, plus a warning effect when it starts an attack.
export function drawMob(scene: Phaser.Scene, m: Mob, phaseChanged: boolean, shout: (x: number, y: number, text: string, color: string, ms: number) => void) {
  const s = m.sprite;
  const pos = mobPos(m);
  if (phaseChanged) {
    scene.tweens.killTweensOf(s);
    s.setAlpha(1).clearTint();
    const warn = (tint: number, ms: number) => {
      s.setTint(tint);
      scene.tweens.add({ targets: s, alpha: 0.5, yoyo: true, repeat: 3, duration: ms / 8 });
      shout(pos.x, pos.y - 36, "!", "#ff5050", ms);
    };
    if (m.ai.kind === "charger" && m.ai.s.phase === "telegraph") warn(0xff6060, H.boar.telegraphMs);
    if (m.ai.kind === "shooter" && m.ai.s.phase === "aim") warn(0xffb040, H.bee.aimMs);
    if (m.ai.kind === "pack" && m.ai.s.phase === "windup") warn(0xff7070, H.chicken.windupMs);
  }

  let key: string | null = null;
  let still: string | null = null;
  let dir = mobFacing(m);
  let bob = false;
  switch (m.ai.kind) {
    case "charger": {
      const p = m.ai.s.phase;
      if (p === "charge") dir = m.ai.s.chargeDir;
      const look = lookOf(dir);
      if (p === "telegraph") {
        if (phaseChanged) s.play("boar_windup");
        s.setFlipX(dir.x < 0);
        s.setPosition(pos.x, pos.y).setDepth(pos.y);
        return;
      }
      if (p === "recover") still = `boar_${look}_0`;
      else if (p === "charge") key = look === "side" ? "boar_charge" : `boar_run_${look}`;
      else ((key = `boar_walk_${look}`), (bob = true));
      break;
    }
    case "fleer": {
      const p = m.ai.s.phase;
      const look = lookOf(dir);
      if (p === "rest") still = "rabbit_special_0";
      else if (p === "flee") key = look === "side" ? "rabbit_sprint" : `rabbit_run_${look}`;
      else ((key = `rabbit_walk_${look}`), (bob = true));
      if (p === "rest") dir = { x: dir.x || 1, y: 0 };
      break;
    }
    case "shooter": {
      const p = m.ai.s.phase;
      if (p === "aim") dir = m.ai.s.aimDir;
      if (p === "aim") key = "bee_aim";
      else if (p === "cooldown") still = m.ai.s.phaseMs < 150 ? "bee_attack_2" : "bee_attack_3";
      else key = `bee_walk_${lookOf(dir)}`;
      if (p !== "hover") dir = { x: dir.x || 1, y: 0 };
      break;
    }
    case "pack": {
      const p = m.ai.s.phase;
      if (p === "windup" || p === "peck") dir = m.ai.s.peckDir;
      const look = lookOf(dir);
      if (p === "windup") key = "chicken_windup";
      else if (p === "peck") still = "chicken_peck_2";
      else if (p === "recover") still = "chicken_peck_3";
      else if (p === "chase") key = `chicken_run_${look}`;
      else ((key = `chicken_walk_${look}`), (bob = true));
      if (p === "windup" || p === "peck" || p === "recover") dir = { x: dir.x || 1, y: 0 };
      break;
    }
  }
  const look = lookOf(dir);
  s.setFlipX(look === "side" && dir.x < 0);
  if (still) {
    s.anims.stop();
    s.setTexture(still);
  } else if (key && (s.anims.currentAnim?.key !== key || !s.anims.isPlaying)) s.play(key);
  s.setPosition(pos.x, pos.y + (bob ? stepBob(s) : 0)).setDepth(pos.y);
}
