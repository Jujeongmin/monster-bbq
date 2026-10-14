import Phaser from "phaser";
import { koPenalty } from "../../../shared/actions";
import { BALANCE } from "../../../shared/balance";
import { isVulnerable, newCharger, updateCharger, type ChargerState } from "../../../shared/hunt/charger";
import { EMPTY_HIT_LOG, computeHit, coneTargets, meatGrade, nextComboStep, recordHit, type HitLog, type WeaponKind } from "../../../shared/hunt/combat";
import { clampToField, distance, moveByInput, pushOutOfRects, unit, type Rect } from "../../../shared/hunt/geometry";
import { scatter, seededRandom } from "../../../shared/hunt/scatter";
import { fireHarpoon, harpoonDone, harpoonHit, reelStep, stepHarpoon, type Harpoon } from "../../../shared/hunt/harpoon";
import type { Vec } from "../../../shared/hunt/types";
import { t } from "../../i18n";
import { artUrl } from "../art";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { joystickVector } from "../joystick";

// Top-down (quarter view) hunting prototype, plan 01, with Dave-the-Diver controls.
// PC: WASD / arrows to move, aim with the mouse, left click = harpoon, right click = slash
//     (keyboard only: Z = slash, X = harpoon straight ahead).
// Touch: stick on the left; press on the right half to aim at a spot, release to fire; slash button.
// A harpooned boar is reeled in and left dazed, so a slash combo on it counts as counters.
const H = BALANCE.hunt;
// A frame gap after the tab was hidden must not teleport anything (rules are also clamped).
const MAX_DT_MS = 50;
// Where the feet are inside each sprite's canvas (transparent padding underneath). Tune by eye.
const FEET = { hunter: 0.9, boar: 0.9 };
// Codex sprite sheets (art-src/codex), 4 frames per row: art/test/<who>/<row>_<n>.png
const HUNTER_ROWS = ["down", "up", "side", "slash", "throw"] as const;
const BOAR_ROWS = ["side", "down", "up", "windup", "charge"] as const;
// Quarter-view sprites face down, up, or sideways (the side picture is flipped for left).
type Look = "down" | "up" | "side";
function lookOf(v: Vec): Look {
  return Math.abs(v.y) > Math.abs(v.x) ? (v.y > 0 ? "down" : "up") : "side";
}
// Touch controls, in screen pixels of the game, placed relative to its size.
const STICK = { x: GAME_WIDTH * 0.12, y: GAME_HEIGHT * 0.78, radius: 36, deadZone: 0.2 };
const SLASH_BTN = { x: GAME_WIDTH * 0.89, y: GAME_HEIGHT * 0.8, radius: 28 };

interface Boar {
  id: number;
  sprite: Phaser.GameObjects.Sprite;
  ai: ChargerState;
  hp: number;
  hits: HitLog;
  dead: boolean;
}

interface Player {
  pos: Vec;
  // unit vector toward the aim (or the last move on touch)
  aim: Vec;
  hp: number;
  cooldownMs: number;
  harpoonCooldownMs: number;
  swingMs: number;
  comboStep: number;
  msSinceSwing: number;
  down: boolean;
}

type Keys = Record<"W" | "A" | "S" | "D" | "Z" | "J" | "X" | "K" | "R", Phaser.Input.Keyboard.Key>;

// What the hunt hands to the day flow when it ends (PhaserGame forwards the "hunt:end" event).
export interface HuntResult {
  meat: { premium: number; normal: number };
  ko: boolean;
}

// Map objects (Codex art, art/test/objects): sprite size comes from the image; `foot` is the solid
// base around the anchor (bottom centre), so the hunter can walk behind a canopy.
const OBJECT_KINDS = {
  tree_round: { foot: { w: 22, h: 10 }, tree: true },
  tree_pine: { foot: { w: 18, h: 10 }, tree: true },
  tree_cluster: { foot: { w: 24, h: 10 }, tree: true },
  bush_pink: { foot: { w: 40, h: 16 }, tree: false },
  bush_blue: { foot: { w: 40, h: 16 }, tree: false },
  rock_big: { foot: { w: 38, h: 18 }, tree: false },
  rock_small: { foot: { w: 30, h: 12 }, tree: false },
} as const;
type ObjectKind = keyof typeof OBJECT_KINDS;
const TREES: ObjectKind[] = ["tree_round", "tree_pine", "tree_cluster"];
const SMALL: ObjectKind[] = ["bush_pink", "bush_blue", "rock_big", "rock_small"];
const MAP_SEED = 20261014;

interface MapObject {
  kind: ObjectKind;
  sprite: Phaser.GameObjects.Image;
  foot: Rect;
}

export class HuntScene extends Phaser.Scene {
  private player!: Player;
  private boars: Boar[] = [];
  private nextBoarId = 1;
  private hitStopMs = 0;
  private objects: MapObject[] = [];
  private obstacles: Rect[] = [];
  private hunter!: Phaser.GameObjects.Sprite;
  private hud!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Keys;
  private touch = false;
  private harpoon: Harpoon | null = null;
  private reelingId: number | null = null;
  private slashQueued = false;
  private bag = { premium: 0, normal: 0 };
  private ended = false;
  private bagText!: Phaser.GameObjects.Text;
  private returnButton!: Phaser.GameObjects.Text;
  private shotQueued: Vec | null = null;
  private stickPointer: number | null = null;
  private stickVec: Vec = { x: 0, y: 0 };
  private stickKnob!: Phaser.GameObjects.Arc;
  private aimPointer: number | null = null;
  private aimScreen: Vec | null = null;

  constructor() {
    super("hunt");
  }

  // Runs on every start and restart, so a knocked-out hunter comes back fresh.
  init() {
    this.player = {
      pos: { x: 128, y: 128 },
      aim: { x: 1, y: 0 },
      hp: H.player.maxHp,
      cooldownMs: 0,
      harpoonCooldownMs: 0,
      swingMs: 0,
      comboStep: 0,
      msSinceSwing: Infinity,
      down: false,
    };
    this.boars = [];
    this.objects = [];
    this.obstacles = [];
    this.hitStopMs = 0;
    this.harpoon = null;
    this.reelingId = null;
    this.slashQueued = false;
    this.bag = { premium: 0, normal: 0 };
    this.ended = false;
    this.shotQueued = null;
    this.stickPointer = null;
    this.stickVec = { x: 0, y: 0 };
    this.aimPointer = null;
    this.aimScreen = null;
  }

  preload() {
    this.load.image("grass", artUrl("test/bg/grass.png"));
    for (const k of Object.keys(OBJECT_KINDS)) this.load.image(`obj_${k}`, artUrl(`test/objects/${k}.png`));
    for (const row of HUNTER_ROWS) for (let i = 0; i < 4; i++) this.load.image(`hunter_${row}_${i}`, artUrl(`test/hunter/${row}_${i}.png`));
    for (const row of BOAR_ROWS) for (let i = 0; i < 4; i++) this.load.image(`boar_${row}_${i}`, artUrl(`test/boar/${row}_${i}.png`));
  }

  create() {
    this.add.tileSprite(0, 0, H.world.w, H.world.h, "grass").setOrigin(0).setDepth(-1000);
    this.placeObjects();

    const frames = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: `${prefix}_${i}` }));
    if (!this.anims.exists("hunter_slash")) {
      for (const look of ["down", "up", "side"] as const) {
        this.anims.create({ key: `hunter_walk_${look}`, frames: frames(`hunter_${look}`, 4), frameRate: 8, repeat: -1 });
        this.anims.create({ key: `boar_walk_${look}`, frames: frames(`boar_${look}`, 4), frameRate: 7, repeat: -1 });
        this.anims.create({ key: `boar_run_${look}`, frames: frames(`boar_${look}`, 4), frameRate: 16, repeat: -1 });
      }
      this.anims.create({ key: "hunter_slash", frames: frames("hunter_slash", 4), frameRate: Math.round(4000 / H.weapons.melee.swingMs) });
      this.anims.create({ key: "hunter_throw", frames: frames("hunter_throw", 4), frameRate: 18 });
      this.anims.create({ key: "boar_windup", frames: frames("boar_windup", 4), frameRate: Math.round(4000 / H.boar.telegraphMs) });
      this.anims.create({ key: "boar_charge", frames: frames("boar_charge", 4), frameRate: 14, repeat: -1 });
    }

    this.hunter = this.add.sprite(this.player.pos.x, this.player.pos.y, "hunter_down_0").setOrigin(0.5, FEET.hunter);
    this.fx = this.add.graphics().setDepth(5000);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, H.world.w, H.world.h);
    cam.startFollow(this.hunter, true, 0.12, 0.12);

    for (let i = 0; i < H.boarCount; i++) this.spawnBoar();

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys("W,A,S,D,Z,J,X,K,R") as Keys;

    // touch controls on touch devices (add ?touch to the URL to try them with a mouse)
    this.touch = this.sys.game.device.input.touch || new URLSearchParams(location.search).has("touch");
    if (this.touch) this.createTouchControls();
    else this.createMouseControls();

    this.hud = this.add.graphics().setScrollFactor(0).setDepth(10000);
    const hudStyle = { fontFamily: "monospace", fontSize: "10px", color: "#ffffff", backgroundColor: "#00000088" };
    if (!this.touch) this.add.text(6, 4, t("hunt.help"), hudStyle).setScrollFactor(0).setDepth(10000);
    this.bagText = this.add.text(8, 34, "", hudStyle).setScrollFactor(0).setDepth(10000);
    // placeholder button (UI art comes in plan 08)
    this.returnButton = this.add
      .text(GAME_WIDTH - 8, 8, t("hunt.return"), { ...hudStyle, fontSize: "12px", padding: { x: 6, y: 3 } })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(10000)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.endHunt(false));
  }

  update(_time: number, rawDt: number) {
    const dt = Math.min(rawDt, MAX_DT_MS);
    if (this.ended) return;
    if (this.hitStopMs > 0) {
      this.hitStopMs -= dt;
      if (this.hitStopMs <= 0) this.anims.resumeAll();
      return;
    }
    if (!this.player.down) this.updatePlayer(dt);
    this.updateHarpoon(dt);
    for (const b of this.boars) this.updateBoar(b, dt);
    this.fadeCanopies();
    this.drawFx();
    this.drawHud();
  }

  private createMouseControls() {
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.includes(this.returnButton)) return;
      if (p.rightButtonDown()) this.slashQueued = true;
      else this.shotQueued = this.toWorld(p.x, p.y);
    });
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    p.cooldownMs = Math.max(0, p.cooldownMs - dt);
    p.harpoonCooldownMs = Math.max(0, p.harpoonCooldownMs - dt);
    p.swingMs = Math.max(0, p.swingMs - dt);
    p.msSinceSwing += dt;

    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.R)) {
      this.endHunt(false);
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(k.Z) || Phaser.Input.Keyboard.JustDown(k.J)) this.slashQueued = true;
    if (Phaser.Input.Keyboard.JustDown(k.X) || Phaser.Input.Keyboard.JustDown(k.K)) this.shotQueued = { x: p.pos.x + p.aim.x * 100, y: p.pos.y + p.aim.y * 100 - H.harpoon.handHeight };

    // Dave-style: on PC the hunter always looks at the mouse
    if (!this.touch) {
      const aim = this.toWorld(this.input.activePointer.x, this.input.activePointer.y);
      p.aim = unit({ x: aim.x - p.pos.x, y: aim.y - (p.pos.y - H.harpoon.handHeight) }, p.aim);
    }

    // a swing finishes before the hunter moves or swings again
    if (p.swingMs > 0) return;
    // a slash pressed during the cooldown is buffered and comes out as soon as it can
    if (this.slashQueued && p.cooldownMs === 0) {
      this.slashQueued = false;
      this.slash();
      return;
    }
    if (this.shotQueued) {
      const at = this.shotQueued;
      this.shotQueued = null;
      if (p.harpoonCooldownMs === 0 && !this.harpoon && this.reelingId === null) {
        this.throwHarpoon(at);
        return;
      }
    }

    const move = this.readMove();
    const moving = move.x !== 0 || move.y !== 0;
    if (moving) {
      const next = moveByInput(p.pos, move, H.player.speed, dt, H.field, H.player.depthSpeedRatio);
      p.pos = clampToField(pushOutOfRects(next, this.obstacles, H.player.radius), H.field);
      if (this.touch && this.aimPointer === null) p.aim = unit(move, p.aim);
    }
    this.showHunter(moving);
  }

  // Walk cycle toward the aim (down, up or sideways); standing still shows its first frame.
  private showHunter(moving: boolean) {
    const p = this.player;
    const look = lookOf(p.aim);
    this.hunter.setFlipX(look === "side" && p.aim.x < 0);
    if (moving) {
      const key = `hunter_walk_${look}`;
      if (this.hunter.anims.currentAnim?.key !== key || !this.hunter.anims.isPlaying) this.hunter.play(key);
    } else {
      this.hunter.anims.stop();
      this.hunter.setTexture(`hunter_${look}_0`);
    }
    this.hunter.setPosition(p.pos.x, p.pos.y).setDepth(p.pos.y);
  }

  // Keys and the stick add up; the rules cap the length at 1.
  private readMove(): Vec {
    const c = this.cursors;
    const k = this.keys;
    const x = (c.right.isDown || k.D.isDown ? 1 : 0) - (c.left.isDown || k.A.isDown ? 1 : 0) + this.stickVec.x;
    const y = (c.down.isDown || k.S.isDown ? 1 : 0) - (c.up.isDown || k.W.isDown ? 1 : 0) + this.stickVec.y;
    return { x: Phaser.Math.Clamp(x, -1, 1), y: Phaser.Math.Clamp(y, -1, 1) };
  }

  private hand(): Vec {
    return { x: this.player.pos.x, y: this.player.pos.y - H.harpoon.handHeight };
  }

  private throwHarpoon(at: Vec) {
    const p = this.player;
    p.aim = unit({ x: at.x - p.pos.x, y: at.y - this.hand().y }, p.aim);
    p.harpoonCooldownMs = H.harpoon.cooldownMs;
    p.swingMs = H.harpoon.throwLockMs;
    this.hunter.setFlipX(p.aim.x < 0).play("hunter_throw");
    this.harpoon = fireHarpoon(this.hand(), at, p.aim.x < 0 ? -1 : 1);
  }

  private updateHarpoon(dt: number) {
    if (this.harpoon) {
      const h = stepHarpoon(this.harpoon, H.harpoon.speed, dt);
      const live = this.boars.filter((b) => !b.dead).map((b) => ({ pos: b.ai.pos, boar: b }));
      const struck = harpoonHit(h.tip, live, H.harpoon.bodyOffsetY, H.harpoon.hitRadius)?.boar;
      if (struck) {
        this.harpoon = null;
        this.harpoonStrike(struck);
      } else {
        this.harpoon = harpoonDone(h, H.harpoon.range) ? null : h;
      }
    }
    if (this.reelingId !== null) {
      const b = this.liveBoar(this.reelingId);
      if (!b || this.player.down) {
        this.reelingId = null;
        return;
      }
      const r = reelStep(b.ai.pos, this.player.pos, H.harpoon.pullSpeed, dt, H.harpoon.pullStopDist, H.field);
      b.ai = { ...b.ai, pos: r.pos };
      b.sprite.setPosition(r.pos.x, r.pos.y).setDepth(r.pos.y);
      if (r.done) {
        this.reelingId = null;
        // reeled in and dazed for dazeMs (the recover phase, started early): open for counters
        const look = unit({ x: this.player.pos.x - r.pos.x, y: this.player.pos.y - r.pos.y });
        b.ai = { ...b.ai, phase: "recover", phaseMs: H.boar.recoverMs - H.harpoon.dazeMs, facing: look };
        this.showPhase(b);
        this.popText(r.pos.x, r.pos.y - 48, "기회!", "#7fe0ff", 600);
      }
    }
  }

  private harpoonStrike(b: Boar) {
    const p = this.player;
    const hit = computeHit(
      { weapon: H.weapons.ranged, comboStep: 1, targetVulnerable: isVulnerable(b.ai), attackerPos: p.pos, targetPos: b.ai.pos, targetFacing: b.ai.facing },
      H.hit,
    );
    this.applyHit(b, "ranged", hit.damage, [hit.counter && "카운터!", hit.backAttack && "백어택!"]);
    this.hitStop(H.hitStopMs);
    if (!b.dead) {
      this.reelingId = b.id;
      this.tweens.killTweensOf(b.sprite);
      b.sprite.setAlpha(1).clearTint();
      b.sprite.anims.stop();
      b.sprite.setTexture(`boar_${lookOf(b.ai.facing)}_0`);
    }
  }

  private slash() {
    const p = this.player;
    const weapon = H.weapons.melee;
    p.comboStep = nextComboStep(p.comboStep, p.msSinceSwing, true, "melee", H.hit);
    p.msSinceSwing = 0;
    p.cooldownMs = weapon.cooldownMs;
    p.swingMs = weapon.swingMs;
    // step into each slash so the knockback never pushes the target out of reach mid-combo
    p.pos = clampToField(pushOutOfRects({ x: p.pos.x + p.aim.x * H.hit.knockback, y: p.pos.y + p.aim.y * H.hit.knockback }, this.obstacles, H.player.radius), H.field);
    this.hunter.setFlipX(p.aim.x < 0).setPosition(p.pos.x, p.pos.y).setDepth(p.pos.y).play("hunter_slash");
    const comboStep = p.comboStep;
    const aim = p.aim;
    this.time.delayedCall(weapon.swingMs * 0.5, () => this.landSlash(comboStep, aim));
  }

  private landSlash(comboStep: number, aim: Vec) {
    const p = this.player;
    if (p.down) return;
    const live = this.boars.filter((b) => !b.dead && b.id !== this.reelingId).map((b) => ({ pos: b.ai.pos, boar: b }));
    const struck = coneTargets(p.pos, aim, live, H.weapons.melee.range, H.slashHalfAngle).map((t) => t.boar);
    this.slashArc = { at: p.pos, aim, ms: 120 };
    if (struck.length === 0) return;
    let big = false;
    for (const b of struck) {
      const hit = computeHit(
        { weapon: H.weapons.melee, comboStep, targetVulnerable: isVulnerable(b.ai), attackerPos: p.pos, targetPos: b.ai.pos, targetFacing: b.ai.facing },
        H.hit,
      );
      big ||= hit.finisher || hit.counter;
      const away = unit({ x: b.ai.pos.x - p.pos.x, y: b.ai.pos.y - p.pos.y }, aim);
      b.ai = { ...b.ai, pos: clampToField(pushOutOfRects({ x: b.ai.pos.x + away.x * hit.knockback, y: b.ai.pos.y + away.y * hit.knockback }, this.obstacles, H.boar.radius), H.field) };
      this.applyHit(b, "melee", hit.damage, [hit.counter && "카운터!", hit.backAttack && "백어택!", hit.finisher && "막타!"]);
    }
    // game feel: one freeze per swing, longer and with a shake on big hits
    this.hitStop(big ? H.hitStopMs * 2 : H.hitStopMs);
    if (big) this.cameras.main.shake(120, 0.012);
  }

  private slashArc: { at: Vec; aim: Vec; ms: number } | null = null;

  private applyHit(b: Boar, kind: WeaponKind, damage: number, tagList: (string | false)[]) {
    b.hp -= damage;
    b.hits = recordHit(b.hits, kind);
    b.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => b.sprite.active && b.sprite.clearTint());
    const tags = tagList.filter(Boolean).join(" ");
    this.popText(b.ai.pos.x, b.ai.pos.y - 44, `${damage}${tags ? " " + tags : ""}`, tags ? "#ffd166" : "#ffffff");
    if (b.hp <= 0) this.killBoar(b);
  }

  private killBoar(b: Boar) {
    b.dead = true;
    if (this.reelingId === b.id) this.reelingId = null;
    const premium = meatGrade(b.hits, H.premiumMaxRangedHits) === "premium";
    if (this.bag.premium + this.bag.normal < BALANCE.economy.maxMeatPerHunt) this.bag[premium ? "premium" : "normal"] += 1;
    else this.popText(this.player.pos.x, this.player.pos.y - 60, t("hunt.bagFull"), "#ffb0b0", 1200);
    this.popText(b.ai.pos.x, b.ai.pos.y - 60, premium ? "삼겹살 ★특급" : "삼겹살 (보통)", premium ? "#ffd166" : "#dddddd", 1400);
    // stop a wind-up blink first, or it fights the fade-out
    this.tweens.killTweensOf(b.sprite);
    b.sprite.setAlpha(1).clearTint();
    this.tweens.add({
      targets: b.sprite,
      alpha: 0,
      duration: 500,
      onComplete: () => {
        b.sprite.destroy();
        this.boars = this.boars.filter((x) => x !== b);
        this.time.delayedCall(2500, () => this.spawnBoar());
      },
    });
  }

  private updateBoar(b: Boar, dt: number) {
    if (b.dead || b.id === this.reelingId) return;
    const before = b.ai.phase;
    // a knocked-out hunter is ignored: send the boars wandering
    const seen = this.player.down ? { x: -99999, y: -99999 } : this.player.pos;
    const r = updateCharger(b.ai, seen, dt, H.boar, H.field, Math.random);
    const pos = clampToField(pushOutOfRects(r.state.pos, this.obstacles, H.boar.radius), H.field);
    // pushed back by a tree or rock: a stroll toward that spot would never arrive, so pick another
    const blocked = pos.x !== r.state.pos.x || pos.y !== r.state.pos.y;
    b.ai = { ...r.state, pos, wanderTarget: blocked ? null : r.state.wanderTarget };
    if (r.hit) this.hurtPlayer(H.boar.contactDamage, b.ai.chargeDir);
    b.sprite.setPosition(b.ai.pos.x, b.ai.pos.y).setDepth(b.ai.pos.y);
    if (b.ai.phase !== before) this.showPhase(b);
    this.showBoar(b, b.ai.phase !== before);
  }

  // Effects when a boar changes phase: the wind-up blinks red and shouts "!".
  private showPhase(b: Boar) {
    const s = b.sprite;
    this.tweens.killTweensOf(s);
    s.setAlpha(1).clearTint();
    if (b.ai.phase === "telegraph") {
      s.setTint(0xff6060);
      this.tweens.add({ targets: s, alpha: 0.45, yoyo: true, repeat: 3, duration: H.boar.telegraphMs / 8 });
      this.popText(b.ai.pos.x, b.ai.pos.y - 52, "!", "#ff5050", H.boar.telegraphMs);
    }
  }

  // The boar's picture for its phase and heading: walk / gallop toward where it goes, the wind-up
  // once when it starts, a still frame while it catches its breath.
  private showBoar(b: Boar, phaseChanged: boolean) {
    const s = b.sprite;
    const dir = b.ai.phase === "charge" ? b.ai.chargeDir : b.ai.facing;
    const look = lookOf(dir);
    s.setFlipX(dir.x < 0 && (look === "side" || b.ai.phase === "telegraph"));
    let key: string;
    switch (b.ai.phase) {
      case "telegraph":
        if (phaseChanged) s.play("boar_windup");
        return;
      case "recover":
        s.anims.stop();
        s.setTexture(`boar_${look}_0`);
        return;
      case "charge":
        key = look === "side" ? "boar_charge" : `boar_run_${look}`;
        break;
      default:
        key = `boar_walk_${look}`;
    }
    if (s.anims.currentAnim?.key !== key || !s.anims.isPlaying) s.play(key);
  }

  private hurtPlayer(damage: number, dir: Vec) {
    const p = this.player;
    if (p.down) return;
    p.hp = Math.max(0, p.hp - damage);
    p.pos = clampToField(pushOutOfRects({ x: p.pos.x + dir.x * 24, y: p.pos.y + dir.y * 24 }, this.obstacles, H.player.radius), H.field);
    p.swingMs = 0;
    this.hunter.setPosition(p.pos.x, p.pos.y).setTint(0xff8080);
    this.time.delayedCall(150, () => this.hunter.clearTint());
    this.cameras.main.shake(100, 0.01);
    this.popText(p.pos.x, p.pos.y - 44, `-${damage}`, "#ff6060");
    if (p.hp === 0) {
      p.down = true;
      this.harpoon = null;
      this.reelingId = null;
      this.hunter.anims.stop();
      this.hunter.setTint(0x777777).setAngle(-90);
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, t("hunt.ko"), { fontFamily: "monospace", fontSize: "12px", color: "#ffffff", backgroundColor: "#000000aa", padding: { x: 6, y: 3 } })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(10001);
      this.time.delayedCall(1500, () => this.endHunt(true));
    }
  }

  private spawnBoar() {
    const f = H.field;
    let pos: Vec = { x: 0, y: 0 };
    // somewhere open, not inside a tree clump and not on top of the hunter
    for (let tries = 0; tries < 30; tries++) {
      pos = { x: f.minX + Math.random() * (f.maxX - f.minX), y: f.minY + Math.random() * (f.maxY - f.minY) };
      const clear = pushOutOfRects(pos, this.obstacles, H.boar.radius);
      if (distance(pos, this.player.pos) > 180 && clear.x === pos.x && clear.y === pos.y) break;
    }
    const sprite = this.add.sprite(pos.x, pos.y, "boar_side_0").setOrigin(0.5, FEET.boar);
    sprite.play("boar_walk_side");
    this.boars.push({ id: this.nextBoarId++, sprite, ai: newCharger(pos), hp: H.boar.maxHp, hits: EMPTY_HIT_LOG, dead: false });
  }

  // Placeholder touch controls (PixelLab art later). Left half: a stick. Right half: press on a spot to
  // aim, release to fire the harpoon there. A slash button in the corner.
  private createTouchControls() {
    this.input.addPointer(2);
    const ui = (o: Phaser.GameObjects.Arc) => o.setScrollFactor(0).setDepth(10000);
    ui(this.add.circle(STICK.x, STICK.y, STICK.radius, 0x000000, 0.35).setStrokeStyle(1, 0xffffff, 0.6));
    this.stickKnob = ui(this.add.circle(STICK.x, STICK.y, 14, 0xffffff, 0.6));
    const slash = ui(this.add.circle(SLASH_BTN.x, SLASH_BTN.y, SLASH_BTN.radius, 0xc03030, 0.6).setStrokeStyle(1, 0xffffff, 0.8));
    this.add.text(SLASH_BTN.x, SLASH_BTN.y, "베기", { fontFamily: "monospace", fontSize: "10px", color: "#ffffff" }).setOrigin(0.5).setScrollFactor(0).setDepth(10001);
    slash.setInteractive(new Phaser.Geom.Circle(SLASH_BTN.radius, SLASH_BTN.radius, SLASH_BTN.radius + 6), Phaser.Geom.Circle.Contains);
    slash.on("pointerdown", () => (this.slashQueued = true));

    const onSlash = (p: Phaser.Input.Pointer) => Phaser.Math.Distance.Between(p.x, p.y, SLASH_BTN.x, SLASH_BTN.y) <= SLASH_BTN.radius + 6;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (onSlash(p) || over.includes(this.returnButton)) return;
      if (p.x < GAME_WIDTH * 0.45) {
        if (this.stickPointer === null) {
          this.stickPointer = p.id;
          this.updateStick(p);
        }
      } else if (this.aimPointer === null) {
        this.aimPointer = p.id;
        this.aimScreen = { x: p.x, y: p.y };
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.id === this.stickPointer) this.updateStick(p);
      if (p.id === this.aimPointer) {
        this.aimScreen = { x: p.x, y: p.y };
        const w = this.toWorld(p.x, p.y);
        this.player.aim = unit({ x: w.x - this.player.pos.x, y: w.y - this.hand().y }, this.player.aim);
      }
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id === this.stickPointer) {
        this.stickPointer = null;
        this.stickVec = { x: 0, y: 0 };
        this.stickKnob.setPosition(STICK.x, STICK.y);
      }
      if (p.id === this.aimPointer) {
        if (this.aimScreen) this.shotQueued = this.toWorld(this.aimScreen.x, this.aimScreen.y);
        this.aimPointer = null;
        this.aimScreen = null;
      }
    };
    this.input.on("pointerup", release);
    this.input.on("pointerupoutside", release);
  }

  private updateStick(p: Phaser.Input.Pointer) {
    this.stickVec = joystickVector(STICK, { x: p.x, y: p.y }, STICK.radius, STICK.deadZone);
    this.stickKnob.setPosition(STICK.x + this.stickVec.x * STICK.radius, STICK.y + this.stickVec.y * STICK.radius);
  }

  private toWorld(x: number, y: number): Vec {
    const w = this.cameras.main.getWorldPoint(x, y);
    return { x: w.x, y: w.y };
  }

  // World-space effects drawn on top: harpoon rope, aiming line, charge warning lines, slash arc.
  private drawFx() {
    const g = this.fx;
    g.clear();
    for (const b of this.boars) {
      if (b.dead || b.ai.phase !== "telegraph") continue;
      // where the charge will go: the way to step out of
      const len = H.boar.chargeSpeed * (H.boar.chargeMs / 1000);
      const d = b.ai.chargeDir;
      const n = { x: -d.y * H.boar.hitRadius, y: d.x * H.boar.hitRadius };
      const from = b.ai.pos;
      const to = { x: from.x + d.x * len, y: from.y + d.y * len };
      // translucent red turns brown on the green grass, so: a dark lane, solid red edges and
      // marching red chevrons pointing the way the charge will go
      g.fillStyle(0x400000, 0.35).fillPoints([
        { x: from.x + n.x, y: from.y + n.y },
        { x: to.x + n.x, y: to.y + n.y },
        { x: to.x - n.x, y: to.y - n.y },
        { x: from.x - n.x, y: from.y - n.y },
      ], true);
      g.lineStyle(1, 0xff3030, 1)
        .lineBetween(from.x + n.x, from.y + n.y, to.x + n.x, to.y + n.y)
        .lineBetween(from.x - n.x, from.y - n.y, to.x - n.x, to.y - n.y);
      const march = (this.time.now / 8) % 16;
      g.lineStyle(2, 0xff2020, 1);
      for (let s = march; s < len - 6; s += 16) {
        const tip = { x: from.x + d.x * (s + 6), y: from.y + d.y * (s + 6) };
        const back = { x: from.x + d.x * s, y: from.y + d.y * s };
        g.lineBetween(back.x + n.x * 0.5, back.y + n.y * 0.5, tip.x, tip.y).lineBetween(back.x - n.x * 0.5, back.y - n.y * 0.5, tip.x, tip.y);
      }
    }
    if (this.slashArc) {
      const { at, aim } = this.slashArc;
      const a = Math.atan2(aim.y, aim.x);
      g.lineStyle(2, 0xffffff, 0.8).beginPath().arc(at.x, at.y - 10, H.weapons.melee.range * 0.8, a - H.slashHalfAngle, a + H.slashHalfAngle).strokePath();
      this.slashArc.ms -= 16;
      if (this.slashArc.ms <= 0) this.slashArc = null;
    }
    if (this.player.down) return;
    const hand = this.hand();
    let end: Vec | null = this.harpoon ? this.harpoon.tip : null;
    const reeled = this.liveBoar(this.reelingId);
    if (reeled) end = { x: reeled.ai.pos.x, y: reeled.ai.pos.y - H.harpoon.bodyOffsetY };
    if (end) {
      g.lineStyle(1, 0xe8d8b0, 1).lineBetween(hand.x, hand.y, end.x, end.y);
      g.fillStyle(0xcfd8e0, 1).fillCircle(end.x, end.y, 1.5);
    }
    if (this.aimScreen) {
      const aim = this.toWorld(this.aimScreen.x, this.aimScreen.y);
      g.lineStyle(1, 0xffffff, 0.5).lineBetween(hand.x, hand.y, aim.x, aim.y).strokeCircle(aim.x, aim.y, 4);
    }
  }

  // Trees first (spread out), then bushes and rocks in the gaps; the start area stays open.
  private placeObjects() {
    const area = { minX: 30, maxX: H.world.w - 30, minY: 60, maxY: H.world.h - 10 };
    const start = { x: this.player.pos.x, y: this.player.pos.y, r: 110 };
    const pick = seededRandom(MAP_SEED + 1);
    const treeSpots = scatter(MAP_SEED, area, 46, 78, [start]);
    const smallSpots = scatter(MAP_SEED + 2, area, 34, 60, [start, ...treeSpots.map((p) => ({ x: p.x, y: p.y, r: 46 }))]);
    const place = (pos: Vec, kind: ObjectKind) => {
      const { foot } = OBJECT_KINDS[kind];
      const sprite = this.add.image(pos.x, pos.y, `obj_${kind}`).setOrigin(0.5, 1).setDepth(pos.y);
      const rect = { x0: pos.x - foot.w / 2, x1: pos.x + foot.w / 2, y0: pos.y - foot.h, y1: pos.y };
      this.objects.push({ kind, sprite, foot: rect });
      this.obstacles.push(rect);
    };
    for (const p of treeSpots) place(p, TREES[Math.floor(pick() * TREES.length)]);
    for (const p of smallSpots) place(p, SMALL[Math.floor(pick() * SMALL.length)]);
  }

  // A canopy that hides the hunter (hunter behind and under it) turns see-through, MMORPG style.
  private fadeCanopies() {
    const p = this.player.pos;
    for (const o of this.objects) {
      if (!OBJECT_KINDS[o.kind].tree) continue;
      const b = o.sprite.getBounds();
      const hidden = p.y < o.sprite.y && p.x > b.left + 6 && p.x < b.right - 6 && p.y > b.top + 10;
      o.sprite.setAlpha(hidden ? 0.45 : 1);
    }
  }

  private liveBoar(id: number | null): Boar | undefined {
    return id === null ? undefined : this.boars.find((b) => b.id === id && !b.dead);
  }

  private hitStop(ms: number) {
    this.hitStopMs = Math.max(this.hitStopMs, ms);
    this.anims.pauseAll();
  }

  private popText(x: number, y: number, text: string, color: string, ms = 700) {
    const label = this.add.text(x, y, text, { fontFamily: "monospace", fontSize: "10px", color, stroke: "#000000", strokeThickness: 3 }).setOrigin(0.5).setDepth(9000);
    this.tweens.add({ targets: label, y: y - 14, alpha: 0, duration: ms, ease: "Cubic.easeOut", onComplete: () => label.destroy() });
  }

  private drawHud() {
    const p = this.player;
    this.hud.clear();
    this.hud.fillStyle(0x000000, 0.6).fillRect(8, 20, 122, 10);
    this.hud.fillStyle(0xe04040, 1).fillRect(9, 21, (120 * p.hp) / H.player.maxHp, 8);
    this.bagText.setText(t("hud.meat", this.bag));
  }

  // Back to the shop with the bag (half of it after a knockout); the day flow takes over.
  private endHunt(ko: boolean) {
    if (this.ended) return;
    this.ended = true;
    const result: HuntResult = { meat: ko ? koPenalty(this.bag) : { ...this.bag }, ko };
    this.game.events.emit("hunt:end", result);
    this.scene.pause();
  }
}
