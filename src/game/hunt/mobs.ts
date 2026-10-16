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
import { FREE, isHeld, stepStatus, wake, type MobStatus } from "../../../shared/hunt/status";
import { isTuskVulnerable, newTusk, updateTusk, type TuskState } from "../../../shared/hunt/tusk";
import { isKingOpen, newKing, updateKing, type KingState } from "../../../shared/hunt/king";
import { hasArt } from "../art";
import { angerSwarm, isLurkerOpen, isLurkerTargetable, isShellOpen, isSwarmOpen, isTongueOpen, newLurker, newShell, newSwarm, newTongue, updateLurker, updateShell, updateSwarm, updateTongue, type LurkerState, type ShellState, type SwarmState, type TongueState } from "../../../shared/hunt/deepMonsters";
import type { Field, Vec } from "../../../shared/hunt/types";
import { lookOf, stepBob } from "./anims";

// One monster on the hunting ground: its spawn (from the hunt plan), its behaviour's state machine
// (shared/hunt), what the side weapons have done to it (status: stunned, drowsy, asleep, tied up) and
// its sprite. The tusk boss is drawn with the boar's frames at twice the size until its own art; the
// Charge King with them at three times, reddened, and his piglets small, until theirs (art/test/king/).
const H = BALANCE.hunt;
// Where the feet are inside each sheet's cells (measured when slicing).
const FEET: Record<MonsterId, number> = { boar: 0.92, rabbit: 0.885, bee: 0.885, chicken: 0.89, tusk: 0.92, king: 0.92, piglet: 0.92, frog: 0.975, snake: 0.979, bat: 0.974, crab: 0.981 };
const KING_ART = hasArt("test/king/side_0.png");
// whose frames a monster is drawn with
export const artOf = (monster: MonsterId): string => (monster === "tusk" || monster === "piglet" || (monster === "king" && !KING_ART) ? "boar" : monster);
// how much bigger than its frames a monster is drawn
const SIZE: Partial<Record<MonsterId, number>> = { tusk: 2, king: KING_ART ? 1 : 3, piglet: 0.6 };
// the Charge King's colour while his own art is not drawn, and when he is angry
export const KING_TINT = KING_ART ? 0xffffff : 0xffb090;
const KING_ANGRY = 0xff7060;

export type Spawn = FloorPlan["spawns"][number];
export type MobAI =
  | { kind: "charger"; s: ChargerState }
  | { kind: "fleer"; s: FleerState }
  | { kind: "shooter"; s: ShooterState }
  | { kind: "pack"; s: PackMemberState }
  | { kind: "boss"; s: TuskState }
  | { kind: "king"; s: KingState }
  | { kind: "tongue"; s: TongueState }
  | { kind: "lurker"; s: LurkerState }
  | { kind: "swarm"; s: SwarmState }
  | { kind: "shell"; s: ShellState };

export interface Mob {
  spawn: Spawn;
  sprite: Phaser.GameObjects.Sprite;
  ai: MobAI;
  hp: number;
  hits: HitLog;
  status: MobStatus;
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
          : kind === "boss"
            ? { kind, s: newTusk(pos) }
            : kind === "king"
              ? { kind, s: newKing(pos) }
            : kind === "tongue"
              ? { kind, s: newTongue(pos) }
              : kind === "lurker"
                ? { kind, s: newLurker(pos) }
                : kind === "swarm"
                  ? { kind, s: newSwarm(pos) }
                  : kind === "shell"
                    ? { kind, s: newShell(pos) }
                    : { kind, s: newPackMember(pos) };
  const big = SIZE[spawn.monster] ?? 1;
  const sprite = scene.add.sprite(pos.x, pos.y, `${artOf(spawn.monster)}_side_0`).setOrigin(0.5, FEET[spawn.monster]).setScale(CHAR_SCALE * big).setDepth(pos.y);
  sprite.setAlpha(0);
  scene.tweens.add({ targets: sprite, alpha: 1, duration: 400 });
  return { spawn, sprite, ai, hp: MONSTERS[spawn.monster].maxHp, hits: EMPTY_HIT_LOG, status: FREE, dead: false };
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
    case "boss":
      return isTuskVulnerable(m.ai.s);
    case "king":
      return isKingOpen(m.ai.s);
    case "tongue":
      return isTongueOpen(m.ai.s);
    case "lurker":
      return isLurkerOpen(m.ai.s);
    case "swarm":
      return isSwarmOpen(m.ai.s);
    case "shell":
      return isShellOpen(m.ai.s);
  }
}

// A water snake under the mud cannot be hit by anything (harpoon, darts, slash).
export const isTargetable = (m: Mob): boolean => !(m.ai.kind === "lurker" && !isLurkerTargetable(m.ai.s));

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
    default:
      break;
  }
}

// A rabbit bolts the moment it is hit (a flock's anger is the scene's job: it knows the flock).
export function mobWasHit(m: Mob) {
  // a hit wakes a sleeping or drowsy monster
  m.status = wake(m.status);
  if (m.ai.kind === "fleer") m.ai = { kind: "fleer", s: fleerHit(m.ai.s) };
}

export function angerFlock(mobs: Mob[], flock: string) {
  for (const m of mobs) {
    if (m.dead || m.spawn.flock !== flock) continue;
    if (m.ai.kind === "pack") m.ai = { kind: "pack", s: angerPack([m.ai.s])[0] };
    // a bat hit: the whole flock folds to dive
    if (m.ai.kind === "swarm") m.ai = { kind: "swarm", s: angerSwarm([m.ai.s])[0] };
  }
}

export interface MobStep {
  hurt?: { damage: number; dir: Vec };
  shot?: Shot;
  // the tusk boss pinned the hunter, or slammed the ground here
  grabbed?: boolean;
  // the frog general's tongue pulls the hunter toward it this far
  pull?: number;
  slam?: Vec;
  // the Charge King: rocks that came down, piglets he called out
  fell?: Vec[];
  piglets?: number;
  // the side weapons' effects: fell asleep, woke up
  statusEvent?: "fell_asleep" | "woke" | null;
  phaseChanged: boolean;
}

// One frame of the monster's behaviour, kept out of trees and rocks. `player` null = knocked out.
// `light`: the lantern's radius around the hunter in the cave (bats keep out of it), 0 elsewhere.
// `pigletsOut`: the Charge King's piglets still running about (he calls no more than the most).
export function stepMob(m: Mob, dt: number, player: Vec | null, field: Field, obstacles: Rect[], light = 0, pigletsOut = 0): MobStep {
  const seen = player ?? { x: -99999, y: -99999 };
  const before = m.ai.s.phase;
  const st = stepStatus(m.status, dt);
  m.status = st.s;
  // stunned, asleep or tied up: it does nothing this frame
  if (isHeld(m.status)) return { phaseChanged: false, statusEvent: st.event };
  const out: MobStep = { phaseChanged: false, statusEvent: st.event };
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
    case "boss": {
      const r = updateTusk(m.ai.s, seen, dt, field, Math.random);
      m.ai = { kind: "boss", s: r.state };
      if (r.hurt) out.hurt = { damage: r.hurt.damage, dir: r.state.chargeDir };
      if (r.grabbed) out.grabbed = true;
      if (r.slam) out.slam = r.slam;
      break;
    }
    case "king": {
      const r = updateKing(m.ai.s, seen, dt, field, Math.random, Math.max(0, m.hp) / MONSTERS[m.spawn.monster].maxHp, pigletsOut);
      m.ai = { kind: "king", s: r.state };
      if (r.hurt) out.hurt = { damage: r.hurt.damage, dir: r.state.chargeDir };
      if (r.fell) out.fell = r.fell;
      if (r.piglets) out.piglets = r.piglets;
      break;
    }
    case "tongue": {
      const r = updateTongue(m.ai.s, seen, dt, field, Math.random);
      m.ai = { kind: "tongue", s: r.state };
      if (r.hurt) out.hurt = { damage: r.hurt.damage, dir: r.state.lashDir };
      if (r.pull) out.pull = r.pull;
      break;
    }
    case "lurker": {
      const r = updateLurker(m.ai.s, seen, dt, field, Math.random);
      m.ai = { kind: "lurker", s: r.state };
      if (r.hurt) out.hurt = { damage: r.hurt.damage, dir: r.state.facing };
      break;
    }
    case "swarm": {
      const r = updateSwarm(m.ai.s, seen, dt, field, light);
      m.ai = { kind: "swarm", s: r.state };
      if (r.hurt) out.hurt = { damage: r.hurt.damage, dir: r.state.diveDir };
      break;
    }
    case "shell": {
      const r = updateShell(m.ai.s, seen, dt, field, Math.random);
      m.ai = { kind: "shell", s: r.state };
      if (r.hurt) out.hurt = { damage: r.hurt.damage, dir: r.state.facing };
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
  const art = artOf(m.spawn.monster);
  // held by a side weapon: its standing frame, still
  if (isHeld(m.status)) {
    s.anims.stop();
    s.setTexture(`${art}_side_0`).setFlipX(mobFacing(m).x < 0);
    s.setPosition(pos.x, pos.y).setDepth(pos.y);
    return;
  }
  if (phaseChanged) {
    scene.tweens.killTweensOf(s);
    s.setAlpha(1).clearTint();
    if (m.ai.kind === "king") s.setTint(m.ai.s.angry ? KING_ANGRY : KING_TINT);
    const warn = (tint: number, ms: number) => {
      s.setTint(tint);
      scene.tweens.add({ targets: s, alpha: 0.5, yoyo: true, repeat: 3, duration: ms / 8 });
      shout(pos.x, pos.y - 36, "!", "#ff5050", ms);
    };
    if (m.ai.kind === "charger" && m.ai.s.phase === "telegraph") warn(0xff6060, H.boar.telegraphMs);
    if (m.ai.kind === "shooter" && m.ai.s.phase === "aim") warn(0xffb040, H.bee.aimMs);
    if (m.ai.kind === "pack" && m.ai.s.phase === "windup") warn(0xff7070, H.chicken.windupMs);
    if (m.ai.kind === "boss" && (m.ai.s.phase === "telegraph" || m.ai.s.phase === "slamWindup" || m.ai.s.phase === "rush")) warn(0xff4040, H.tusk.telegraphMs);
    if (m.ai.kind === "king" && (m.ai.s.phase === "chargeTell" || m.ai.s.phase === "rockTell" || m.ai.s.phase === "roar")) warn(0xff4040, H.king.chargeTelegraphMs);
    if (m.ai.kind === "king" && m.ai.s.phase === "stunned") shout(pos.x, pos.y - 70, "@@", "#ffd166", H.king.stunMs);
    if (m.ai.kind === "tongue" && m.ai.s.phase === "puff") warn(0xff6060, H.deep.frog.puffMs);
    if (m.ai.kind === "lurker" && m.ai.s.phase === "ripple") shout(pos.x, pos.y - 20, "!", "#ff5050", H.deep.snake.rippleMs);
    if (m.ai.kind === "swarm" && m.ai.s.phase === "fold") warn(0xff6060, H.deep.bat.foldMs);
    if (m.ai.kind === "shell" && m.ai.s.phase === "claw") warn(0xff6060, H.deep.crab.clawMs);
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
    case "boss": {
      const p = m.ai.s.phase;
      if (p === "charge" || p === "rush") dir = m.ai.s.chargeDir;
      const look = lookOf(dir);
      if (p === "telegraph" || p === "slamWindup") {
        if (phaseChanged) s.play("boar_windup");
        s.setFlipX(dir.x < 0);
        s.setPosition(pos.x, pos.y).setDepth(pos.y);
        return;
      }
      if (p === "recover" || p === "grab" || p === "gap" || p === "slam") still = `boar_${look}_0`;
      else if (p === "charge" || p === "rush") key = look === "side" ? "boar_charge" : `boar_run_${look}`;
      else ((key = `boar_walk_${look}`), (bob = true));
      break;
    }
    case "king": {
      // the boar's frames until his own: pawing before a charge, a roll or a roar; still while stunned
      // or catching his breath
      const p = m.ai.s.phase;
      if (p === "charge" || p === "chargeTell") dir = m.ai.s.chargeDir;
      const look = lookOf(dir);
      if (p === "chargeTell" || p === "rockTell" || p === "roar") {
        if (phaseChanged) s.play("boar_windup");
        s.setFlipX(dir.x < 0);
        s.setPosition(pos.x, pos.y).setDepth(pos.y);
        return;
      }
      if (p === "stunned" || p === "breather") still = `boar_${look}_0`;
      else if (p === "charge") key = look === "side" ? "boar_charge" : `boar_run_${look}`;
      else ((key = `boar_walk_${look}`), (bob = true));
      break;
    }
    // the deep monsters: their walk while moving, a frame of the special row for each move
    case "tongue": {
      const p = m.ai.s.phase;
      if (p !== "wander") dir = m.ai.s.lashDir;
      if (p === "puff") still = "frog_special_0";
      else if (p === "lash") still = "frog_special_2";
      else if (p === "retract") still = "frog_special_3";
      else ((key = `frog_walk_${lookOf(dir)}`), (bob = true));
      if (p !== "wander") dir = { x: dir.x || 1, y: 0 };
      break;
    }
    case "lurker": {
      const p = m.ai.s.phase;
      if (p === "hidden") still = "snake_special_0";
      else if (p === "ripple") still = "snake_special_1";
      else if (m.ai.s.phaseMs < 400) still = "snake_special_2";
      else still = "snake_special_3";
      dir = { x: dir.x || 1, y: 0 };
      break;
    }
    case "swarm": {
      const p = m.ai.s.phase;
      if (p === "dive") dir = m.ai.s.diveDir;
      if (p === "fold") still = "bat_special_0";
      else if (p === "dive") still = m.ai.s.phaseMs < 250 ? "bat_special_1" : "bat_special_2";
      else if (p === "dazed") still = "bat_special_3";
      else key = `bat_walk_${lookOf(dir)}`;
      if (p !== "hover") dir = { x: dir.x || 1, y: 0 };
      break;
    }
    case "shell": {
      const p = m.ai.s.phase;
      if (p === "claw") still = "crab_special_0";
      else if (p === "snap") still = "crab_special_1";
      else if (p === "flipped") still = "crab_special_3";
      else ((key = `crab_walk_${lookOf(dir)}`), (bob = true));
      if (p !== "wander") dir = { x: dir.x || 1, y: 0 };
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
  // the King's colour comes back after a hit's flash
  if (m.ai.kind === "king" && !s.isTinted) s.setTint(m.ai.s.angry ? KING_ANGRY : KING_TINT);
  if (still) {
    s.anims.stop();
    s.setTexture(still);
  } else if (key && (s.anims.currentAnim?.key !== key || !s.anims.isPlaying)) s.play(key);
  s.setPosition(pos.x, pos.y + (bob ? stepBob(s) : 0)).setDepth(pos.y);
}
