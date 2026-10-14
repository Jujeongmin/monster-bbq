import Phaser from "phaser";
import { BALANCE } from "../../../shared/balance";
import { isVulnerable, newCharger, updateCharger, type ChargerState } from "../../../shared/hunt/charger";
import {
  EMPTY_HIT_LOG,
  computeHit,
  decidePlayerAction,
  inAttackRange,
  meatGrade,
  nextComboStep,
  recordHit,
  type HitLog,
  type Order,
  type WeaponKind,
} from "../../../shared/hunt/combat";
import { clampToField, frontmost, stepToward } from "../../../shared/hunt/geometry";
import type { Vec } from "../../../shared/hunt/types";
import { artUrl } from "../art";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";

// Belt-scroller hunting prototype (plan 01): tap the ground to walk, tap a boar to fight it.
// Rules live in shared/hunt; this scene only draws them and adds the game feel.
const H = BALANCE.hunt;
// A frame gap after the tab was hidden must not teleport anything (rules are also clamped).
const MAX_DT_MS = 50;
// Where the feet are inside each sprite's canvas (transparent padding underneath). Tune by eye.
const FEET = { hunter: 0.9, boar: 0.75 };
const FRAMES = { idle: 4, walk: 6, attack: 7, throw: 7, boarWalk: 6, boarAttack: 7 };

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
  hp: number;
  weapon: WeaponKind;
  cooldownMs: number;
  swingMs: number;
  comboStep: number;
  msSinceSwing: number;
  lastTargetId: number | null;
  down: boolean;
}

export class HuntScene extends Phaser.Scene {
  private player!: Player;
  private order: Order = { kind: "none" };
  private targetId: number | null = null;
  private boars: Boar[] = [];
  private nextBoarId = 1;
  private hitStopMs = 0;
  private hunter!: Phaser.GameObjects.Sprite;
  private layers: { tile: Phaser.GameObjects.TileSprite; factor: number }[] = [];
  private hud!: Phaser.GameObjects.Graphics;
  private weaponButton!: Phaser.GameObjects.Text;

  constructor() {
    super("hunt");
  }

  // Runs on every start and restart, so a knocked-out hunter comes back fresh.
  init() {
    this.player = {
      pos: { x: 120, y: 190 },
      hp: H.player.maxHp,
      weapon: "melee",
      cooldownMs: 0,
      swingMs: 0,
      comboStep: 0,
      msSinceSwing: Infinity,
      lastTargetId: null,
      down: false,
    };
    this.order = { kind: "none" };
    this.targetId = null;
    this.boars = [];
    this.hitStopMs = 0;
    this.layers = [];
  }

  preload() {
    this.load.image("bg_far", artUrl("test/bg/far.png"));
    this.load.image("bg_mid", artUrl("test/bg/mid.png"));
    this.load.image("bg_near", artUrl("test/bg/near.png"));
    this.load.image("boar_idle", artUrl("test/boar/idle.png"));
    for (let i = 0; i < FRAMES.boarWalk; i++) this.load.image(`boar_walk_${i}`, artUrl(`test/boar/walk_${i}.png`));
    for (let i = 0; i < FRAMES.boarAttack; i++) this.load.image(`boar_attack_${i}`, artUrl(`test/boar/attack_${i}.png`));
    for (const [name, n] of [["idle", FRAMES.idle], ["walk", FRAMES.walk], ["attack", FRAMES.attack], ["throw", FRAMES.throw]] as const) {
      for (let i = 0; i < n; i++) this.load.image(`hunter_${name}_${i}`, artUrl(`test/hunter/${name}_${i}.png`));
    }
  }

  create() {
    for (const [key, factor, depth] of [["bg_far", 0.15, -300], ["bg_mid", 0.4, -200], ["bg_near", 1, -100]] as const) {
      const tile = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, key).setOrigin(0).setScrollFactor(0).setDepth(depth);
      this.layers.push({ tile, factor });
    }

    const frames = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: `${prefix}_${i}` }));
    const swingRate = (n: number) => Math.round((n * 1000) / H.weapons.melee.swingMs);
    this.anims.create({ key: "hunter_idle", frames: frames("hunter_idle", FRAMES.idle), frameRate: 5, repeat: -1 });
    this.anims.create({ key: "hunter_walk", frames: frames("hunter_walk", FRAMES.walk), frameRate: 10, repeat: -1 });
    this.anims.create({ key: "hunter_attack", frames: frames("hunter_attack", FRAMES.attack), frameRate: swingRate(FRAMES.attack) });
    this.anims.create({ key: "hunter_throw", frames: frames("hunter_throw", FRAMES.throw), frameRate: swingRate(FRAMES.throw) });
    this.anims.create({ key: "boar_walk", frames: frames("boar_walk", FRAMES.boarWalk), frameRate: 8, repeat: -1 });
    this.anims.create({ key: "boar_charge", frames: frames("boar_walk", FRAMES.boarWalk), frameRate: 20, repeat: -1 });

    this.hunter = this.add.sprite(this.player.pos.x, this.player.pos.y, "hunter_idle_0").setOrigin(0.5, FEET.hunter);
    this.hunter.play("hunter_idle");

    const cam = this.cameras.main;
    cam.setBounds(0, 0, H.worldWidth, GAME_HEIGHT);
    cam.startFollow(this.hunter, true, 0.12, 0);

    for (let i = 0; i < H.boarCount; i++) this.spawnBoar();

    this.hud = this.add.graphics().setScrollFactor(0).setDepth(1000);
    this.weaponButton = this.add
      .text(GAME_WIDTH - 6, GAME_HEIGHT - 6, "", { fontFamily: "monospace", fontSize: "10px", color: "#ffffff", backgroundColor: "#000000aa", padding: { x: 4, y: 2 } })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.toggleWeapon());
    this.refreshWeaponLabel();
    this.add
      .text(6, 4, "탭: 이동 · 멧돼지 탭: 공격 · 빨갛게 번쩍이면 위아래로 피하기", { fontFamily: "monospace", fontSize: "8px", color: "#ffffff", backgroundColor: "#00000088" })
      .setScrollFactor(0)
      .setDepth(1000);

    this.input.on("pointerdown", (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => this.onTap(p, over));
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

  private onTap(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    if (this.player.down || over.includes(this.weaponButton)) return;
    const tapped = this.boars.filter((b) => !b.dead && over.includes(b.sprite)).map((b) => ({ pos: b.ai.pos, boar: b }));
    const target = frontmost(tapped)?.boar;
    if (target) {
      this.targetId = target.id;
      this.order = { kind: "attack", target: target.ai.pos };
    } else {
      this.targetId = null;
      this.order = { kind: "moveTo", to: clampToField({ x: p.worldX, y: p.worldY }, H.field) };
    }
  }

  private toggleWeapon() {
    if (this.player.down) return;
    this.player.weapon = this.player.weapon === "melee" ? "ranged" : "melee";
    this.player.comboStep = 0;
    this.refreshWeaponLabel();
  }

  private refreshWeaponLabel() {
    this.weaponButton.setText(this.player.weapon === "melee" ? "근접 ⇄ 원거리" : "원거리 ⇄ 근접");
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    p.cooldownMs = Math.max(0, p.cooldownMs - dt);
    p.swingMs = Math.max(0, p.swingMs - dt);
    p.msSinceSwing += dt;

    // keep an attack order pointed at the boar's current position; drop it once the boar is gone
    if (this.order.kind === "attack") {
      const target = this.liveBoar(this.targetId);
      this.order = target ? { kind: "attack", target: target.ai.pos } : { kind: "none" };
    }
    // a swing always finishes before the next order is followed
    if (p.swingMs > 0) return;

    const weapon = H.weapons[p.weapon];
    const action = decidePlayerAction(p.pos, this.order, weapon, H.laneTolerance);
    if (action.kind === "move") {
      const step = stepToward(p.pos, action.to, (H.player.speed * dt) / 1000);
      if (step.pos.x !== p.pos.x) this.hunter.setFlipX(step.pos.x < p.pos.x);
      p.pos = step.pos;
      if (step.arrived && this.order.kind === "moveTo") this.order = { kind: "none" };
      this.loop("hunter_walk");
    } else if (action.kind === "attack" && this.targetId !== null) {
      const target = this.liveBoar(this.targetId)!;
      this.hunter.setFlipX(target.ai.pos.x < p.pos.x);
      if (p.cooldownMs === 0) this.swing(target);
      else this.loop("hunter_idle");
    } else {
      this.loop("hunter_idle");
    }
    this.hunter.setPosition(p.pos.x, p.pos.y).setDepth(p.pos.y);
  }

  private swing(target: Boar) {
    const p = this.player;
    const weapon = H.weapons[p.weapon];
    p.comboStep = nextComboStep(p.comboStep, p.msSinceSwing, p.lastTargetId === target.id, p.weapon, H.hit);
    p.lastTargetId = target.id;
    p.msSinceSwing = 0;
    p.cooldownMs = weapon.cooldownMs;
    p.swingMs = weapon.swingMs;
    this.hunter.play(p.weapon === "melee" ? "hunter_attack" : "hunter_throw");
    const kind = p.weapon;
    const comboStep = p.comboStep;
    // the blow lands mid-swing
    this.time.delayedCall(weapon.swingMs * 0.5, () => this.landHit(target.id, kind, comboStep));
  }

  private landHit(boarId: number, kind: WeaponKind, comboStep: number) {
    const b = this.liveBoar(boarId);
    const p = this.player;
    if (!b || p.down) return;
    // the boar may have run out of reach during the swing: a whiff
    if (!inAttackRange(p.pos, b.ai.pos, H.weapons[kind], H.laneTolerance)) return;

    const hit = computeHit(
      { weapon: H.weapons[kind], comboStep, targetVulnerable: isVulnerable(b.ai), attackerX: p.pos.x, targetX: b.ai.pos.x, targetFacing: b.ai.facing },
      H.hit,
    );
    b.hp -= hit.damage;
    b.hits = recordHit(b.hits, kind);
    const away = b.ai.pos.x >= p.pos.x ? 1 : -1;
    b.ai = { ...b.ai, pos: clampToField({ x: b.ai.pos.x + away * hit.knockback, y: b.ai.pos.y }, H.field) };

    // game feel: freeze, flash, shake on big hits, pop the number and the tags
    this.hitStop(hit.finisher || hit.counter ? H.hitStopMs * 2 : H.hitStopMs);
    b.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => b.sprite.active && b.sprite.clearTint());
    if (hit.finisher || hit.counter) this.cameras.main.shake(120, 0.012);
    const tags = [hit.counter && "카운터!", hit.backAttack && "백어택!", hit.finisher && "막타!"].filter(Boolean).join(" ");
    this.popText(b.ai.pos.x, b.ai.pos.y - 52, `${hit.damage}${tags ? " " + tags : ""}`, hit.counter || hit.finisher ? "#ffd166" : "#ffffff");

    if (b.hp <= 0) this.killBoar(b);
  }

  private killBoar(b: Boar) {
    b.dead = true;
    b.sprite.disableInteractive();
    if (this.targetId === b.id) {
      this.targetId = null;
      this.order = { kind: "none" };
    }
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
      this.order = { kind: "none" };
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
    // tap area: the body inside the 92x92 canvas, a bit generous for fingers
    sprite.setInteractive(new Phaser.Geom.Rectangle(4, 12, 84, 62), Phaser.Geom.Rectangle.Contains);
    sprite.play("boar_walk");
    this.boars.push({ id: this.nextBoarId++, sprite, ai: newCharger({ x, y }), hp: H.boar.maxHp, hits: EMPTY_HIT_LOG, dead: false });
  }

  private liveBoar(id: number | null): Boar | undefined {
    return id === null ? undefined : this.boars.find((b) => b.id === id && !b.dead);
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
  }
}
