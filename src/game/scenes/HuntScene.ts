import Phaser from "phaser";
import { BALANCE } from "../../../shared/balance";
import { isVulnerable, newCharger, updateCharger, type ChargerState } from "../../../shared/hunt/charger";
import {
  EMPTY_HIT_LOG,
  computeHit,
  meatGrade,
  nextComboStep,
  recordHit,
  swingTargets,
  type HitLog,
  type WeaponKind,
} from "../../../shared/hunt/combat";
import { clampToField, moveByInput } from "../../../shared/hunt/geometry";
import type { Vec } from "../../../shared/hunt/types";
import { artUrl } from "../art";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { joystickVector } from "../joystick";

// Belt-scroller hunting prototype (plan 01). PC: arrow keys / WASD to move, Z (J, Space) to attack,
// X (K) to switch weapon. Touch: stick on the left, attack and weapon buttons on the right.
// Rules live in shared/hunt; this scene reads input, draws, and adds the game feel.
const H = BALANCE.hunt;
// A frame gap after the tab was hidden must not teleport anything (rules are also clamped).
const MAX_DT_MS = 50;
// Where the feet are inside each sprite's canvas (transparent padding underneath). Tune by eye.
const FEET = { hunter: 0.9, boar: 0.75 };
const FRAMES = { idle: 4, walk: 6, attack: 7, throw: 7, boarWalk: 6, boarAttack: 7 };
// Background layers: [texture, parallax factor, y offset, depth]. The floor is where everyone walks.
const LAYERS = [
  ["bg_far", 0.15, -60, -300],
  ["bg_mid", 0.4, -72, -200],
  ["bg_floor", 1, 112, -100],
] as const;
// Touch controls, in screen pixels of the 400x224 game.
const STICK = { x: 52, y: 176, radius: 26, deadZone: 0.2 };
const ATTACK_BTN = { x: 356, y: 180, radius: 22 };
const WEAPON_BTN = { x: 310, y: 198, radius: 13 };

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
  facing: 1 | -1;
  hp: number;
  weapon: WeaponKind;
  cooldownMs: number;
  swingMs: number;
  comboStep: number;
  msSinceSwing: number;
  down: boolean;
}

type Keys = Record<"W" | "A" | "S" | "D" | "Z" | "J" | "SPACE" | "X" | "K", Phaser.Input.Keyboard.Key>;

export class HuntScene extends Phaser.Scene {
  private player!: Player;
  private boars: Boar[] = [];
  private nextBoarId = 1;
  private hitStopMs = 0;
  private hunter!: Phaser.GameObjects.Sprite;
  private layers: { tile: Phaser.GameObjects.TileSprite; factor: number }[] = [];
  private hud!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Keys;
  private touch = false;
  private stickPointer: number | null = null;
  private stickVec: Vec = { x: 0, y: 0 };
  private stickKnob!: Phaser.GameObjects.Arc;
  private attackQueued = false;

  constructor() {
    super("hunt");
  }

  // Runs on every start and restart, so a knocked-out hunter comes back fresh.
  init() {
    this.player = {
      pos: { x: 120, y: 170 },
      facing: 1,
      hp: H.player.maxHp,
      weapon: "melee",
      cooldownMs: 0,
      swingMs: 0,
      comboStep: 0,
      msSinceSwing: Infinity,
      down: false,
    };
    this.boars = [];
    this.hitStopMs = 0;
    this.layers = [];
    this.stickPointer = null;
    this.stickVec = { x: 0, y: 0 };
    this.attackQueued = false;
  }

  preload() {
    this.load.image("bg_far", artUrl("test/bg/far.png"));
    this.load.image("bg_mid", artUrl("test/bg/mid.png"));
    this.load.image("bg_floor", artUrl("test/bg/floor.png"));
    this.load.image("boar_idle", artUrl("test/boar/idle.png"));
    for (let i = 0; i < FRAMES.boarWalk; i++) this.load.image(`boar_walk_${i}`, artUrl(`test/boar/walk_${i}.png`));
    for (let i = 0; i < FRAMES.boarAttack; i++) this.load.image(`boar_attack_${i}`, artUrl(`test/boar/attack_${i}.png`));
    for (const [name, n] of [["idle", FRAMES.idle], ["walk", FRAMES.walk], ["attack", FRAMES.attack], ["throw", FRAMES.throw]] as const) {
      for (let i = 0; i < n; i++) this.load.image(`hunter_${name}_${i}`, artUrl(`test/hunter/${name}_${i}.png`));
    }
  }

  create() {
    for (const [key, factor, y, depth] of LAYERS) {
      const tex = this.mirrored(key);
      const h = this.textures.get(tex).getSourceImage().height;
      const tile = this.add.tileSprite(0, y, GAME_WIDTH, h, tex).setOrigin(0).setScrollFactor(0).setDepth(depth);
      this.layers.push({ tile, factor });
    }

    const frames = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: `${prefix}_${i}` }));
    const swingRate = (n: number) => Math.round((n * 1000) / H.weapons.melee.swingMs);
    if (!this.anims.exists("hunter_idle")) {
      this.anims.create({ key: "hunter_idle", frames: frames("hunter_idle", FRAMES.idle), frameRate: 5, repeat: -1 });
      this.anims.create({ key: "hunter_walk", frames: frames("hunter_walk", FRAMES.walk), frameRate: 10, repeat: -1 });
      this.anims.create({ key: "hunter_attack", frames: frames("hunter_attack", FRAMES.attack), frameRate: swingRate(FRAMES.attack) });
      this.anims.create({ key: "hunter_throw", frames: frames("hunter_throw", FRAMES.throw), frameRate: swingRate(FRAMES.throw) });
      this.anims.create({ key: "boar_walk", frames: frames("boar_walk", FRAMES.boarWalk), frameRate: 8, repeat: -1 });
      this.anims.create({ key: "boar_charge", frames: frames("boar_walk", FRAMES.boarWalk), frameRate: 20, repeat: -1 });
    }

    this.hunter = this.add.sprite(this.player.pos.x, this.player.pos.y, "hunter_idle_0").setOrigin(0.5, FEET.hunter);
    this.hunter.play("hunter_idle");

    const cam = this.cameras.main;
    cam.setBounds(0, 0, H.worldWidth, GAME_HEIGHT);
    cam.startFollow(this.hunter, true, 0.12, 0);

    for (let i = 0; i < H.boarCount; i++) this.spawnBoar();

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys("W,A,S,D,Z,J,SPACE,X,K") as Keys;

    // touch controls on touch devices (add ?touch to the URL to try them with a mouse)
    this.touch = this.sys.game.device.input.touch || new URLSearchParams(location.search).has("touch");
    if (this.touch) this.createTouchControls();

    this.hud = this.add.graphics().setScrollFactor(0).setDepth(1000);
    this.hudText = this.add
      .text(6, 4, "", { fontFamily: "monospace", fontSize: "8px", color: "#ffffff", backgroundColor: "#00000088" })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  update(_time: number, rawDt: number) {
    const dt = Math.min(rawDt, MAX_DT_MS);
    this.syncLayers();
    if (this.hitStopMs > 0) {
      this.hitStopMs -= dt;
      if (this.hitStopMs <= 0) this.anims.resumeAll();
      return;
    }
    if (!this.player.down) this.updatePlayer(dt);
    for (const b of this.boars) this.updateBoar(b, dt);
    this.drawHud();
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    p.cooldownMs = Math.max(0, p.cooldownMs - dt);
    p.swingMs = Math.max(0, p.swingMs - dt);
    p.msSinceSwing += dt;

    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.X) || Phaser.Input.Keyboard.JustDown(k.K)) this.toggleWeapon();
    if (Phaser.Input.Keyboard.JustDown(k.Z) || Phaser.Input.Keyboard.JustDown(k.J) || Phaser.Input.Keyboard.JustDown(k.SPACE)) {
      this.attackQueued = true;
    }

    // a swing always finishes before the hunter moves or swings again
    if (p.swingMs > 0) return;
    if (this.attackQueued && p.cooldownMs === 0) {
      this.attackQueued = false;
      this.swing();
      return;
    }

    const move = this.readMove();
    if (move.x !== 0 || move.y !== 0) {
      p.pos = moveByInput(p.pos, move, H.player.speed, dt, H.field, H.player.depthSpeedRatio);
      if (move.x !== 0) p.facing = move.x > 0 ? 1 : -1;
      this.loop("hunter_walk");
    } else {
      this.loop("hunter_idle");
    }
    this.hunter.setFlipX(p.facing < 0).setPosition(p.pos.x, p.pos.y).setDepth(p.pos.y);
  }

  // Keys and the stick add up; the rules cap the length at 1.
  private readMove(): Vec {
    const c = this.cursors;
    const k = this.keys;
    const x = (c.right.isDown || k.D.isDown ? 1 : 0) - (c.left.isDown || k.A.isDown ? 1 : 0) + this.stickVec.x;
    const y = (c.down.isDown || k.S.isDown ? 1 : 0) - (c.up.isDown || k.W.isDown ? 1 : 0) + this.stickVec.y;
    return { x: Phaser.Math.Clamp(x, -1, 1), y: Phaser.Math.Clamp(y, -1, 1) };
  }

  private toggleWeapon() {
    if (this.player.down) return;
    this.player.weapon = this.player.weapon === "melee" ? "ranged" : "melee";
    this.player.comboStep = 0;
  }

  private swing() {
    const p = this.player;
    const weapon = H.weapons[p.weapon];
    // direct control: consecutive swings inside the window chain, whoever they hit
    p.comboStep = nextComboStep(p.comboStep, p.msSinceSwing, true, p.weapon, H.hit);
    p.msSinceSwing = 0;
    p.cooldownMs = weapon.cooldownMs;
    p.swingMs = weapon.swingMs;
    this.hunter.play(p.weapon === "melee" ? "hunter_attack" : "hunter_throw");
    const kind = p.weapon;
    const comboStep = p.comboStep;
    // the blow lands mid-swing, on whatever is in front at that moment
    this.time.delayedCall(weapon.swingMs * 0.5, () => this.landHit(kind, comboStep));
  }

  private landHit(kind: WeaponKind, comboStep: number) {
    const p = this.player;
    if (p.down) return;
    const live = this.boars.filter((b) => !b.dead).map((b) => ({ pos: b.ai.pos, boar: b }));
    const struck = swingTargets(p.pos, p.facing, live, H.weapons[kind], H.laneTolerance).map((t) => t.boar);
    if (struck.length === 0) return;

    let big = false;
    for (const b of struck) {
      const hit = computeHit(
        { weapon: H.weapons[kind], comboStep, targetVulnerable: isVulnerable(b.ai), attackerX: p.pos.x, targetX: b.ai.pos.x, targetFacing: b.ai.facing },
        H.hit,
      );
      big ||= hit.finisher || hit.counter;
      b.hp -= hit.damage;
      b.hits = recordHit(b.hits, kind);
      b.ai = { ...b.ai, pos: clampToField({ x: b.ai.pos.x + p.facing * hit.knockback, y: b.ai.pos.y }, H.field) };
      b.sprite.setTintFill(0xffffff);
      this.time.delayedCall(70, () => b.sprite.active && b.sprite.clearTint());
      const tags = [hit.counter && "카운터!", hit.backAttack && "백어택!", hit.finisher && "막타!"].filter(Boolean).join(" ");
      this.popText(b.ai.pos.x, b.ai.pos.y - 52, `${hit.damage}${tags ? " " + tags : ""}`, hit.counter || hit.finisher ? "#ffd166" : "#ffffff");
      if (b.hp <= 0) this.killBoar(b);
    }
    // game feel: one freeze per swing, longer and with a shake on big hits
    this.hitStop(big ? H.hitStopMs * 2 : H.hitStopMs);
    if (big) this.cameras.main.shake(120, 0.012);
  }

  private killBoar(b: Boar) {
    b.dead = true;
    const premium = meatGrade(b.hits, H.premiumMaxRangedHits) === "premium";
    this.popText(b.ai.pos.x, b.ai.pos.y - 70, premium ? "삼겹살 ★특급" : "삼겹살 (보통)", premium ? "#ffd166" : "#dddddd", 1400);
    this.tweens.add({
      targets: b.sprite,
      alpha: 0,
      y: b.sprite.y - 6,
      duration: 500,
      onComplete: () => {
        b.sprite.destroy();
        this.boars = this.boars.filter((x) => x !== b);
        this.time.delayedCall(2000, () => this.spawnBoar());
      },
    });
  }

  private updateBoar(b: Boar, dt: number) {
    if (b.dead) return;
    const before = b.ai.phase;
    // a knocked-out hunter is ignored: send the boars wandering
    const seen = this.player.down ? { x: -99999, y: -99999 } : this.player.pos;
    const r = updateCharger(b.ai, seen, dt, H.boar, H.field, Math.random);
    b.ai = r.state;
    if (r.hit) this.hurtPlayer(H.boar.contactDamage, b.ai.facing);
    b.sprite.setPosition(b.ai.pos.x, b.ai.pos.y).setDepth(b.ai.pos.y).setFlipX(b.ai.facing < 0);
    if (b.ai.phase !== before) this.showPhase(b);
  }

  private showPhase(b: Boar) {
    const s = b.sprite;
    this.tweens.killTweensOf(s);
    s.setAlpha(1).clearTint();
    switch (b.ai.phase) {
      case "telegraph":
        s.anims.stop();
        s.setTexture("boar_attack_0").setTint(0xff6060);
        this.tweens.add({ targets: s, alpha: 0.45, yoyo: true, repeat: 3, duration: H.boar.telegraphMs / 8 });
        this.popText(b.ai.pos.x, b.ai.pos.y - 60, "!", "#ff5050", H.boar.telegraphMs);
        break;
      case "charge":
        s.play("boar_charge");
        break;
      case "recover":
        s.anims.stop();
        s.setTexture("boar_idle");
        break;
      case "wander":
        s.play("boar_walk");
        break;
    }
  }

  private hurtPlayer(damage: number, dir: 1 | -1) {
    const p = this.player;
    if (p.down) return;
    p.hp = Math.max(0, p.hp - damage);
    p.pos = clampToField({ x: p.pos.x + dir * 24, y: p.pos.y }, H.field);
    p.swingMs = 0;
    this.hunter.setPosition(p.pos.x, p.pos.y).setTint(0xff8080);
    this.time.delayedCall(150, () => this.hunter.clearTint());
    this.cameras.main.shake(100, 0.01);
    this.popText(p.pos.x, p.pos.y - 50, `-${damage}`, "#ff6060");
    if (p.hp === 0) {
      p.down = true;
      this.hunter.anims.stop();
      this.hunter.setTint(0x777777).setAngle(-90);
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "쓰러졌다… 2초 뒤 다시", { fontFamily: "monospace", fontSize: "12px", color: "#ffffff", backgroundColor: "#000000aa", padding: { x: 6, y: 3 } })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1001);
      this.time.delayedCall(2000, () => this.scene.restart());
    }
  }

  private spawnBoar() {
    const f = H.field;
    let x = f.minX + Math.random() * (f.maxX - f.minX);
    // not right on top of the hunter
    if (Math.abs(x - this.player.pos.x) < 160) x = Math.min(f.maxX, Math.max(f.minX, x + 220 * (x < this.player.pos.x ? -1 : 1)));
    const y = f.minY + Math.random() * (f.maxY - f.minY);
    const sprite = this.add.sprite(x, y, "boar_idle").setOrigin(0.5, FEET.boar);
    sprite.play("boar_walk");
    this.boars.push({ id: this.nextBoarId++, sprite, ai: newCharger({ x, y }), hp: H.boar.maxHp, hits: EMPTY_HIT_LOG, dead: false });
  }

  // Placeholder touch controls (PixelLab art later): a stick that follows the thumb on the left half,
  // and two buttons on the right.
  private createTouchControls() {
    this.input.addPointer(2);
    const ui = (o: Phaser.GameObjects.Arc) => o.setScrollFactor(0).setDepth(1000);
    ui(this.add.circle(STICK.x, STICK.y, STICK.radius, 0x000000, 0.35).setStrokeStyle(1, 0xffffff, 0.6));
    this.stickKnob = ui(this.add.circle(STICK.x, STICK.y, 10, 0xffffff, 0.6));
    const attack = ui(this.add.circle(ATTACK_BTN.x, ATTACK_BTN.y, ATTACK_BTN.radius, 0xc03030, 0.6).setStrokeStyle(1, 0xffffff, 0.8));
    const weapon = ui(this.add.circle(WEAPON_BTN.x, WEAPON_BTN.y, WEAPON_BTN.radius, 0x305080, 0.6).setStrokeStyle(1, 0xffffff, 0.8));
    const label = (x: number, y: number, t: string) =>
      this.add.text(x, y, t, { fontFamily: "monospace", fontSize: "8px", color: "#ffffff" }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    label(ATTACK_BTN.x, ATTACK_BTN.y, "공격");
    label(WEAPON_BTN.x, WEAPON_BTN.y, "무기");
    attack.setInteractive(new Phaser.Geom.Circle(ATTACK_BTN.radius, ATTACK_BTN.radius, ATTACK_BTN.radius + 6), Phaser.Geom.Circle.Contains);
    weapon.setInteractive(new Phaser.Geom.Circle(WEAPON_BTN.radius, WEAPON_BTN.radius, WEAPON_BTN.radius + 6), Phaser.Geom.Circle.Contains);
    attack.on("pointerdown", () => (this.attackQueued = true));
    weapon.on("pointerdown", () => this.toggleWeapon());

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.stickPointer === null && p.x < GAME_WIDTH * 0.45) {
        this.stickPointer = p.id;
        this.updateStick(p);
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.id === this.stickPointer) this.updateStick(p);
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickPointer) return;
      this.stickPointer = null;
      this.stickVec = { x: 0, y: 0 };
      this.stickKnob.setPosition(STICK.x, STICK.y);
    };
    this.input.on("pointerup", release);
    this.input.on("pointerupoutside", release);
  }

  private updateStick(p: Phaser.Input.Pointer) {
    this.stickVec = joystickVector(STICK, { x: p.x, y: p.y }, STICK.radius, STICK.deadZone);
    this.stickKnob.setPosition(STICK.x + this.stickVec.x * STICK.radius, STICK.y + this.stickVec.y * STICK.radius);
  }

  // A texture twice as wide: the image, then its mirror. Tiling that never shows a seam.
  private mirrored(key: string): string {
    const out = `${key}_mirrored`;
    if (this.textures.exists(out)) return out;
    const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
    const canvas = this.textures.createCanvas(out, src.width * 2, src.height)!;
    const ctx = canvas.getContext();
    ctx.drawImage(src, 0, 0);
    ctx.save();
    ctx.translate(src.width * 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
    canvas.refresh();
    return out;
  }

  private loop(key: string) {
    if (this.hunter.anims.currentAnim?.key !== key || !this.hunter.anims.isPlaying) this.hunter.play(key);
  }

  private hitStop(ms: number) {
    this.hitStopMs = Math.max(this.hitStopMs, ms);
    this.anims.pauseAll();
  }

  private popText(x: number, y: number, text: string, color: string, ms = 700) {
    const t = this.add
      .text(x, y, text, { fontFamily: "monospace", fontSize: "10px", color, stroke: "#000000", strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(900);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: ms, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }

  private syncLayers() {
    const sx = this.cameras.main.scrollX;
    for (const l of this.layers) l.tile.tilePositionX = sx * l.factor;
  }

  private drawHud() {
    const p = this.player;
    this.hud.clear();
    this.hud.fillStyle(0x000000, 0.6).fillRect(6, 16, 82, 8);
    this.hud.fillStyle(0xe04040, 1).fillRect(7, 17, (80 * p.hp) / H.player.maxHp, 6);
    const weapon = p.weapon === "melee" ? "근접" : "원거리";
    this.hudText.setText(this.touch ? `무기: ${weapon}` : `방향키/WASD 이동 · Z 공격 · X 무기(${weapon})`);
  }
}
