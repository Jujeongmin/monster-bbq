import Phaser from "phaser";
import type { HuntEvent } from "../../../shared/actions";
import { BALANCE } from "../../../shared/balance";
import type { DishId } from "../../../shared/content/dishes";
import { itemKey, parseItemKey, type ItemId } from "../../../shared/content/items";
import { OBJECT_KINDS } from "../../../shared/content/objects";
import { addToBag, bagCount } from "../../../shared/hunt/bag";
import { computeHit, coneTargets, nextComboStep, recordHit, type WeaponKind } from "../../../shared/hunt/combat";
import { MONSTERS } from "../../../shared/content/monsters";
import type { SideWeaponId } from "../../../shared/content/sideWeapons";
import { startCapture, stepCapture, tapCapture, type Capture } from "../../../shared/hunt/capture";
import { bind, dart, stun } from "../../../shared/hunt/status";
import { starsOf, takeYield, type TakeHow } from "../../../shared/hunt/stars";
import { mashTusk } from "../../../shared/hunt/tusk";
import { flipShell, shellDamageMul } from "../../../shared/hunt/deepMonsters";
import { dropFor } from "../../../shared/hunt/drops";
import { clampToField, distance, moveByInput, pushOutOfRects, unit, type Rect } from "../../../shared/hunt/geometry";
import { fireHarpoon, harpoonDone, harpoonHit, reelStep, stepHarpoon, type Harpoon } from "../../../shared/hunt/harpoon";
import { planFloor, type FloorPlan } from "../../../shared/hunt/plan";
import { drainStamina, LOW_STAMINA } from "../../../shared/hunt/stamina";
import { shotHits, stepShot, type Shot } from "../../../shared/hunt/shooter";
import type { Vec } from "../../../shared/hunt/types";
import type { Zone } from "../../../shared/save";
import { FLOORS, isFloorId, nearestExit, type FloorDef, type FloorId, type Period } from "../../../shared/content/floors";
import { itemName, t, type StringKey } from "../../i18n";
import { artUrl, hasArt } from "../art";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { createCharacterAnims, loadCharacterArt, lookOf, stepBob } from "../hunt/anims";
import { angerFlock, CHAR_SCALE, createMob, drawMob, isMobVulnerable, isTargetable, mobFacing, mobPos, mobRadius, mobWasHit, setMobPos, stepMob, type Mob, type Spawn } from "../hunt/mobs";
import { fleerHit } from "../../../shared/hunt/fleer";
import { joystickVector } from "../joystick";
import { addButton, addGauge, KIT, kitSlice, loadUiArt, TEXT, TEXT_SMALL, type UiButton, type UiGauge } from "../ui";

// The forest hunt (plan 03, hunt v3), quarter view, Dave-the-Diver controls.
// PC: WASD / arrows move, aim with the mouse, left click = harpoon (and mash while capturing), right click
//     = the side weapon, Space = slash (and mash), E = gather, bag a sleeper, go down, or leave by one of
//     Bandal's carts, Esc = pause (keyboard only: Z = slash, X = harpoon, C = side weapon straight ahead).
// Touch: stick on the left; press on the right half to aim, release to fire; slash, side weapon and use
//     buttons; while capturing or pinned, a tap anywhere mashes.
// Each floor comes from the server's seed (planFloor); the scene reports what was taken, in
// order, and the server decides the drops the same way (spec 7).
const H = BALANCE.hunt;
// A frame gap after the tab was hidden must not teleport anything (rules are also clamped).
const MAX_DT_MS = 50;
const HUNTER_FEET = 0.92;
const GATHER_RANGE = 26;
// how close the hunter must stand to a cart or the way down to use it with E
const USE_RANGE = 28;
// the round stamina gauge: its centre and radius in game pixels (40 art pixels across, drawn KIT times bigger)
const RING = { x: 50, y: 48, r: 40 };
const GATHER_MS = 1000;
const REFILL_DELAY_MS = 2500;
// Touch controls, in screen pixels of the game, placed relative to its size.
const STICK = { x: GAME_WIDTH * 0.12, y: GAME_HEIGHT * 0.78, radius: 36, deadZone: 0.2 };
const SLASH_BTN = { x: GAME_WIDTH * 0.89, y: GAME_HEIGHT * 0.8, radius: 28 };
const GATHER_BTN = { x: GAME_WIDTH * 0.89, y: GAME_HEIGHT * 0.58, radius: 22 };
const SIDE_BTN = { x: GAME_WIDTH * 0.76, y: GAME_HEIGHT * 0.86, radius: 22 };
// a mash every this often while auto-mash is on (pause menu)
// the deep floors' ground tiles (art/test/bg/<ground>.png), loaded only on their own floor
const DEEP_GROUNDS = ["swamp", "cave"] as const;
const AUTO_MASH_MS = 120;
const AUTO_MASH_KEY = "monster-bbq:autoMash";
// a missed harpoon reels back this long before it can fly again (hunt v3 design 4.2)
const MISS_REEL_MS = 600;

export interface HuntData {
  huntId: string;
  seed: number;
  zone: Zone;
  // the morning or the afternoon hunt (hunt v3 design 3): each brings its own monsters
  period: Period;
  // from the upgrades (shared/growth): what the hunter hits for, how far the harpoon flies, how much
  // health, how big the bag
  // damageTaken: the apron armour's share of each hit that gets through (save v7)
  stats: { meleeDamage: number; rangedDamage: number; rangedRange: number; maxHp: number; damageTaken: number };
  // the gear that opens the deep floors (hunt v3 design 4.6): boots for the swamp, the lantern's light
  // radius in the cave (0 without one)
  gear: { boots: boolean; light: number };
  bagSlots: number;
  // dishes packed for this hunt and the health each gives back (its level price, shared/kitchen/dish): eat one
  // with its button (or keys 1-3)
  lunchbox: { dish: DishId; heal: number }[];
  // the side weapon taken out, its shots for the whole hunt, the harpoon's level (capture taps) and how
  // fast this sleep dart works (shared/growth)
  side: SideWeaponId;
  ammo: number;
  harpoonLevel: number;
  sleepFallMs: number;
  // set by the scene itself when it restarts on the next floor
  run?: Run;
}

// What carries over from floor to floor within one hunt (hunt v3 design 3): the scene restarts on each
// way down with the same Run.
interface Run {
  floor: FloorId;
  stamina: number;
  bag: Record<string, number>;
  report: HuntEvent[];
  eaten: boolean[];
  // side weapon shots left (one supply for the whole hunt)
  ammo: number;
}

// What the hunt hands to the day flow when it ends (PhaserGame forwards the "hunt:end" event): what was
// taken in order, the exit it left by (null when knocked out).
export interface HuntResult {
  events: HuntEvent[];
  exit: string | null;
  ko: boolean;
}

interface Player {
  pos: Vec;
  // unit vector toward the aim (or the last move on touch)
  aim: Vec;
  // which way the hunter faces: the way it walks (Dave the Diver style), not the mouse; attacks turn it
  // toward the aim only while they play
  face: Vec;
  cooldownMs: number;
  harpoonCooldownMs: number;
  swingMs: number;
  comboStep: number;
  msSinceSwing: number;
  down: boolean;
}

interface Node {
  node: FloorPlan["nodes"][number];
  sprite: Phaser.GameObjects.Image;
  taken: boolean;
}

type Keys = Record<"W" | "A" | "S" | "D" | "Z" | "J" | "X" | "K" | "C" | "E" | "SPACE" | "ESC" | "ONE" | "TWO" | "THREE", Phaser.Input.Keyboard.Key>;

// a side weapon shot in flight: pebble, dart or net (straight, like the harpoon), or a thrown firecracker
interface Dart {
  kind: SideWeaponId;
  h: Harpoon;
  sprite: Phaser.GameObjects.Image;
}
interface Bomb {
  at: Vec;
  ms: number;
  sprite: Phaser.GameObjects.Image;
}

export class HuntScene extends Phaser.Scene {
  private huntData!: HuntData;
  private melee = H.weapons.melee;
  private ranged = H.weapons.ranged;
  // stamina's top (the armour upgrade's health table until the stamina tank, stage 3)
  private maxStamina: number = H.player.maxHp;
  private run!: Run;
  private bagSlots: number = H.bagSlots;
  private lunch: { dish: DishId; heal: number; button: Phaser.GameObjects.Container; eaten: boolean }[] = [];
  private speedUntil = 0;
  private plan!: FloorPlan;
  private floorDef!: FloorDef;
  private player!: Player;
  private hunter!: Phaser.GameObjects.Sprite;
  private mobs: Mob[] = [];
  private refills: Spawn[] = [];
  private nextRefill = 0;
  private nodes: Node[] = [];
  private trees: { sprite: Phaser.GameObjects.Image }[] = [];
  private obstacles: Rect[] = [];
  private shots: { shot: Shot; sprite: Phaser.GameObjects.Image }[] = [];
  private harpoon: Harpoon | null = null;
  private reeling: Mob | null = null;
  private gathering: { node: Node; ms: number } | null = null;
  private slashArc: { at: Vec; aim: Vec; ms: number } | null = null;
  private hitStopMs = 0;
  private ended = false;
  // the round stamina gauge (Dave the Diver's oxygen, art approved 2026-10-15): the full ring shows only
  // over the share that is left, through a pie mask; the face tires when stamina runs low
  private ringMask!: Phaser.GameObjects.Graphics;
  private face!: Phaser.GameObjects.Image;
  private shownStamina = -1;
  private fx!: Phaser.GameObjects.Graphics;
  private bagText!: Phaser.GameObjects.Text;
  private gatherHint!: Phaser.GameObjects.Text;
  private staminaText!: Phaser.GameObjects.Text;
  private exitArrow!: Phaser.GameObjects.Text;
  private lowGlow!: Phaser.GameObjects.Rectangle;
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
  private sideQueued: Vec | null = null;
  private mashQueued = false;
  // reeled in and struggling on the capture gauge
  private capturing: { mob: Mob; c: Capture; gauge: UiGauge } | null = null;
  // pinned by the tusk boss: mash to break free
  private pinned: Mob | null = null;
  private darts: Dart[] = [];
  private bombs: Bomb[] = [];
  private missReel: { from: Vec; ms: number } | null = null;
  private autoMash = false;
  private autoMashMs = 0;
  private paused = false;
  private pauseMenu: Phaser.GameObjects.Container | null = null;
  private ammoText!: Phaser.GameObjects.Text;
  private bossBar: UiGauge | null = null;
  private bossSeen = false;
  // what a side weapon has done to each monster, shown above its head (Zzz, z, @@, #)
  private statusLabels = new Map<Mob, Phaser.GameObjects.Text>();
  private slamRing: { at: Vec; ms: number } | null = null;
  // the cave's dark with the lantern's hole around the hunter
  private dark: Phaser.GameObjects.RenderTexture | null = null;

  constructor() {
    super("hunt");
  }

  // Runs on every start: one hunt, one seed.
  init(data: HuntData) {
    this.huntData = data;
    this.melee = { ...H.weapons.melee, damage: data.stats.meleeDamage };
    this.ranged = { ...H.weapons.ranged, damage: data.stats.rangedDamage, range: H.weapons.ranged.range * data.stats.rangedRange };
    this.maxStamina = data.stats.maxHp;
    this.run = data.run ?? { floor: 1, stamina: data.stats.maxHp, bag: {}, report: [], eaten: data.lunchbox.map(() => false), ammo: data.ammo };
    this.bagSlots = data.bagSlots;
    this.lunch = [];
    this.speedUntil = 0;
    this.floorDef = FLOORS[this.run.floor];
    this.plan = planFloor(data.seed, this.run.floor, data.period);
    this.player = { pos: { ...this.floorDef.start }, aim: { x: 1, y: 0 }, face: { x: 0, y: 1 }, cooldownMs: 0, harpoonCooldownMs: 0, swingMs: 0, comboStep: 0, msSinceSwing: Infinity, down: false };
    this.mobs = [];
    this.refills = this.plan.spawns.filter((s) => s.wave > 0);
    this.nextRefill = 0;
    this.nodes = [];
    this.trees = [];
    this.obstacles = [];
    this.shots = [];
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
    this.sideQueued = null;
    this.mashQueued = false;
    this.capturing = null;
    this.pinned = null;
    this.darts = [];
    this.bombs = [];
    this.missReel = null;
    this.autoMashMs = 0;
    this.paused = false;
    this.pauseMenu = null;
    this.bossBar = null;
    this.bossSeen = false;
    this.statusLabels = new Map();
    this.slamRing = null;
    this.dark = null;
    try {
      this.autoMash = localStorage.getItem(AUTO_MASH_KEY) === "1";
    } catch {
      this.autoMash = false;
    }
  }

  preload() {
    this.load.image("grass", artUrl("test/bg/grass.png"));
    for (const g of DEEP_GROUNDS) if (this.floorDef.ground === g && hasArt(`test/bg/${g}.png`)) this.load.image(g, artUrl(`test/bg/${g}.png`));
    for (const k of Object.keys(OBJECT_KINDS)) this.load.image(`obj_${k}`, artUrl(`test/objects/${k}.png`));
    for (const k of ["ring_empty", "ring_full", "face_fine", "face_tired"]) this.load.image(`stamina_${k}`, artUrl(`test/ui/stamina/${k}.png`));
    this.load.image(`side_${this.huntData.side}`, artUrl(`test/ui/side/${this.huntData.side}.png`));
    this.load.image("exit", artUrl("test/hunt/exit.png"));
    this.load.image("stairs", artUrl("test/hunt/stairs.png"));
    loadCharacterArt(this);
    loadUiArt(this);
    for (const id of new Set(this.huntData.lunchbox.map((l) => l.dish))) this.load.image(`dish_${id}`, artUrl(`test/dishes/${id}.png`));
    for (const id of ["shiitake", "wild_garlic", "perilla"]) this.load.image(`node_${id}`, artUrl(`test/items/node_${id}.png`));
    for (const id of ["boar_belly", "boar_neck", "boar_rib", "rabbit_leg", "honeycomb", "chicken_thigh", "chicken_breast", "shiitake", "wild_garlic", "perilla"])
      this.load.image(`icon_${id}`, artUrl(`test/items/icon_${id}.png`));
  }

  create() {
    this.add.tileSprite(0, 0, this.floorDef.world.w, this.floorDef.world.h, this.textures.exists(this.floorDef.ground) ? this.floorDef.ground : "grass").setOrigin(0).setDepth(-1000);
    if (this.floorDef.ground === "cave") this.makeDark();
    for (const o of this.plan.objects) {
      const sprite = this.add.image(o.x, o.y, `obj_${o.kind}`).setOrigin(0.5, 1).setDepth(o.y);
      this.obstacles.push(o.foot);
      if (OBJECT_KINDS[o.kind].tree) this.trees.push({ sprite });
    }
    for (const n of this.plan.nodes) {
      this.nodes.push({ node: n, sprite: this.add.image(n.x, n.y, `node_${n.item}`).setOrigin(0.5, 0.85).setDepth(n.y - 1), taken: false });
    }
    // Bandal's carts (the only way home) and the way down
    for (const e of this.floorDef.exits) this.add.image(e.x, e.y, "exit").setOrigin(0.5, 0.9).setDepth(e.y);
    if (this.floorDef.down) this.add.image(this.floorDef.down.x, this.floorDef.down.y, "stairs").setOrigin(0.5, 0.7).setDepth(this.floorDef.down.y - 20);
    createCharacterAnims(this);

    this.hunter = this.add.sprite(this.player.pos.x, this.player.pos.y, "hunter_down_1").setOrigin(0.5, HUNTER_FEET).setScale(CHAR_SCALE);
    this.fx = this.add.graphics().setDepth(5000);
    for (const s of this.plan.spawns.filter((s) => s.wave === 0)) this.mobs.push(createMob(this, s));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.floorDef.world.w, this.floorDef.world.h);
    cam.startFollow(this.hunter, true, 0.12, 0.12);

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys("W,A,S,D,Z,J,X,K,C,E,SPACE,ESC,ONE,TWO,THREE") as Keys;

    // touch controls on touch devices (add ?touch to the URL to try them with a mouse)
    this.touch = this.sys.game.device.input.touch || new URLSearchParams(location.search).has("touch");
    if (this.touch) this.createTouchControls();
    else this.createMouseControls();

    const hudStyle = TEXT_SMALL;
    // no key list on screen: the controls come with the tutorial (user, 2026-10-15)
    // stamina in the round gauge at the top left with what is left under it (user, 2026-10-15: the bar was
    // hard to see), the floor and the bag beside it; no way home but the carts
    const hud = <T extends Phaser.GameObjects.Image | Phaser.GameObjects.Text>(o: T): T => o.setScrollFactor(0).setDepth(10000) as T;
    hud(this.add.image(RING.x, RING.y, "stamina_ring_empty").setScale(KIT));
    const full = hud(this.add.image(RING.x, RING.y, "stamina_ring_full").setScale(KIT));
    this.ringMask = this.make.graphics({}, false).setScrollFactor(0);
    full.setMask(this.ringMask.createGeometryMask());
    this.face = hud(this.add.image(RING.x, RING.y, "stamina_face_fine").setScale(KIT));
    this.staminaText = hud(this.add.text(RING.x, RING.y + RING.r + 8, "", { ...TEXT, fontStyle: "bold" }).setOrigin(0.5));
    this.shownStamina = -1;
    this.bagText = hud(this.add.text(RING.x + RING.r + 10, RING.y - 6, "", hudStyle).setOrigin(0, 0.5));
    this.gatherHint = this.add.text(0, 0, "", hudStyle).setOrigin(0.5).setDepth(9500).setVisible(false);
    // which way the nearest cart is, at the screen's edge when it is out of sight (or always, when the bag
    // is full or stamina runs low)
    this.exitArrow = this.add.text(0, 0, "▶", { ...TEXT, color: "#ffd166" }).setOrigin(0.5).setScrollFactor(0).setDepth(10001).setVisible(false);
    // low stamina: the screen's edge pulses red (Dave the Diver's oxygen warning)
    this.lowGlow = this.add.rectangle(4, 4, GAME_WIDTH - 8, GAME_HEIGHT - 8).setOrigin(0).setStrokeStyle(8, 0xd01818, 1).setScrollFactor(0).setDepth(9999).setVisible(false);
    // the lunchbox: one button per packed dish under the way home (the dish at one game pixel per art pixel)
    this.huntData.lunchbox.forEach(({ dish, heal }, i) => {
      const bubble = kitSlice(this, 0, 0, "bubble_plain", 50, 48, 3, 3, 3, 3);
      const pic = this.add.image(1, -3, `dish_${dish}`);
      const key = this.add.text(18, 12, `${i + 1}`, TEXT_SMALL).setOrigin(0.5);
      const button = this.add.container(GAME_WIDTH - 28, 56 + i * 52, [bubble, pic, key]).setSize(50, 48).setScrollFactor(0).setDepth(10000);
      button.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.eat(i));
      this.lunch.push({ dish, heal, button, eaten: false });
    });
    // lunches eaten on an earlier floor, or before a reload, stay eaten
    for (const i of this.eatenBefore()) if (i < this.run.eaten.length) this.run.eaten[i] = true;
    this.run.eaten.forEach((gone, i) => {
      const l = this.lunch[i];
      if (!gone || !l) return;
      l.eaten = true;
      l.button.setAlpha(0.3).disableInteractive();
    });
    // the side weapon taken out and its shots left, bottom right (on touch: on its button)
    const sideAt = this.touch ? SIDE_BTN : { x: GAME_WIDTH - 44, y: GAME_HEIGHT - 52 };
    hud(this.add.image(sideAt.x, sideAt.y, `side_${this.huntData.side}`).setScale(this.touch ? 1 : KIT));
    this.ammoText = hud(this.add.text(sideAt.x + 18, sideAt.y + 14, "", { ...TEXT, fontStyle: "bold" }).setOrigin(0, 0.5));
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.floorCard();
    // development builds only: the scene reachable from the page, for screen checks (art-src/mockups/tools)
    if (import.meta.env.DEV) (window as unknown as { __hunt?: HuntScene }).__hunt = this;
  }

  update(_time: number, rawDt: number) {
    const dt = Math.min(rawDt, MAX_DT_MS);
    if (this.ended) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.togglePause();
    // paused: nothing moves and stamina holds
    if (this.paused) return;
    if (this.hitStopMs > 0) {
      this.hitStopMs -= dt;
      if (this.hitStopMs <= 0) this.anims.resumeAll();
      return;
    }
    if (!this.player.down) {
      this.run.stamina = drainStamina(this.run.stamina, dt, this.run.floor);
      if (this.run.stamina === 0) this.knockOut();
    }
    if (!this.player.down) this.updatePlayer(dt);
    this.updateHarpoon(dt);
    this.updateCapture(dt);
    this.updateDarts(dt);
    this.updateBombs(dt);
    this.updateMobs(dt);
    this.updateShots(dt);
    this.drawStatusLabels();
    this.fadeCanopies();
    this.drawFx(dt);
    this.drawDark();
    this.drawHud();
  }

  // ---------------------------------------------------------------- input

  private createMouseControls() {
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.overHud(over) || this.paused) return;
      if (p.rightButtonDown()) this.sideQueued = this.toWorld(p.x, p.y);
      else if (this.capturing || this.pinned) this.mashQueued = true;
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
    this.gatherButtonLabel = label(GATHER_BTN, t("hunt.useButton")).setVisible(false);
    this.gatherButton.setInteractive(new Phaser.Geom.Circle(GATHER_BTN.radius, GATHER_BTN.radius, GATHER_BTN.radius + 6), Phaser.Geom.Circle.Contains);
    this.gatherButton.on("pointerdown", () => (this.gatherQueued = true));
    // the side weapon fires the way the hunter aims
    const side = ui(this.add.circle(SIDE_BTN.x, SIDE_BTN.y, SIDE_BTN.radius, 0x806020, 0.6).setStrokeStyle(1, 0xffffff, 0.8));
    side.setInteractive(new Phaser.Geom.Circle(SIDE_BTN.radius, SIDE_BTN.radius, SIDE_BTN.radius + 6), Phaser.Geom.Circle.Contains);
    side.on("pointerdown", () => {
      const p = this.player;
      this.sideQueued = { x: p.pos.x + p.aim.x * 100, y: p.pos.y + p.aim.y * 100 - H.harpoon.handHeight };
    });

    const onButton = (p: Phaser.Input.Pointer) =>
      [SLASH_BTN, SIDE_BTN, ...(this.gatherButton?.visible ? [GATHER_BTN] : [])].some((b) => Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) <= b.radius + 6);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.paused) return;
      // capturing or pinned: any tap away from the stick mashes
      if ((this.capturing || this.pinned) && p.x >= GAME_WIDTH * 0.45) {
        this.mashQueued = true;
        return;
      }
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
    const ahead = { x: p.pos.x + p.aim.x * 100, y: p.pos.y + p.aim.y * 100 - H.harpoon.handHeight };
    if (JD(k.SPACE)) {
      if (this.capturing || this.pinned) this.mashQueued = true;
      else this.slashQueued = true;
    }
    if (JD(k.Z) || JD(k.J)) this.slashQueued = true;
    if (JD(k.X) || JD(k.K)) this.shotQueued = ahead;
    if (JD(k.C)) this.sideQueued = ahead;
    if (JD(k.E)) this.gatherQueued = true;
    if (JD(k.ONE)) this.eat(0);
    if (JD(k.TWO)) this.eat(1);
    if (JD(k.THREE)) this.eat(2);

    // Dave-style: on PC the hunter always looks at the mouse
    if (!this.touch) {
      const aim = this.toWorld(this.input.activePointer.x, this.input.activePointer.y);
      p.aim = unit({ x: aim.x - p.pos.x, y: aim.y - (p.pos.y - H.harpoon.handHeight) }, p.aim);
    }

    // capturing or pinned: the hunter holds on and mashes, nothing else
    if (this.capturing || this.pinned) {
      if (this.autoMash) {
        this.autoMashMs += dt;
        if (this.autoMashMs >= AUTO_MASH_MS) {
          this.autoMashMs = 0;
          this.mashQueued = true;
        }
      }
      if (this.mashQueued) {
        this.mashQueued = false;
        this.mash();
      }
      this.slashQueued = false;
      this.shotQueued = null;
      this.sideQueued = null;
      this.showHunter(false);
      return;
    }

    const use = this.nearestUse();
    const at = use?.kind === "node" ? use.node.node : use?.kind === "sleeper" ? mobPos(use.mob) : use?.kind === "exit" ? this.floorDef.exits.find((e) => e.id === use.id)! : use ? this.floorDef.down! : null;
    this.gatherHint.setVisible(!!at && !this.gathering && !this.touch);
    const need = use?.kind === "down" ? this.downNeed() : null;
    if (at) this.gatherHint.setText(t(use!.kind === "exit" ? "hunt.useExit" : use!.kind === "down" ? (need === "boots" ? "hunt.needBoots" : need === "lantern" ? "hunt.needLantern" : "hunt.useDown") : use!.kind === "sleeper" ? "hunt.take" : "hunt.gather")).setPosition(at.x, at.y - 34);
    this.gatherButton?.setVisible(!!use);
    this.gatherButtonLabel?.setVisible(!!use);

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
      if (p.harpoonCooldownMs === 0 && !this.harpoon && !this.reeling && !this.missReel) {
        this.gathering = null;
        this.throwHarpoon(at);
        return;
      }
    }
    if (this.sideQueued) {
      const at = this.sideQueued;
      this.sideQueued = null;
      this.gathering = null;
      this.fireSide(at);
    }
    if (this.gatherQueued) {
      this.gatherQueued = false;
      if (use?.kind === "exit") return this.endHunt(false, use.id);
      if (use?.kind === "down") return this.goDown();
      if (use?.kind === "sleeper") return this.take(use.mob, "sleep");
      if (use?.kind === "node" && !this.gathering) this.gathering = { node: use.node, ms: 0 };
    }

    const move = this.readMove();
    const moving = move.x !== 0 || move.y !== 0;
    if (moving) {
      this.gathering = null;
      const speed = H.player.speed * (this.time.now < this.speedUntil ? BALANCE.lunch.speedMul : 1);
      const next = moveByInput(p.pos, move, speed, dt, this.floorDef.field, H.player.depthSpeedRatio);
      p.pos = clampToField(pushOutOfRects(next, this.obstacles, H.player.radius), this.floorDef.field);
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
    return this.lunch.some((l) => over.includes(l.button));
  }

  // Lunch from the box: health back by the dish's worth, and a quick step for a few dishes.
  private eat(i: number) {
    const l = this.lunch[i];
    const p = this.player;
    if (!l || l.eaten || p.down || this.ended) return;
    l.eaten = true;
    this.run.eaten[i] = true;
    l.button.setAlpha(0.3).disableInteractive();
    this.rememberEaten();
    const heal = l.heal;
    this.run.stamina = Math.min(this.maxStamina, this.run.stamina + heal);
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
    damage = Math.max(1, Math.round(damage * this.huntData.stats.damageTaken));
    this.run.stamina = Math.max(0, this.run.stamina - damage);
    p.pos = clampToField(pushOutOfRects({ x: p.pos.x + dir.x * 24, y: p.pos.y + dir.y * 24 }, this.obstacles, H.player.radius), this.floorDef.field);
    p.swingMs = 0;
    this.gathering = null;
    this.hunter.setPosition(p.pos.x, p.pos.y).setTint(0xff8080);
    this.time.delayedCall(150, () => this.hunter.clearTint());
    this.cameras.main.shake(100, 0.01);
    this.popText(p.pos.x, p.pos.y - 32, `-${damage}`, "#ff6060");
    if (this.run.stamina === 0) this.knockOut();
  }

  // Out of stamina (worn out, or one hit too many): down, then home with half the bag (the server halves
  // it too).
  private knockOut() {
    const p = this.player;
    if (p.down) return;
    p.down = true;
    this.harpoon = null;
    this.reeling = null;
    this.endCapture();
    this.pinned = null;
    this.hunter.anims.stop();
    this.hunter.setTint(0x777777).setAngle(-90);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, t("hunt.ko"), { ...TEXT, fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10001);
    this.time.delayedCall(1500, () => this.endHunt(true, null));
  }

  // What E (or the action button) would use here: an exit, the way down, a sleeping monster, else a
  // gathering spot.
  private nearestUse(): { kind: "exit"; id: string } | { kind: "down" } | { kind: "sleeper"; mob: Mob } | { kind: "node"; node: Node } | null {
    const p = this.player.pos;
    const exit = this.floorDef.exits.find((e) => distance(p, e) <= USE_RANGE);
    if (exit) return { kind: "exit", id: exit.id };
    if (this.floorDef.down && distance(p, this.floorDef.down) <= USE_RANGE) return { kind: "down" };
    // a sleeping monster within reach: bag it (★★★)
    const sleeper = this.mobs.find((m) => !m.dead && m.status.kind === "asleep" && distance(p, mobPos(m)) <= USE_RANGE + mobRadius(m));
    if (sleeper) return { kind: "sleeper", mob: sleeper };
    const node = this.nearestNode();
    return node ? { kind: "node", node } : null;
  }

  // The way down: the report's line, then the next floor with the same Run (stamina, bag, report).
  private goDown() {
    const next = this.run.floor + 1;
    if (!this.floorDef.down || !isFloorId(next) || this.ended) return;
    const need = this.downNeed();
    if (need) {
      this.popText(this.player.pos.x, this.player.pos.y - 44, t(need === "boots" ? "hunt.needBoots" : "hunt.needLantern"), "#ff8080", 900);
      return;
    }
    this.run.report.push({ down: next });
    this.ended = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.restart({ ...this.huntData, run: { ...this.run, floor: next } }));
  }

  // The next floor's gear the hunter lacks (the server refuses such a report too), or null.
  private downNeed(): "boots" | "lantern" | null {
    const next = this.run.floor + 1;
    const need = isFloorId(next) ? FLOORS[next].needs : null;
    if (need === "boots" && !this.huntData.gear.boots) return "boots";
    if (need === "lantern" && this.huntData.gear.light <= 0) return "lantern";
    return null;
  }

  // "Floor 2 · Deep forest" sliding across on arrival (hunt v3 design 5.1).
  private floorCard() {
    const name = t("hunt.floorCard", { n: this.run.floor, name: t(`floor.${this.run.floor}` as StringKey) });
    const label = this.add.text(0, -1, name, { ...TEXT, fontStyle: "bold" }).setOrigin(0.5);
    const plate = kitSlice(this, 0, 0, "topbar", Math.ceil(label.width) + 40, 26, 5, 5, 2, 1);
    const card = this.add.container(GAME_WIDTH / 2 - 40, 70, [plate, label]).setScrollFactor(0).setDepth(10002).setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, x: GAME_WIDTH / 2, duration: 250, ease: "Cubic.easeOut", hold: 1300, yoyo: true, onComplete: () => card.destroy() });
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
    const r = addToBag(this.run.bag, key, this.bagSlots);
    if (!r.added) {
      this.popText(this.player.pos.x, this.player.pos.y - 42, t("hunt.bagFull"), "#ffb0b0", 1200);
      return;
    }
    this.run.bag = r.bag;
    g.node.taken = true;
    this.run.report.push({ gather: g.node.node.id });
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
      const live = this.mobs.filter((m) => !m.dead && isTargetable(m)).map((m) => ({ pos: mobPos(m), mob: m }));
      const struck = harpoonHit(h.tip, live, H.harpoon.bodyOffsetY, H.harpoon.hitRadius)?.mob;
      if (struck) {
        this.harpoon = null;
        this.harpoonStrike(struck);
      } else if (harpoonDone(h, this.ranged.range)) {
        // a miss: the rope reels back before the harpoon can fly again
        this.harpoon = null;
        this.missReel = { from: h.tip, ms: MISS_REEL_MS };
      } else this.harpoon = h;
    }
    if (this.missReel) {
      this.missReel.ms -= dt;
      if (this.missReel.ms <= 0) this.missReel = null;
    }
    const m = this.reeling;
    if (!m) return;
    if (m.dead || this.player.down) {
      this.reeling = null;
      return;
    }
    const r = reelStep(mobPos(m), this.player.pos, H.harpoon.pullSpeed, dt, H.harpoon.pullStopDist, this.floorDef.field);
    setMobPos(m, r.pos);
    if (r.done) {
      this.reeling = null;
      // reeled in: it struggles on the capture gauge (hunt v3 design 4.2)
      const gauge = addGauge(this, r.pos.x, r.pos.y - 44, 40);
      gauge.box.setDepth(9600);
      this.capturing = { mob: m, c: startCapture(), gauge };
      this.popText(r.pos.x, r.pos.y - 56, t("hunt.mash"), "#ffd166", 700);
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
    p.pos = clampToField(pushOutOfRects({ x: p.pos.x + p.aim.x * H.hit.knockback, y: p.pos.y + p.aim.y * H.hit.knockback }, this.obstacles, H.player.radius), this.floorDef.field);
    this.hunter.setFlipX(p.aim.x < 0).setPosition(p.pos.x, p.pos.y).setDepth(p.pos.y).play("hunter_slash");
    const comboStep = p.comboStep;
    const aim = p.aim;
    this.time.delayedCall(weapon.swingMs * 0.5, () => this.landSlash(comboStep, aim));
  }

  private landSlash(comboStep: number, aim: Vec) {
    const p = this.player;
    if (p.down || this.ended) return;
    const live = this.mobs.filter((m) => !m.dead && m !== this.reeling && isTargetable(m)).map((m) => ({ pos: mobPos(m), mob: m }));
    const struck = coneTargets(p.pos, aim, live, this.melee.range, H.slashHalfAngle).map((x) => x.mob);
    this.slashArc = { at: p.pos, aim, ms: 120 };
    if (struck.length === 0) return;
    let big = false;
    for (const m of struck) {
      const hit = computeHit({ weapon: this.melee, comboStep, targetVulnerable: isMobVulnerable(m), attackerPos: p.pos, targetPos: mobPos(m), targetFacing: mobFacing(m) }, H.hit);
      big ||= hit.finisher || hit.counter;
      const at = mobPos(m);
      const away = unit({ x: at.x - p.pos.x, y: at.y - p.pos.y }, aim);
      setMobPos(m, clampToField(pushOutOfRects({ x: at.x + away.x * hit.knockback, y: at.y + away.y * hit.knockback }, this.obstacles, mobRadius(m)), this.floorDef.field));
      this.applyHit(m, "melee", hit.damage, [hit.counter && "카운터!", hit.backAttack && "백어택!", hit.finisher && "막타!"]);
      if (hit.finisher) this.flip(m);
    }
    // game feel: one freeze per swing, longer and with a shake on big hits
    this.hitStop(big ? H.hitStopMs * 2 : H.hitStopMs);
    if (big) this.cameras.main.shake(120, 0.012);
  }

  // The glow-shroom crab turned on its back (a finisher or a firecracker): soft all over for a while.
  private flip(m: Mob) {
    if (m.dead || m.ai.kind !== "shell" || m.ai.s.phase === "flipped") return;
    m.ai = { kind: "shell", s: flipShell(m.ai.s) };
    const at = mobPos(m);
    this.popText(at.x, at.y - 40, t("hunt.flipped"), "#ffd166", 900);
  }

  private applyHit(m: Mob, kind: WeaponKind, damage: number, tagList: (string | false)[]) {
    // the crab's shell takes most of a hit from the front
    if (m.ai.kind === "shell") {
      const mul = shellDamageMul(m.ai.s, this.player.pos);
      damage = Math.max(1, Math.round(damage * mul));
      if (mul < 1) tagList = [...tagList, t("hunt.shell")];
    }
    m.hp -= damage;
    m.hits = recordHit(m.hits, kind);
    mobWasHit(m);
    if (m.spawn.flock) angerFlock(this.mobs, m.spawn.flock);
    m.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => m.sprite.active && m.sprite.clearTint());
    const tags = tagList.filter(Boolean).join(" ");
    const at = mobPos(m);
    this.popText(at.x, at.y - 30, `${damage}${tags ? " " + tags : ""}`, tags ? "#ffd166" : "#ffffff");
    if (m.hp <= 0) this.take(m, "down");
  }

  // A monster taken (hunt v3 design 4.2): knocked down ★, captured ★★, put to sleep or netted ★★★. Its
  // parts go into the bag by stars (the server decides the same drop from the seed and the same count);
  // the take is reported either way, and a refill comes in shortly after.
  private take(m: Mob, how: TakeHow) {
    if (m.dead) return;
    m.dead = true;
    if (this.reeling === m) this.reeling = null;
    if (this.capturing?.mob === m) this.endCapture();
    if (this.pinned === m) this.pinned = null;
    this.run.report.push({ take: m.spawn.id, how });
    const y = takeYield(how, m.spawn.monster === "tusk");
    const key = itemKey(dropFor(this.huntData.seed, m.spawn), y.grade);
    const at = mobPos(m);
    let added = 0;
    for (let i = 0; i < y.count; i++) {
      const r = addToBag(this.run.bag, key, this.bagSlots);
      if (!r.added) break;
      this.run.bag = r.bag;
      added++;
    }
    this.celebrate(at, how);
    if (added > 0) this.flyToBag(at, key, added);
    else this.popText(at.x, at.y - 38, t("hunt.bagFull"), "#ffb0b0", 1200);
    if (m.spawn.monster === "tusk") this.say(at, t("hunt.tuskCaught"));
    this.statusLabels.get(m)?.destroy();
    this.statusLabels.delete(m);
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

  // ---------------------------------------------------------------- capture, pin, side weapons

  // One mash: fills the capture gauge, or works the hunter loose from the tusk boss.
  private mash() {
    if (this.capturing) {
      this.capturing.c = tapCapture(this.capturing.c, this.huntData.harpoonLevel);
      this.cameras.main.shake(60, 0.004);
      const g = this.capturing.gauge.box;
      this.tweens.add({ targets: g, y: g.y - 2, duration: 50, yoyo: true });
    } else if (this.pinned && this.pinned.ai.kind === "boss") {
      this.pinned.ai = { kind: "boss", s: mashTusk(this.pinned.ai.s) };
      this.cameras.main.shake(50, 0.004);
    }
  }

  private updateCapture(dt: number) {
    const cap = this.capturing;
    if (!cap) return;
    const m = cap.mob;
    if (m.dead || this.player.down) return this.endCapture();
    // it struggles in place, held by the taut rope
    const at = mobPos(m);
    m.sprite.setPosition(at.x + (Math.random() < 0.5 ? -1 : 1), at.y);
    const r = stepCapture(cap.c, dt, Math.max(0, m.hp) / MONSTERS[m.spawn.monster].maxHp);
    cap.c = r.c;
    cap.gauge.set(cap.c.fill);
    cap.gauge.box.setPosition(at.x - 20, at.y - 44);
    if (r.result === "caught") this.take(m, "capture");
    else if (r.result === "broke") {
      this.endCapture();
      this.popText(at.x, at.y - 40, t("hunt.ropeBroke"), "#ff8080", 900);
      this.enrage(m);
    }
  }

  private endCapture() {
    this.capturing?.gauge.box.destroy();
    this.capturing = null;
  }

  // The rope broke: the monster turns on the hunter (or runs, if it is the timid kind).
  private enrage(m: Mob) {
    const p = this.player.pos;
    const toward = unit({ x: p.x - mobPos(m).x, y: p.y - mobPos(m).y });
    switch (m.ai.kind) {
      case "charger":
        m.ai = { kind: "charger", s: { ...m.ai.s, phase: "telegraph", phaseMs: 0, facing: toward, chargeDir: toward, wanderTarget: null, hitThisCharge: false } };
        break;
      case "fleer":
        m.ai = { kind: "fleer", s: fleerHit(m.ai.s) };
        break;
      case "shooter":
        m.ai = { kind: "shooter", s: { ...m.ai.s, phase: "aim", phaseMs: 0, aimDir: toward } };
        break;
      case "pack":
        if (m.spawn.flock) angerFlock(this.mobs, m.spawn.flock);
        break;
      case "boss":
        break;
    }
  }

  // The side weapon taken out (hunt v3 design 4.4): pebble, sleep dart and net fly straight like the
  // harpoon; the firecracker is thrown to the aimed spot and goes off there.
  private fireSide(at: Vec) {
    const p = this.player;
    if (this.run.ammo <= 0) {
      this.popText(p.pos.x, p.pos.y - 40, t("hunt.noAmmo"), "#ffb0b0", 900);
      return;
    }
    this.run.ammo--;
    const side = this.huntData.side;
    p.aim = unit({ x: at.x - p.pos.x, y: at.y - this.hand().y }, p.aim);
    p.swingMs = this.ranged.swingMs;
    this.hunter.setFlipX(p.aim.x < 0).play("hunter_throw");
    if (side === "firecracker") {
      const d = Math.min(H.firecracker.range, distance(this.hand(), at));
      const to = { x: this.hand().x + p.aim.x * d, y: this.hand().y + p.aim.y * d + H.harpoon.handHeight };
      const sprite = this.add.image(this.hand().x, this.hand().y, `side_${side}`).setScale(0.5).setDepth(9000);
      this.tweens.add({ targets: sprite, x: to.x, y: to.y, angle: 360, duration: 400 });
      this.bombs.push({ at: to, ms: 400, sprite });
      return;
    }
    const sprite = this.add.image(this.hand().x, this.hand().y, `side_${side}`).setScale(0.5).setDepth(9000);
    this.darts.push({ kind: side, h: fireHarpoon(this.hand(), at, p.aim.x < 0 ? -1 : 1), sprite });
  }

  private updateDarts(dt: number) {
    this.darts = this.darts.filter((d) => {
      const h = stepHarpoon(d.h, H.sling.speed, dt);
      d.sprite.setPosition(h.tip.x, h.tip.y).setRotation(Math.atan2(h.dir.y, h.dir.x));
      const live = this.mobs.filter((m) => !m.dead && m !== this.capturing?.mob && isTargetable(m)).map((m) => ({ pos: mobPos(m), mob: m }));
      const struck = harpoonHit(h.tip, live, H.harpoon.bodyOffsetY, H.harpoon.hitRadius)?.mob;
      if (struck) {
        d.sprite.destroy();
        this.dartHit(d.kind, struck);
        return false;
      }
      if (harpoonDone(h, H.sling.range)) {
        d.sprite.destroy();
        return false;
      }
      d.h = h;
      return true;
    });
  }

  private dartHit(kind: SideWeaponId, m: Mob) {
    const at = mobPos(m);
    if (kind === "sling") {
      this.applyHit(m, "ranged", H.sling.damage, []);
      if (!m.dead) m.status = stun(m.status, H.sling.stunMs);
    } else if (kind === "sleepGun") {
      m.status = dart(m.status, H.sleepHits[m.spawn.monster], this.huntData.sleepFallMs);
      // the flock does not notice one of its own nodding off
      this.tweens.add({ targets: m.sprite, angle: { from: -8, to: 8 }, duration: 160, yoyo: true, repeat: 2, onComplete: () => m.sprite.active && m.sprite.setAngle(0) });
    } else if (kind === "netGun") {
      if (MONSTERS[m.spawn.monster].radius <= H.netSmallMaxRadius) this.take(m, "net");
      else {
        m.status = bind(m.status, H.netBindMs);
        this.popText(at.x, at.y - 40, "#", "#ffd166", 800);
      }
    }
  }

  private updateBombs(dt: number) {
    this.bombs = this.bombs.filter((b) => {
      b.ms -= dt;
      if (b.ms > 0) return true;
      b.sprite.destroy();
      // bang: everything nearby is startled still; a flock bursts apart
      this.cameras.main.shake(140, 0.01);
      this.popText(b.at.x, b.at.y - 10, "펑!", "#ffd166", 700);
      for (const m of this.mobs) {
        if (m.dead || distance(mobPos(m), b.at) > H.firecracker.radius) continue;
        m.status = stun(m.status, H.firecracker.stunMs);
        this.flip(m);
        if (m.ai.kind === "pack") {
          const away = unit({ x: mobPos(m).x - b.at.x, y: mobPos(m).y - b.at.y });
          setMobPos(m, clampToField(pushOutOfRects({ x: mobPos(m).x + away.x * 30, y: mobPos(m).y + away.y * 30 }, this.obstacles, mobRadius(m)), this.floorDef.field));
        }
      }
      return false;
    });
  }

  // Above each monster a side weapon has touched: Zzz while asleep, z for each dart while drowsy, @@
  // while stunned, # while tied up.
  private drawStatusLabels() {
    for (const m of this.mobs) {
      const st = m.status;
      const text = st.kind === "asleep" ? "Zzz" : st.kind === "drowsy" ? "z".repeat(st.hits) : st.kind === "stunned" ? "@@" : st.kind === "bound" ? "#" : "";
      let label = this.statusLabels.get(m);
      if (!text || m.dead) {
        label?.destroy();
        this.statusLabels.delete(m);
        continue;
      }
      if (!label) {
        label = this.add.text(0, 0, "", { ...TEXT_SMALL, color: st.kind === "asleep" || st.kind === "drowsy" ? "#9fd8ff" : "#ffd166" }).setOrigin(0.5).setDepth(9500);
        this.statusLabels.set(m, label);
      }
      const at = mobPos(m);
      const bob = st.kind === "asleep" ? Math.sin(this.time.now / 300) * 3 : 0;
      label.setText(text).setPosition(at.x + (st.kind === "asleep" ? 8 : 0), at.y - 34 - mobRadius(m) + bob);
    }
  }

  // The catch, Dave the Diver style: a stamp for a capture, the stars springing up, a sparkle for ★★★.
  private celebrate(at: Vec, how: TakeHow) {
    const n = starsOf(how);
    if (how === "capture") {
      const stamp = this.add.text(at.x, at.y - 40, t("hunt.captured"), { ...TEXT, fontStyle: "bold", color: "#ffd166" }).setOrigin(0.5).setDepth(9700).setScale(2.4);
      this.tweens.add({ targets: stamp, scale: 1, duration: 140, ease: "Back.easeOut", onComplete: () => this.tweens.add({ targets: stamp, alpha: 0, delay: 500, duration: 300, onComplete: () => stamp.destroy() }) });
      this.hitStop(100);
    }
    const stars = this.add.text(at.x, at.y - 52, "★".repeat(n), { ...TEXT, fontStyle: "bold", color: n === 3 ? "#ffe680" : "#ffd166" }).setOrigin(0.5).setDepth(9700);
    this.tweens.add({ targets: stars, y: at.y - 70, duration: 450, ease: "Back.easeOut", onComplete: () => this.tweens.add({ targets: stars, alpha: 0, delay: 400, duration: 300, onComplete: () => stars.destroy() }) });
    if (n === 3)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spark = this.add.text(at.x, at.y - 24, "✦", { ...TEXT_SMALL, color: "#fff3a0" }).setOrigin(0.5).setDepth(9700);
        this.tweens.add({ targets: spark, x: at.x + Math.cos(a) * 22, y: at.y - 24 + Math.sin(a) * 16, alpha: 0, duration: 600, onComplete: () => spark.destroy() });
      }
  }

  // The parts taken fly from the monster to the bag count at the top left.
  private flyToBag(at: Vec, key: string, count: number) {
    const item = parseItemKey(key);
    if (!item) return;
    const cam = this.cameras.main;
    const target = { x: cam.worldView.x + RING.x + RING.r + 30, y: cam.worldView.y + RING.y - 6 };
    for (let i = 0; i < count; i++) {
      // the deep floors' item icons come once their art is approved
      if (!this.textures.exists(`icon_${item.id}`)) break;
      const icon = this.add.image(at.x, at.y - 30, `icon_${item.id as ItemId}`).setDepth(9800);
      this.tweens.add({ targets: icon, x: target.x, y: target.y, scale: 0.6, delay: 120 * i, duration: 600, ease: "Cubic.easeIn", onComplete: () => icon.destroy() });
    }
    // the parts' name under the monster, clear of the stamp and the stars above it
    this.popText(at.x, at.y + 10, `${itemName(key)} ×${count}`, item.grade === "premium" ? "#ffd166" : "#ffffff", 900);
  }

  // A line from a monster in a kit bubble (the tusk boss).
  private say(at: Vec, line: string) {
    const label = this.add.text(0, -1, line, { ...TEXT_SMALL, color: "#2b1408", stroke: "#2b1408", strokeThickness: 0 }).setOrigin(0.5);
    const bubble = kitSlice(this, 0, 0, "bubble_plain", Math.ceil(label.width) + 16, 22, 3, 3, 3, 3);
    const box = this.add.container(at.x, at.y - 60, [bubble, label]).setDepth(9800);
    this.tweens.add({ targets: box, alpha: 0, delay: 1800, duration: 400, onComplete: () => box.destroy() });
  }

  // Esc: pause, with the auto-mash switch (hunt v3 design 5.2).
  private togglePause() {
    this.paused = !this.paused;
    if (!this.paused) {
      this.pauseMenu?.destroy();
      this.pauseMenu = null;
      this.anims.resumeAll();
      this.tweens.resumeAll();
      return;
    }
    this.anims.pauseAll();
    this.tweens.pauseAll();
    const panel = kitSlice(this, 0, 0, "panel", 220, 110, 5, 5, 5, 5);
    const title = this.add.text(0, -36, t("hunt.paused"), { ...TEXT, fontStyle: "bold" }).setOrigin(0.5);
    let toggle: UiButton;
    const label = () => t(this.autoMash ? "hunt.autoMashOn" : "hunt.autoMashOff");
    const resume = addButton(this, 0, -4, t("hunt.resume"), () => this.togglePause(), 140);
    toggle = addButton(this, 0, 28, label(), () => {
      this.autoMash = !this.autoMash;
      try {
        localStorage.setItem(AUTO_MASH_KEY, this.autoMash ? "1" : "0");
      } catch {
        // private mode: the switch lasts this hunt only
      }
      toggle.setText(label());
    }, 140);
    this.pauseMenu = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [panel, title, resume.box, toggle.box]).setScrollFactor(0).setDepth(20000);
  }

  // ---------------------------------------------------------------- monsters and stingers

  private updateMobs(dt: number) {
    const seen = this.player.down ? null : this.player.pos;
    for (const m of this.mobs) {
      if (m.dead || m === this.reeling) continue;
      if (m === this.capturing?.mob) continue;
      const step = stepMob(m, dt, seen, this.floorDef.field, this.obstacles, this.dark ? this.huntData.gear.light : 0);
      if (step.hurt) this.hurtPlayer(step.hurt.damage, step.hurt.dir);
      if (step.pull && !this.player.down) {
        // the frog's tongue reels the hunter in
        const p = this.player;
        const to = unit({ x: mobPos(m).x - p.pos.x, y: mobPos(m).y - p.pos.y }, p.aim);
        p.pos = clampToField(pushOutOfRects({ x: p.pos.x + to.x * step.pull, y: p.pos.y + to.y * step.pull }, this.obstacles, H.player.radius), this.floorDef.field);
        this.hunter.setPosition(p.pos.x, p.pos.y);
      }
      if (step.grabbed && !this.player.down) {
        // pinned under the tusk boss: mash to break free
        this.pinned = m;
        this.harpoon = null;
        this.popText(this.player.pos.x, this.player.pos.y - 44, t("hunt.mash"), "#ff8080", 900);
      }
      if (step.slam) {
        this.cameras.main.shake(200, 0.015);
        this.slamRing = { at: step.slam, ms: 300 };
      }
      if (step.statusEvent === "fell_asleep") this.tweens.add({ targets: m.sprite, y: m.sprite.y + 2, duration: 200 });
      if (m.ai.kind === "boss") this.watchBoss(m);
      if (step.shot) this.shots.push({ shot: step.shot, sprite: this.add.image(step.shot.pos.x, step.shot.pos.y, "bee_stinger").setDepth(9000).setRotation(Math.atan2(step.shot.dir.y, step.shot.dir.x)) });
      drawMob(this, m, step.phaseChanged, (x, y, s, c, ms) => this.popText(x, y, s, c, ms));
    }
  }

  // The tusk boss: its name card the first time it comes into view, its health along the top while it
  // lives, and the pin released once it lets go.
  private watchBoss(m: Mob) {
    if (this.pinned === m && (m.ai.kind !== "boss" || m.ai.s.phase !== "grab")) this.pinned = null;
    if (!this.bossSeen && this.cameras.main.worldView.contains(mobPos(m).x, mobPos(m).y)) {
      this.bossSeen = true;
      this.bossCard();
      this.bossBar = addGauge(this, GAME_WIDTH / 2, 18, 240);
      this.bossBar.box.setScrollFactor(0).setDepth(10000);
    }
    this.bossBar?.set(Math.max(0, m.hp) / MONSTERS.tusk.maxHp);
  }

  private bossCard() {
    const line = this.add.text(0, -8, t("hunt.tuskCard"), { ...TEXT_SMALL, color: "#ffd166" }).setOrigin(0.5);
    const name = this.add.text(0, 8, t("hunt.tuskName"), { ...TEXT, fontStyle: "bold" }).setOrigin(0.5);
    const plate = kitSlice(this, 0, 0, "topbar", Math.max(line.width, name.width) + 48, 44, 5, 5, 2, 1);
    const card = this.add.container(GAME_WIDTH + 140, GAME_HEIGHT / 2 - 40, [plate, line, name]).setScrollFactor(0).setDepth(10002);
    this.tweens.add({ targets: card, x: GAME_WIDTH / 2, duration: 260, ease: "Cubic.easeOut", hold: 1200, yoyo: true, onComplete: () => card.destroy() });
    this.cameras.main.shake(160, 0.008);
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
      if (m.ai.kind === "boss" && m.ai.s.phase === "telegraph") this.drawLane(g, mobPos(m), m.ai.s.chargeDir, H.tusk.chargeSpeed * (H.tusk.chargeMs / 1000), 22);
      // the slam's circle, warned before it lands
      if (m.ai.kind === "boss" && m.ai.s.phase === "slamWindup") g.fillStyle(0x400000, 0.3).fillCircle(mobPos(m).x, mobPos(m).y, H.tusk.slamRadius).lineStyle(2, 0xff3030, 1).strokeCircle(mobPos(m).x, mobPos(m).y, H.tusk.slamRadius * Math.min(1, m.ai.s.phaseMs / H.tusk.slamTelegraphMs));
    }
    if (this.slamRing) {
      this.slamRing.ms -= dt;
      g.lineStyle(3, 0xffd166, Math.max(0, this.slamRing.ms / 300)).strokeCircle(this.slamRing.at.x, this.slamRing.at.y, H.tusk.slamRadius * (1.2 - this.slamRing.ms / 1000));
      if (this.slamRing.ms <= 0) this.slamRing = null;
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
    // capturing: the rope stays on, taut and trembling
    if (this.capturing) {
      const at = mobPos(this.capturing.mob);
      end = { x: at.x + (Math.random() - 0.5) * 2, y: at.y - H.harpoon.bodyOffsetY + (Math.random() - 0.5) * 2 };
    }
    // a miss reeling back to the hand
    if (!end && this.missReel) {
      const k = this.missReel.ms / MISS_REEL_MS;
      end = { x: hand.x + (this.missReel.from.x - hand.x) * k, y: hand.y + (this.missReel.from.y - hand.y) * k };
    }
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

  // The cave (hunt v3 design 3): dark but for the lantern's light around the hunter, soft at its edge.
  private makeDark() {
    const r = Math.max(1, this.huntData.gear.light);
    const key = `light_${r}`;
    if (!this.textures.exists(key)) {
      const size = Math.ceil(r * 2.5);
      const tex = this.textures.createCanvas(key, size, size)!;
      const c = tex.getContext();
      const g = c.createRadialGradient(size / 2, size / 2, r * 0.6, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, size, size);
      tex.refresh();
    }
    this.dark = this.add.renderTexture(0, 0, GAME_WIDTH, GAME_HEIGHT).setOrigin(0).setScrollFactor(0).setDepth(9400);
  }

  private drawDark() {
    if (!this.dark) return;
    const key = `light_${Math.max(1, this.huntData.gear.light)}`;
    const size = this.textures.get(key).getSourceImage().width;
    const view = this.cameras.main.worldView;
    const at = { x: this.hunter.x - view.x, y: this.hunter.y - view.y - 16 };
    this.dark.clear().fill(0x07060c, 0.92).erase(key, at.x - size / 2, at.y - size / 2);
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
    const icon = this.add.image(x - 2, y, this.textures.exists(`icon_${item.id}`) ? `icon_${item.id as ItemId}` : "__DEFAULT").setOrigin(1, 0.5).setDepth(9001);
    const label = this.add.text(x, y, name, { ...TEXT_SMALL, color }).setOrigin(0, 0.5).setDepth(9001);
    this.tweens.add({ targets: [icon, label], y: y - 16, alpha: 0, delay: 500, duration: 900, ease: "Cubic.easeOut", onComplete: () => (icon.destroy(), label.destroy()) });
  }

  private drawHud() {
    const frac = this.run.stamina / this.maxStamina;
    const shown = Math.ceil(this.run.stamina);
    if (shown !== this.shownStamina) {
      this.shownStamina = shown;
      // the ring that is left, clockwise from the top
      this.ringMask.clear().fillStyle(0xffffff).slice(RING.x, RING.y, RING.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.0001, frac), false).fillPath();
      this.staminaText.setText(String(shown)).setColor(frac < LOW_STAMINA ? "#ff7070" : "#fff3d8");
      this.face.setTexture(frac < LOW_STAMINA ? "stamina_face_tired" : "stamina_face_fine");
    }
    this.bagText.setText(`${t("hunt.floorShort", { n: this.run.floor })} · ${t("hud.bag", { n: bagCount(this.run.bag), max: this.bagSlots })}`);
    const low = frac < LOW_STAMINA && !this.player.down;
    this.lowGlow.setVisible(low);
    if (low) this.lowGlow.setAlpha(0.8 + 0.2 * Math.sin(this.time.now / 180));
    this.drawExitArrow();
    this.ammoText.setText(`${this.run.ammo}`).setColor(this.run.ammo > 0 ? "#fff3d8" : "#9a8f84");
  }

  // The nearest cart: an arrow beside the hunter pointing at it, pushed in to the screen's edge when the
  // cart is out of sight. Shown when the cart is out of sight, and always when the bag is full or stamina
  // runs low.
  private drawExitArrow() {
    const p = this.player.pos;
    const e = nearestExit(p, this.run.floor);
    const cam = this.cameras.main;
    const urgent = bagCount(this.run.bag) >= this.bagSlots || this.run.stamina / this.maxStamina < LOW_STAMINA;
    const off = !cam.worldView.contains(e.x, e.y);
    const near = distance(p, e) <= USE_RANGE * 2;
    this.exitArrow.setVisible(!this.player.down && !near && (off || urgent));
    if (!this.exitArrow.visible) return;
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    // from the hunter's place on screen (his middle, not his feet), 40 px toward the cart, kept 16 px inside
    const sx = p.x - cam.worldView.x;
    const sy = p.y - 14 - cam.worldView.y;
    const x = Phaser.Math.Clamp(sx + Math.cos(a) * 40, 16, GAME_WIDTH - 16);
    const y = Phaser.Math.Clamp(sy + Math.sin(a) * 40, 16, GAME_HEIGHT - 16);
    this.exitArrow.setPosition(x, y).setRotation(a);
  }

  // Home: through a cart (its exit id), or knocked out (null). The report goes to the day flow; the server
  // follows it floor by floor and applies the knockout's half bag too.
  private endHunt(ko: boolean, exit: string | null) {
    if (this.ended) return;
    this.ended = true;
    const result: HuntResult = { events: [...this.run.report], exit, ko };
    this.game.events.emit("hunt:end", result);
    this.scene.pause();
  }
}
