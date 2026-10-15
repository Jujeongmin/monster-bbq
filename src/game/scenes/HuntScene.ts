import Phaser from "phaser";
import type { HuntEvent } from "../../../shared/actions";
import { BALANCE } from "../../../shared/balance";
import type { DishId } from "../../../shared/content/dishes";
import { itemKey, parseItemKey, type ItemId } from "../../../shared/content/items";
import { OBJECT_KINDS } from "../../../shared/content/objects";
import { addToBag, bagCount } from "../../../shared/hunt/bag";
import { computeHit, coneTargets, meatGrade, nextComboStep, recordHit, type WeaponKind } from "../../../shared/hunt/combat";
import { dropFor } from "../../../shared/hunt/drops";
import { clampToField, distance, moveByInput, pushOutOfRects, unit, type Rect } from "../../../shared/hunt/geometry";
import { fireHarpoon, harpoonDone, harpoonHit, reelStep, stepHarpoon, type Harpoon } from "../../../shared/hunt/harpoon";
import { HUNT_START, planHunt, type HuntPlan } from "../../../shared/hunt/plan";
import { shotHits, stepShot, type Shot } from "../../../shared/hunt/shooter";
import type { Vec } from "../../../shared/hunt/types";
import type { Zone } from "../../../shared/save";
import { itemName, t } from "../../i18n";
import { artUrl } from "../art";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { createCharacterAnims, loadCharacterArt, lookOf, stepBob } from "../hunt/anims";
import { angerFlock, CHAR_SCALE, createMob, dazeMob, drawMob, isMobVulnerable, mobFacing, mobPos, mobRadius, mobWasHit, setMobPos, stepMob, type Mob, type Spawn } from "../hunt/mobs";
import { joystickVector } from "../joystick";
import { addButton, addGauge, kitSlice, loadUiArt, TEXT, TEXT_SMALL, type UiGauge } from "../ui";

// The forest hunt (plan 03), quarter view, Dave-the-Diver controls.
// PC: WASD / arrows move, aim with the mouse, left click = harpoon, right click = slash, E = gather,
//     R = back to the shop (keyboard only: Z = slash, X = harpoon straight ahead).
// Touch: stick on the left; press on the right half to aim, release to fire; slash and gather buttons.
// The hunting ground comes from the server's seed (planHunt); the scene reports what was taken, in
// order, and the server decides the drops the same way (spec 7).
const H = BALANCE.hunt;
// A frame gap after the tab was hidden must not teleport anything (rules are also clamped).
const MAX_DT_MS = 50;
const HUNTER_FEET = 0.92;
const GATHER_RANGE = 26;
const GATHER_MS = 1000;
const REFILL_DELAY_MS = 2500;
// Touch controls, in screen pixels of the game, placed relative to its size.
const STICK = { x: GAME_WIDTH * 0.12, y: GAME_HEIGHT * 0.78, radius: 36, deadZone: 0.2 };
const SLASH_BTN = { x: GAME_WIDTH * 0.89, y: GAME_HEIGHT * 0.8, radius: 28 };
const GATHER_BTN = { x: GAME_WIDTH * 0.89, y: GAME_HEIGHT * 0.58, radius: 22 };

export interface HuntData {
  huntId: string;
  seed: number;
  zone: Zone;
  // from the upgrades (shared/growth): what the hunter hits for, how far the harpoon flies, how much
  // health, how big the bag
  stats: { meleeDamage: number; rangedDamage: number; rangedRange: number; maxHp: number };
  bagSlots: number;
  // dishes packed for this hunt and the health each gives back (its level price, shared/kitchen/dish): eat one
  // with its button (or keys 1-3)
  lunchbox: { dish: DishId; heal: number }[];
}

// What the hunt hands to the day flow when it ends (PhaserGame forwards the "hunt:end" event).
export interface HuntResult {
  events: HuntEvent[];
  ko: boolean;
}

interface Player {
  pos: Vec;
  // unit vector toward the aim (or the last move on touch)
  aim: Vec;
  // which way the hunter faces: the way it walks (Dave the Diver style), not the mouse; attacks turn it
  // toward the aim only while they play
  face: Vec;
  hp: number;
  cooldownMs: number;
  harpoonCooldownMs: number;
  swingMs: number;
  comboStep: number;
  msSinceSwing: number;
  down: boolean;
}

interface Node {
  node: HuntPlan["nodes"][number];
  sprite: Phaser.GameObjects.Image;
  taken: boolean;
}

type Keys = Record<"W" | "A" | "S" | "D" | "Z" | "J" | "X" | "K" | "R" | "E" | "ONE" | "TWO" | "THREE", Phaser.Input.Keyboard.Key>;

export class HuntScene extends Phaser.Scene {
  private huntData!: HuntData;
  private melee = H.weapons.melee;
  private ranged = H.weapons.ranged;
  private maxHp: number = H.player.maxHp;
  private bagSlots: number = H.bagSlots;
  private lunch: { dish: DishId; heal: number; button: Phaser.GameObjects.Container; eaten: boolean }[] = [];
  private speedUntil = 0;
  private plan!: HuntPlan;
  private player!: Player;
  private hunter!: Phaser.GameObjects.Sprite;
  private mobs: Mob[] = [];
  private refills: Spawn[] = [];
  private nextRefill = 0;
  private nodes: Node[] = [];
  private trees: { sprite: Phaser.GameObjects.Image }[] = [];
  private obstacles: Rect[] = [];
  private shots: { shot: Shot; sprite: Phaser.GameObjects.Image }[] = [];
  private bag: Record<string, number> = {};
  private report: HuntEvent[] = [];
  private harpoon: Harpoon | null = null;
  private reeling: Mob | null = null;
  private gathering: { node: Node; ms: number } | null = null;
  private slashArc: { at: Vec; aim: Vec; ms: number } | null = null;
  private hitStopMs = 0;
  private ended = false;
  private hpGauge!: UiGauge;
  private fx!: Phaser.GameObjects.Graphics;
  private bagText!: Phaser.GameObjects.Text;
  private gatherHint!: Phaser.GameObjects.Text;
  private returnButton!: Phaser.GameObjects.Container;
  private gatherButton: Phaser.GameObjects.Arc | null = null;
  private gatherButtonLabel: Phaser.GameObjects.Text | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Keys;
  private touch = false;
  private slashQueued = false;
  private gatherQueued = false;
  private shotQueued: Vec | null = null;
  private stickPointer: number | null = null;
  private stickVec: Vec = { x: 0, y: 0 };
  private stickKnob!: Phaser.GameObjects.Arc;
  private aimPointer: number | null = null;
  private aimScreen: Vec | null = null;

  constructor() {
    super("hunt");
  }

  // Runs on every start: one hunt, one seed.
  init(data: HuntData) {
    this.huntData = data;
    this.melee = { ...H.weapons.melee, damage: data.stats.meleeDamage };
    this.ranged = { ...H.weapons.ranged, damage: data.stats.rangedDamage, range: H.weapons.ranged.range * data.stats.rangedRange };
    this.maxHp = data.stats.maxHp;
    this.bagSlots = data.bagSlots;
    this.lunch = [];
    this.speedUntil = 0;
    this.plan = planHunt(data.seed, data.zone);
    this.player = { pos: { ...HUNT_START }, aim: { x: 1, y: 0 }, face: { x: 0, y: 1 }, hp: this.maxHp, cooldownMs: 0, harpoonCooldownMs: 0, swingMs: 0, comboStep: 0, msSinceSwing: Infinity, down: false };
    this.mobs = [];
    this.refills = this.plan.spawns.filter((s) => s.wave > 0);
    this.nextRefill = 0;
    this.nodes = [];
    this.trees = [];
    this.obstacles = [];
    this.shots = [];
    this.bag = {};
    this.report = [];
    this.harpoon = null;
    this.reeling = null;
    this.gathering = null;
    this.slashArc = null;
    this.hitStopMs = 0;
    this.ended = false;
    this.slashQueued = false;
    this.gatherQueued = false;
    this.shotQueued = null;
    this.stickPointer = null;
    this.stickVec = { x: 0, y: 0 };
    this.aimPointer = null;
    this.aimScreen = null;
  }

  preload() {
    this.load.image("grass", artUrl("test/bg/grass.png"));
    for (const k of Object.keys(OBJECT_KINDS)) this.load.image(`obj_${k}`, artUrl(`test/objects/${k}.png`));
    loadCharacterArt(this);
    loadUiArt(this);
    for (const id of new Set(this.huntData.lunchbox.map((l) => l.dish))) this.load.image(`dish_${id}`, artUrl(`test/dishes/${id}.png`));
    for (const id of ["shiitake", "wild_garlic", "perilla"]) this.load.image(`node_${id}`, artUrl(`test/items/node_${id}.png`));
    for (const id of ["boar_belly", "boar_neck", "boar_rib", "rabbit_leg", "honeycomb", "chicken_thigh", "chicken_breast", "shiitake", "wild_garlic", "perilla"])
      this.load.image(`icon_${id}`, artUrl(`test/items/icon_${id}.png`));
  }

  create() {
    this.add.tileSprite(0, 0, H.world.w, H.world.h, "grass").setOrigin(0).setDepth(-1000);
    for (const o of this.plan.objects) {
      const sprite = this.add.image(o.x, o.y, `obj_${o.kind}`).setOrigin(0.5, 1).setDepth(o.y);
      this.obstacles.push(o.foot);
      if (OBJECT_KINDS[o.kind].tree) this.trees.push({ sprite });
    }
    for (const n of this.plan.nodes) {
      this.nodes.push({ node: n, sprite: this.add.image(n.x, n.y, `node_${n.item}`).setOrigin(0.5, 0.85).setDepth(n.y - 1), taken: false });
    }
    createCharacterAnims(this);

    this.hunter = this.add.sprite(this.player.pos.x, this.player.pos.y, "hunter_down_1").setOrigin(0.5, HUNTER_FEET).setScale(CHAR_SCALE);
    this.fx = this.add.graphics().setDepth(5000);
    for (const s of this.plan.spawns.filter((s) => s.wave === 0)) this.mobs.push(createMob(this, s));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, H.world.w, H.world.h);
    cam.startFollow(this.hunter, true, 0.12, 0.12);

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys("W,A,S,D,Z,J,X,K,R,E,ONE,TWO,THREE") as Keys;

    // touch controls on touch devices (add ?touch to the URL to try them with a mouse)
    this.touch = this.sys.game.device.input.touch || new URLSearchParams(location.search).has("touch");
    if (this.touch) this.createTouchControls();
    else this.createMouseControls();

    const hudStyle = TEXT_SMALL;
    if (!this.touch) this.add.text(6, 4, t("hunt.help"), hudStyle).setScrollFactor(0).setDepth(10000);
    // health in a brass gauge, the bag count under it, the way home top right (UI kit A)
    this.hpGauge = addGauge(this, 40, 26);
    this.hpGauge.box.setScrollFactor(0).setDepth(10000);
    this.bagText = this.add.text(8, 40, "", hudStyle).setScrollFactor(0).setDepth(10000);
    this.gatherHint = this.add.text(0, 0, t("hunt.gather"), hudStyle).setOrigin(0.5).setDepth(9500).setVisible(false);
    const back = addButton(this, GAME_WIDTH - 36, 18, t("hunt.return"), () => this.endHunt(false), 56);
    this.returnButton = back.box.setScrollFactor(0).setDepth(10000);
    // the lunchbox: one button per packed dish under the way home (the dish at one game pixel per art pixel)
    this.huntData.lunchbox.forEach(({ dish, heal }, i) => {
      const bubble = kitSlice(this, 0, 0, "bubble_plain", 50, 48, 3, 3, 3, 3);
      const pic = this.add.image(1, -3, `dish_${dish}`);
      const key = this.add.text(18, 12, `${i + 1}`, TEXT_SMALL).setOrigin(0.5);
      const button = this.add.container(GAME_WIDTH - 28, 56 + i * 52, [bubble, pic, key]).setSize(50, 48).setScrollFactor(0).setDepth(10000);
      button.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.eat(i));
      this.lunch.push({ dish, heal, button, eaten: false });
    });
    // lunches already eaten on this hunt before a reload stay eaten
    for (const i of this.eatenBefore()) {
      const l = this.lunch[i];
      if (!l) continue;
      l.eaten = true;
      l.button.setAlpha(0.3).disableInteractive();
    }
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
    this.updateMobs(dt);
    this.updateShots(dt);
    this.fadeCanopies();
    this.drawFx(dt);
    this.drawHud();
  }

  // ---------------------------------------------------------------- input

  private createMouseControls() {
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.overHud(over)) return;
      if (p.rightButtonDown()) this.slashQueued = true;
      else this.shotQueued = this.toWorld(p.x, p.y);
    });
  }

  // Placeholder touch controls (UI art later). Left half: a stick. Right half: press on a spot to aim,
  // release to fire the harpoon there. Slash and gather buttons on the right.
  private createTouchControls() {
    this.input.addPointer(2);
    const ui = (o: Phaser.GameObjects.Arc) => o.setScrollFactor(0).setDepth(10000);
    const label = (b: { x: number; y: number }, text: string) =>
      this.add.text(b.x, b.y, text, TEXT_SMALL).setOrigin(0.5).setScrollFactor(0).setDepth(10001);
    ui(this.add.circle(STICK.x, STICK.y, STICK.radius, 0x000000, 0.35).setStrokeStyle(1, 0xffffff, 0.6));
    this.stickKnob = ui(this.add.circle(STICK.x, STICK.y, 14, 0xffffff, 0.6));
    const slash = ui(this.add.circle(SLASH_BTN.x, SLASH_BTN.y, SLASH_BTN.radius, 0xc03030, 0.6).setStrokeStyle(1, 0xffffff, 0.8));
    label(SLASH_BTN, "베기");
    slash.setInteractive(new Phaser.Geom.Circle(SLASH_BTN.radius, SLASH_BTN.radius, SLASH_BTN.radius + 6), Phaser.Geom.Circle.Contains);
    slash.on("pointerdown", () => (this.slashQueued = true));
    this.gatherButton = ui(this.add.circle(GATHER_BTN.x, GATHER_BTN.y, GATHER_BTN.radius, 0x30a050, 0.6).setStrokeStyle(1, 0xffffff, 0.8)).setVisible(false);
    this.gatherButtonLabel = label(GATHER_BTN, t("hunt.gatherButton")).setVisible(false);
    this.gatherButton.setInteractive(new Phaser.Geom.Circle(GATHER_BTN.radius, GATHER_BTN.radius, GATHER_BTN.radius + 6), Phaser.Geom.Circle.Contains);
    this.gatherButton.on("pointerdown", () => (this.gatherQueued = true));

    const onButton = (p: Phaser.Input.Pointer) =>
      [SLASH_BTN, ...(this.gatherButton?.visible ? [GATHER_BTN] : [])].some((b) => Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) <= b.radius + 6);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (onButton(p) || this.overHud(over)) return;
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

  // Keys and the stick add up; the rules cap the length at 1.
  private readMove(): Vec {
    const c = this.cursors;
    const k = this.keys;
    const x = (c.right.isDown || k.D.isDown ? 1 : 0) - (c.left.isDown || k.A.isDown ? 1 : 0) + this.stickVec.x;
    const y = (c.down.isDown || k.S.isDown ? 1 : 0) - (c.up.isDown || k.W.isDown ? 1 : 0) + this.stickVec.y;
    return { x: Phaser.Math.Clamp(x, -1, 1), y: Phaser.Math.Clamp(y, -1, 1) };
  }

  private toWorld(x: number, y: number): Vec {
    const w = this.cameras.main.getWorldPoint(x, y);
    return { x: w.x, y: w.y };
  }

  // ---------------------------------------------------------------- hunter

  private updatePlayer(dt: number) {
    const p = this.player;
    p.cooldownMs = Math.max(0, p.cooldownMs - dt);
    p.harpoonCooldownMs = Math.max(0, p.harpoonCooldownMs - dt);
    p.swingMs = Math.max(0, p.swingMs - dt);
    p.msSinceSwing += dt;

    const k = this.keys;
    const JD = Phaser.Input.Keyboard.JustDown;
    if (JD(k.R)) return this.endHunt(false);
    if (JD(k.Z) || JD(k.J)) this.slashQueued = true;
    if (JD(k.X) || JD(k.K)) this.shotQueued = { x: p.pos.x + p.aim.x * 100, y: p.pos.y + p.aim.y * 100 - H.harpoon.handHeight };
    if (JD(k.E)) this.gatherQueued = true;
    if (JD(k.ONE)) this.eat(0);
    if (JD(k.TWO)) this.eat(1);
    if (JD(k.THREE)) this.eat(2);

    // Dave-style: on PC the hunter always looks at the mouse
    if (!this.touch) {
      const aim = this.toWorld(this.input.activePointer.x, this.input.activePointer.y);
      p.aim = unit({ x: aim.x - p.pos.x, y: aim.y - (p.pos.y - H.harpoon.handHeight) }, p.aim);
    }

    const near = this.nearestNode();
    this.gatherHint.setVisible(!!near && !this.gathering && !this.touch);
    if (near) this.gatherHint.setPosition(near.node.x, near.node.y - 34);
    this.gatherButton?.setVisible(!!near);
    this.gatherButtonLabel?.setVisible(!!near);

    // a swing finishes before the hunter moves or swings again
    if (p.swingMs > 0) return;
    // a slash pressed during the cooldown is buffered and comes out as soon as it can
    if (this.slashQueued && p.cooldownMs === 0) {
      this.slashQueued = false;
      this.gathering = null;
      this.slash();
      return;
    }
    if (this.shotQueued) {
      const at = this.shotQueued;
      this.shotQueued = null;
      if (p.harpoonCooldownMs === 0 && !this.harpoon && !this.reeling) {
        this.gathering = null;
        this.throwHarpoon(at);
        return;
      }
    }
    if (this.gatherQueued) {
      this.gatherQueued = false;
      if (near && !this.gathering) this.gathering = { node: near, ms: 0 };
    }

    const move = this.readMove();
    const moving = move.x !== 0 || move.y !== 0;
    if (moving) {
      this.gathering = null;
      const speed = H.player.speed * (this.time.now < this.speedUntil ? BALANCE.lunch.speedMul : 1);
      const next = moveByInput(p.pos, move, speed, dt, H.field, H.player.depthSpeedRatio);
      p.pos = clampToField(pushOutOfRects(next, this.obstacles, H.player.radius), H.field);
      if (this.touch && this.aimPointer === null) p.aim = unit(move, p.aim);
      p.face = unit(move, p.face);
    }
    if (this.gathering) this.stepGather(dt);
    this.showHunter(moving);
  }

  // Walk cycle the way the hunter walks (down, up or sideways); standing still keeps the last way and
  // shows its first frame.
  private showHunter(moving: boolean) {
    const p = this.player;
    const look = lookOf(p.face);
    this.hunter.setFlipX(look === "side" && p.face.x < 0);
    if (moving) {
      const key = `hunter_walk_${look}`;
      if (this.hunter.anims.currentAnim?.key !== key || !this.hunter.anims.isPlaying) this.hunter.play(key);
    } else {
      this.hunter.anims.stop();
      this.hunter.setTexture(`hunter_${look}_1`);
    }
    // drawn in front of anything standing exactly level with the hunter
    this.hunter.setPosition(p.pos.x, p.pos.y + (moving ? stepBob(this.hunter) : 0)).setDepth(p.pos.y + 0.5);
  }

  // Which lunches were eaten, kept per hunt in the page's session storage (the box itself only empties
  // when the hunt is settled, so a reload must not serve them again).
  private eatenKey() {
    return `monster-bbq:lunch:${this.huntData.huntId}`;
  }
  private eatenBefore(): number[] {
    try {
      const v = JSON.parse(sessionStorage.getItem(this.eatenKey()) ?? "[]");
      return Array.isArray(v) ? v.filter((n) => Number.isInteger(n)) : [];
    } catch {
      return [];
    }
  }
  private rememberEaten() {
    try {
      sessionStorage.setItem(this.eatenKey(), JSON.stringify(this.lunch.flatMap((l, i) => (l.eaten ? [i] : []))));
    } catch {
      // private mode: a reload may offer the lunch again, nothing worse
    }
  }

  // A press on the HUD (the way home, a lunch) is not a shot or a slash.
  private overHud(over: Phaser.GameObjects.GameObject[]) {
    return over.includes(this.returnButton) || this.lunch.some((l) => over.includes(l.button));
  }

  // Lunch from the box: health back by the dish's worth, and a quick step for a few dishes.
  private eat(i: number) {
    const l = this.lunch[i];
    const p = this.player;
    if (!l || l.eaten || p.down || this.ended) return;
    l.eaten = true;
    l.button.setAlpha(0.3).disableInteractive();
    this.rememberEaten();
    const heal = l.heal;
    p.hp = Math.min(this.maxHp, p.hp + heal);
    this.popText(p.pos.x, p.pos.y - 32, `+${heal}`, "#7fe07f");
    if (BALANCE.lunch.speedDishes.includes(l.dish)) {
      this.speedUntil = this.time.now + BALANCE.lunch.speedMs;
      this.popText(p.pos.x, p.pos.y - 44, t("hunt.speedUp"), "#ffd166", 1200);
    }
  }

  private hand(): Vec {
    return { x: this.player.pos.x, y: this.player.pos.y - H.harpoon.handHeight };
  }

  private hurtPlayer(damage: number, dir: Vec) {
    const p = this.player;
    if (p.down) return;
    p.hp = Math.max(0, p.hp - damage);
    p.pos = clampToField(pushOutOfRects({ x: p.pos.x + dir.x * 24, y: p.pos.y + dir.y * 24 }, this.obstacles, H.player.radius), H.field);
    p.swingMs = 0;
    this.gathering = null;
    this.hunter.setPosition(p.pos.x, p.pos.y).setTint(0xff8080);
    this.time.delayedCall(150, () => this.hunter.clearTint());
    this.cameras.main.shake(100, 0.01);
    this.popText(p.pos.x, p.pos.y - 32, `-${damage}`, "#ff6060");
    if (p.hp === 0) {
      p.down = true;
      this.harpoon = null;
      this.reeling = null;
      this.hunter.anims.stop();
      this.hunter.setTint(0x777777).setAngle(-90);
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, t("hunt.ko"), { ...TEXT, fontStyle: "bold" })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(10001);
      this.time.delayedCall(1500, () => this.endHunt(true));
    }
  }

  // ---------------------------------------------------------------- gathering

  private nearestNode(): Node | null {
    let best: Node | null = null;
    let bestD = GATHER_RANGE;
    for (const n of this.nodes) {
      if (n.taken) continue;
      const d = distance(this.player.pos, n.node);
      if (d <= bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  private stepGather(dt: number) {
    const g = this.gathering!;
    g.ms += dt;
    if (g.ms < GATHER_MS) return;
    this.gathering = null;
    const key = itemKey(g.node.node.item);
    const r = addToBag(this.bag, key, this.bagSlots);
    if (!r.added) {
      this.popText(this.player.pos.x, this.player.pos.y - 42, t("hunt.bagFull"), "#ffb0b0", 1200);
      return;
    }
    this.bag = r.bag;
    g.node.taken = true;
    this.report.push({ gather: g.node.node.id });
    this.tweens.add({ targets: g.node.sprite, alpha: 0, y: g.node.sprite.y - 6, duration: 300, onComplete: () => g.node.sprite.destroy() });
    this.popItem(g.node.node.x, g.node.node.y - 30, key);
  }

  // ---------------------------------------------------------------- harpoon and slash

  private throwHarpoon(at: Vec) {
    const p = this.player;
    p.aim = unit({ x: at.x - p.pos.x, y: at.y - this.hand().y }, p.aim);
    p.harpoonCooldownMs = this.ranged.cooldownMs;
    p.swingMs = this.ranged.swingMs;
    this.hunter.setFlipX(p.aim.x < 0).play("hunter_throw");
    this.harpoon = fireHarpoon(this.hand(), at, p.aim.x < 0 ? -1 : 1);
  }

  private updateHarpoon(dt: number) {
    if (this.harpoon) {
      const h = stepHarpoon(this.harpoon, H.harpoon.speed, dt);
      const live = this.mobs.filter((m) => !m.dead).map((m) => ({ pos: mobPos(m), mob: m }));
      const struck = harpoonHit(h.tip, live, H.harpoon.bodyOffsetY, H.harpoon.hitRadius)?.mob;
      if (struck) {
        this.harpoon = null;
        this.harpoonStrike(struck);
      } else this.harpoon = harpoonDone(h, this.ranged.range) ? null : h;
    }
    const m = this.reeling;
    if (!m) return;
    if (m.dead || this.player.down) {
      this.reeling = null;
      return;
    }
    const r = reelStep(mobPos(m), this.player.pos, H.harpoon.pullSpeed, dt, H.harpoon.pullStopDist, H.field);
    setMobPos(m, r.pos);
    if (r.done) {
      this.reeling = null;
      // reeled in and dazed for dazeMs: open for counters
      dazeMob(m, unit({ x: this.player.pos.x - r.pos.x, y: this.player.pos.y - r.pos.y }));
      drawMob(this, m, true, (x, y, s, c, ms) => this.popText(x, y, s, c, ms));
      this.popText(r.pos.x, r.pos.y - 36, t("hunt.chance"), "#7fe0ff", 600);
    }
  }

  private harpoonStrike(m: Mob) {
    const p = this.player;
    const hit = computeHit({ weapon: this.ranged, comboStep: 1, targetVulnerable: isMobVulnerable(m), attackerPos: p.pos, targetPos: mobPos(m), targetFacing: mobFacing(m) }, H.hit);
    this.applyHit(m, "ranged", hit.damage, [hit.counter && "카운터!", hit.backAttack && "백어택!"]);
    this.hitStop(H.hitStopMs);
    if (!m.dead) {
      this.reeling = m;
      this.tweens.killTweensOf(m.sprite);
      m.sprite.setAlpha(1).clearTint();
      m.sprite.anims.stop();
    }
  }

  private slash() {
    const p = this.player;
    const weapon = this.melee;
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
    if (p.down || this.ended) return;
    const live = this.mobs.filter((m) => !m.dead && m !== this.reeling).map((m) => ({ pos: mobPos(m), mob: m }));
    const struck = coneTargets(p.pos, aim, live, this.melee.range, H.slashHalfAngle).map((x) => x.mob);
    this.slashArc = { at: p.pos, aim, ms: 120 };
    if (struck.length === 0) return;
    let big = false;
    for (const m of struck) {
      const hit = computeHit({ weapon: this.melee, comboStep, targetVulnerable: isMobVulnerable(m), attackerPos: p.pos, targetPos: mobPos(m), targetFacing: mobFacing(m) }, H.hit);
      big ||= hit.finisher || hit.counter;
      const at = mobPos(m);
      const away = unit({ x: at.x - p.pos.x, y: at.y - p.pos.y }, aim);
      setMobPos(m, clampToField(pushOutOfRects({ x: at.x + away.x * hit.knockback, y: at.y + away.y * hit.knockback }, this.obstacles, mobRadius(m)), H.field));
      this.applyHit(m, "melee", hit.damage, [hit.counter && "카운터!", hit.backAttack && "백어택!", hit.finisher && "막타!"]);
    }
    // game feel: one freeze per swing, longer and with a shake on big hits
    this.hitStop(big ? H.hitStopMs * 2 : H.hitStopMs);
    if (big) this.cameras.main.shake(120, 0.012);
  }

  private applyHit(m: Mob, kind: WeaponKind, damage: number, tagList: (string | false)[]) {
    m.hp -= damage;
    m.hits = recordHit(m.hits, kind);
    mobWasHit(m);
    if (m.spawn.flock) angerFlock(this.mobs, m.spawn.flock);
    m.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => m.sprite.active && m.sprite.clearTint());
    const tags = tagList.filter(Boolean).join(" ");
    const at = mobPos(m);
    this.popText(at.x, at.y - 30, `${damage}${tags ? " " + tags : ""}`, tags ? "#ffd166" : "#ffffff");
    if (m.hp <= 0) this.killMob(m);
  }

  // The part goes into the bag (the server decides the same drop from the seed); the kill is
  // reported either way, and a refill comes in shortly after.
  private killMob(m: Mob) {
    m.dead = true;
    if (this.reeling === m) this.reeling = null;
    const grade = meatGrade(m.hits, H.premiumMaxRangedHits);
    const key = itemKey(dropFor(this.huntData.seed, m.spawn), grade);
    this.report.push({ kill: m.spawn.id, grade });
    const r = addToBag(this.bag, key, this.bagSlots);
    const at = mobPos(m);
    if (r.added) {
      this.bag = r.bag;
      this.popItem(at.x, at.y - 38, key);
    } else this.popText(at.x, at.y - 38, t("hunt.bagFull"), "#ffb0b0", 1200);
    this.tweens.killTweensOf(m.sprite);
    m.sprite.setAlpha(1).clearTint();
    this.tweens.add({
      targets: m.sprite,
      alpha: 0,
      duration: 500,
      onComplete: () => {
        m.sprite.destroy();
        this.mobs = this.mobs.filter((x) => x !== m);
      },
    });
    const refill = this.refills[this.nextRefill++];
    if (refill) this.time.delayedCall(REFILL_DELAY_MS, () => !this.ended && this.mobs.push(createMob(this, refill)));
  }

  // ---------------------------------------------------------------- monsters and stingers

  private updateMobs(dt: number) {
    const seen = this.player.down ? null : this.player.pos;
    for (const m of this.mobs) {
      if (m.dead || m === this.reeling) continue;
      const step = stepMob(m, dt, seen, H.field, this.obstacles);
      if (step.hurt) this.hurtPlayer(step.hurt.damage, step.hurt.dir);
      if (step.shot) this.shots.push({ shot: step.shot, sprite: this.add.image(step.shot.pos.x, step.shot.pos.y, "bee_stinger").setDepth(9000).setRotation(Math.atan2(step.shot.dir.y, step.shot.dir.x)) });
      drawMob(this, m, step.phaseChanged, (x, y, s, c, ms) => this.popText(x, y, s, c, ms));
    }
  }

  private updateShots(dt: number) {
    const target = { x: this.player.pos.x, y: this.player.pos.y - 10 };
    this.shots = this.shots.filter((s) => {
      const next = stepShot(s.shot, dt);
      if (next && !this.player.down && shotHits(next, target, H.bee.shotRadius)) {
        this.hurtPlayer(H.bee.shotDamage, next.dir);
        s.sprite.destroy();
        return false;
      }
      if (!next) {
        s.sprite.destroy();
        return false;
      }
      s.shot = next;
      s.sprite.setPosition(next.pos.x, next.pos.y);
      return true;
    });
  }

  // ---------------------------------------------------------------- drawing

  // World-space effects drawn on top: charge lanes, aim lines, slash arc, rope, gathering bar.
  private drawFx(dt: number) {
    const g = this.fx;
    g.clear();
    for (const m of this.mobs) {
      if (m.dead) continue;
      if (m.ai.kind === "charger" && m.ai.s.phase === "telegraph") this.drawLane(g, mobPos(m), m.ai.s.chargeDir, H.boar.chargeSpeed * (H.boar.chargeMs / 1000), H.boar.hitRadius);
      if (m.ai.kind === "shooter" && m.ai.s.phase === "aim") this.drawLane(g, { x: mobPos(m).x, y: mobPos(m).y - 10 }, m.ai.s.aimDir, H.bee.shotSpeed * (H.bee.shotLifeMs / 1000), 4);
    }
    if (this.slashArc) {
      const { at, aim } = this.slashArc;
      const a = Math.atan2(aim.y, aim.x);
      g.lineStyle(2, 0xffffff, 0.8).beginPath().arc(at.x, at.y - 7, this.melee.range * 0.8, a - H.slashHalfAngle, a + H.slashHalfAngle).strokePath();
      this.slashArc.ms -= dt;
      if (this.slashArc.ms <= 0) this.slashArc = null;
    }
    if (this.gathering) {
      const n = this.gathering.node.node;
      g.fillStyle(0x000000, 0.7).fillRect(n.x - 14, n.y - 40, 28, 5);
      g.fillStyle(0x7fe07f, 1).fillRect(n.x - 13, n.y - 39, 26 * Math.min(1, this.gathering.ms / GATHER_MS), 3);
    }
    if (this.player.down) return;
    const hand = this.hand();
    let end: Vec | null = this.harpoon ? this.harpoon.tip : null;
    if (this.reeling && !this.reeling.dead) end = { x: mobPos(this.reeling).x, y: mobPos(this.reeling).y - H.harpoon.bodyOffsetY };
    if (end) {
      g.lineStyle(1, 0xe8d8b0, 1).lineBetween(hand.x, hand.y, end.x, end.y);
      g.fillStyle(0xcfd8e0, 1).fillCircle(end.x, end.y, 1.5);
    }
    if (this.aimScreen) {
      const aim = this.toWorld(this.aimScreen.x, this.aimScreen.y);
      g.lineStyle(1, 0xffffff, 0.5).lineBetween(hand.x, hand.y, aim.x, aim.y).strokeCircle(aim.x, aim.y, 4);
    }
  }

  // Where an attack will go: translucent red turns brown on the green grass, so a dark lane, solid red
  // edges and marching red chevrons pointing the way.
  private drawLane(g: Phaser.GameObjects.Graphics, from: Vec, d: Vec, len: number, half: number) {
    const n = { x: -d.y * half, y: d.x * half };
    const to = { x: from.x + d.x * len, y: from.y + d.y * len };
    g.fillStyle(0x400000, 0.35).fillPoints(
      [
        { x: from.x + n.x, y: from.y + n.y },
        { x: to.x + n.x, y: to.y + n.y },
        { x: to.x - n.x, y: to.y - n.y },
        { x: from.x - n.x, y: from.y - n.y },
      ],
      true,
    );
    g.lineStyle(1, 0xff3030, 1).lineBetween(from.x + n.x, from.y + n.y, to.x + n.x, to.y + n.y).lineBetween(from.x - n.x, from.y - n.y, to.x - n.x, to.y - n.y);
    const march = (this.time.now / 8) % 16;
    const arm = Math.max(half * 0.5, 3);
    g.lineStyle(2, 0xff2020, 1);
    for (let s = march; s < len - 6; s += 16) {
      const tip = { x: from.x + d.x * (s + 6), y: from.y + d.y * (s + 6) };
      const back = { x: from.x + d.x * s, y: from.y + d.y * s };
      const k = arm / half;
      g.lineBetween(back.x + n.x * k, back.y + n.y * k, tip.x, tip.y).lineBetween(back.x - n.x * k, back.y - n.y * k, tip.x, tip.y);
    }
  }

  // A canopy that hides the hunter (hunter behind and under it) turns see-through, MMORPG style.
  private fadeCanopies() {
    const p = this.player.pos;
    for (const { sprite } of this.trees) {
      const b = sprite.getBounds();
      const hidden = p.y < sprite.y && p.x > b.left + 6 && p.x < b.right - 6 && p.y > b.top + 10;
      sprite.setAlpha(hidden ? 0.45 : 1);
    }
  }

  private hitStop(ms: number) {
    this.hitStopMs = Math.max(this.hitStopMs, ms);
    this.anims.pauseAll();
  }

  private popText(x: number, y: number, text: string, color: string, ms = 700) {
    const label = this.add.text(x, y, text, { ...TEXT_SMALL, color }).setOrigin(0.5).setDepth(9000);
    this.tweens.add({ targets: label, y: y - 14, alpha: 0, duration: ms, ease: "Cubic.easeOut", onComplete: () => label.destroy() });
  }

  // An item flying up with its icon and name (and grade for parts).
  private popItem(x: number, y: number, key: string) {
    const item = parseItemKey(key);
    if (!item) return;
    const name = itemName(key);
    const color = item.grade === "premium" ? "#ffd166" : "#ffffff";
    const icon = this.add.image(x - 2, y, `icon_${item.id as ItemId}`).setOrigin(1, 0.5).setDepth(9001);
    const label = this.add.text(x, y, name, { ...TEXT_SMALL, color }).setOrigin(0, 0.5).setDepth(9001);
    this.tweens.add({ targets: [icon, label], y: y - 16, alpha: 0, delay: 500, duration: 900, ease: "Cubic.easeOut", onComplete: () => (icon.destroy(), label.destroy()) });
  }

  private drawHud() {
    const p = this.player;
    this.hpGauge.set(p.hp / this.maxHp);
    this.bagText.setText(t("hud.bag", { n: bagCount(this.bag), max: this.bagSlots }));
  }

  // Back to the shop: the report goes to the day flow (half the bag is lost after a knockout, the
  // server applies that too).
  private endHunt(ko: boolean) {
    if (this.ended) return;
    this.ended = true;
    const result: HuntResult = { events: [...this.report], ko };
    this.game.events.emit("hunt:end", result);
    this.scene.pause();
  }
}
