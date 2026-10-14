import Phaser from "phaser";
import { BALANCE } from "../../../shared/balance";
import { isVulnerable, newCharger, updateCharger, type ChargerState } from "../../../shared/hunt/charger";
import { EMPTY_HIT_LOG, computeHit, meatGrade, nextComboStep, recordHit, swingTargets, type HitLog, type WeaponKind } from "../../../shared/hunt/combat";
import { clampToField } from "../../../shared/hunt/geometry";
import { fireHarpoon, harpoonDone, harpoonHit, reelStep, stepHarpoon, type Harpoon } from "../../../shared/hunt/harpoon";
import type { Field, Vec } from "../../../shared/hunt/types";
import { artUrl } from "../art";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { joystickVector } from "../joystick";

// SPIKE (compare with HuntScene, open with ?mode=platform): the same Dave-style aim, harpoon and slash,
// but as a platformer — gravity, jumping, ledges at different heights. Boars patrol their own ledge,
// so "same lane" means "same ledge". Platform art is a strip cut from the test forest layer.
const H = BALANCE.hunt;
const MAX_DT_MS = 50;
const WORLD = { w: 1600, h: 448 };
const GRAVITY = 900;
// peak height = JUMP_SPEED^2 / (2 * GRAVITY) ≈ 89 px, above every ledge step (≤ 72 px)
const JUMP_SPEED = 400;
const RUN_SPEED = 95;
const FEET = { hunter: 0.9, boar: 0.75 };
const FRAMES = { idle: 4, walk: 6, attack: 7, throw: 7, boarWalk: 6 };
// Ledges: left x, top y (where feet stand), width. The first is the ground.
const LEDGES = [
  { x: 0, y: 424, w: 1600 },
  { x: 260, y: 352, w: 150 },
  { x: 470, y: 284, w: 140 },
  { x: 680, y: 220, w: 220 },
  { x: 990, y: 300, w: 180 },
  { x: 1250, y: 360, w: 220 },
];
// [ledge index, x] for each boar
const BOAR_SPOTS: [number, number][] = [
  [0, 520],
  [3, 790],
  [4, 1080],
  [0, 1380],
];
const STICK = { x: 52, y: 176, radius: 26, deadZone: 0.2 };
const SLASH_BTN = { x: 362, y: 186, radius: 20 };
const JUMP_BTN = { x: 318, y: 200, radius: 14 };

interface Boar {
  id: number;
  ledge: number;
  sprite: Phaser.GameObjects.Sprite;
  ai: ChargerState;
  hp: number;
  hits: HitLog;
  dead: boolean;
}

type Keys = Record<"W" | "A" | "S" | "D" | "SPACE" | "Z" | "X", Phaser.Input.Keyboard.Key>;

function ledgeField(i: number): Field {
  const l = LEDGES[i];
  return { minX: l.x + 12, maxX: l.x + l.w - 12, minY: l.y, maxY: l.y };
}

export class PlatformScene extends Phaser.Scene {
  private hunter!: Phaser.Physics.Arcade.Sprite;
  private facing: 1 | -1 = 1;
  private hp = H.player.maxHp;
  private down = false;
  private cooldownMs = 0;
  private harpoonCooldownMs = 0;
  private swingMs = 0;
  private comboStep = 0;
  private msSinceSwing = Infinity;
  private boars: Boar[] = [];
  private nextBoarId = 1;
  private hitStopMs = 0;
  private harpoon: Harpoon | null = null;
  private reelingId: number | null = null;
  private slashQueued = false;
  private jumpQueued = false;
  private shotQueued: Vec | null = null;
  private touch = false;
  private stickPointer: number | null = null;
  private stickVec: Vec = { x: 0, y: 0 };
  private stickKnob!: Phaser.GameObjects.Arc;
  private aimPointer: number | null = null;
  private aimScreen: Vec | null = null;
  private layers: { tile: Phaser.GameObjects.TileSprite; factor: number; factorY: number; anchorY: number }[] = [];
  private rope!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Keys;

  constructor() {
    super("platform");
  }

  init() {
    this.hp = H.player.maxHp;
    this.down = false;
    this.cooldownMs = this.harpoonCooldownMs = this.swingMs = 0;
    this.comboStep = 0;
    this.msSinceSwing = Infinity;
    this.boars = [];
    this.hitStopMs = 0;
    this.harpoon = null;
    this.reelingId = null;
    this.slashQueued = this.jumpQueued = false;
    this.shotQueued = null;
    this.stickPointer = this.aimPointer = null;
    this.stickVec = { x: 0, y: 0 };
    this.aimScreen = null;
    this.layers = [];
  }

  preload() {
    this.load.image("bg_far", artUrl("test/bg/far.png"));
    this.load.image("bg_mid", artUrl("test/bg/mid.png"));
    this.load.image("bg_near", artUrl("test/bg/near.png"));
    this.load.image("boar_idle", artUrl("test/boar/idle.png"));
    this.load.image("boar_attack_0", artUrl("test/boar/attack_0.png"));
    for (let i = 0; i < FRAMES.boarWalk; i++) this.load.image(`boar_walk_${i}`, artUrl(`test/boar/walk_${i}.png`));
    for (const [name, n] of [["idle", FRAMES.idle], ["walk", FRAMES.walk], ["attack", FRAMES.attack], ["throw", FRAMES.throw]] as const) {
      for (let i = 0; i < n; i++) this.load.image(`hunter_${name}_${i}`, artUrl(`test/hunter/${name}_${i}.png`));
    }
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD.w, WORLD.h);
    this.physics.world.gravity.y = GRAVITY;

    // Sky colour behind the far layer when the camera is high up.
    this.cameras.main.setBackgroundColor(0xa8ebf4);
    // [texture, parallax x, parallax y, screen y when the camera is at the bottom of the world, depth].
    // At the bottom the mid layer's tree bases sit just behind the ground; higher up both layers sink.
    const bottomScroll = WORLD.h - GAME_HEIGHT;
    for (const [key, factor, factorY, yAtBottom, depth] of [
      ["bg_far", 0.15, 0.25, -20, -300],
      ["bg_mid", 0.35, 0.6, 18, -200],
    ] as const) {
      const tex = this.mirrored(key);
      const tile = this.add.tileSprite(0, yAtBottom, GAME_WIDTH, GAME_HEIGHT, tex).setOrigin(0).setScrollFactor(0).setDepth(depth);
      this.layers.push({ tile, factor, factorY, anchorY: yAtBottom + bottomScroll * factorY });
    }

    // ledges: a grass-and-soil strip cut from the test forest layer, tiled
    const strip = this.cutStrip("bg_near", 0, 158, 128, 34);
    const solids = this.physics.add.staticGroup();
    for (const l of LEDGES) {
      const h = l === LEDGES[0] ? WORLD.h - l.y + 4 : 34;
      this.add.tileSprite(l.x, l.y - 4, l.w, h, strip).setOrigin(0).setDepth(-50);
      const body = this.add.zone(l.x + l.w / 2, l.y + 6, l.w, 12);
      solids.add(body);
    }

    const frames = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: `${prefix}_${i}` }));
    if (!this.anims.exists("p_hunter_idle")) {
      this.anims.create({ key: "p_hunter_idle", frames: frames("hunter_idle", FRAMES.idle), frameRate: 5, repeat: -1 });
      this.anims.create({ key: "p_hunter_walk", frames: frames("hunter_walk", FRAMES.walk), frameRate: 10, repeat: -1 });
      this.anims.create({ key: "p_hunter_attack", frames: frames("hunter_attack", FRAMES.attack), frameRate: Math.round((FRAMES.attack * 1000) / H.weapons.melee.swingMs) });
      this.anims.create({ key: "p_hunter_throw", frames: frames("hunter_throw", FRAMES.throw), frameRate: 24 });
      this.anims.create({ key: "p_boar_walk", frames: frames("boar_walk", FRAMES.boarWalk), frameRate: 8, repeat: -1 });
      this.anims.create({ key: "p_boar_charge", frames: frames("boar_walk", FRAMES.boarWalk), frameRate: 20, repeat: -1 });
    }

    this.hunter = this.physics.add.sprite(120, 380, "hunter_idle_0").setOrigin(0.5, FEET.hunter);
    this.hunter.setSize(16, 32).setOffset(24, 26).setCollideWorldBounds(true);
    this.hunter.play("p_hunter_idle");
    // one-way ledges: jump up through them, land on top
    this.physics.add.collider(this.hunter, solids, undefined, (_h, ledge) => {
      const body = this.hunter.body as Phaser.Physics.Arcade.Body;
      const top = ((ledge as Phaser.GameObjects.Zone).body as Phaser.Physics.Arcade.StaticBody).top;
      return body.velocity.y >= 0 && body.bottom - body.velocity.y / 60 <= top + 2;
    });
    this.rope = this.add.graphics().setDepth(950);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.w, WORLD.h);
    cam.startFollow(this.hunter, true, 0.12, 0.12);

    for (const [ledge, x] of BOAR_SPOTS) this.spawnBoar(ledge, x);

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys("W,A,S,D,SPACE,Z,X") as Keys;

    this.touch = this.sys.game.device.input.touch || new URLSearchParams(location.search).has("touch");
    if (this.touch) this.createTouchControls();
    else {
      this.input.mouse?.disableContextMenu();
      this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) this.slashQueued = true;
        else this.shotQueued = this.toWorld(p.x, p.y);
      });
    }

    this.hud = this.add.graphics().setScrollFactor(0).setDepth(1000);
    this.add
      .text(6, 4, this.touch ? "플랫폼형 시제품" : "플랫폼형 · A/D 이동 · W/스페이스 점프 · 마우스 조준 · 좌클릭 작살 · 우클릭 베기", {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#ffffff",
        backgroundColor: "#00000088",
      })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  update(_t: number, rawDt: number) {
    const dt = Math.min(rawDt, MAX_DT_MS);
    const cam = this.cameras.main;
    for (const l of this.layers) {
      l.tile.tilePositionX = cam.scrollX * l.factor;
      l.tile.y = l.anchorY - cam.scrollY * l.factorY;
    }
    if (this.hitStopMs > 0) {
      this.hitStopMs -= dt;
      this.physics.world.pause();
      if (this.hitStopMs <= 0) {
        this.anims.resumeAll();
        this.physics.world.resume();
      }
      return;
    }
    if (!this.down) this.updatePlayer(dt);
    this.updateHarpoon(dt);
    for (const b of this.boars) this.updateBoar(b, dt);
    this.drawRope();
    this.hud.clear();
    this.hud.fillStyle(0x000000, 0.6).fillRect(6, 16, 82, 8);
    this.hud.fillStyle(0xe04040, 1).fillRect(7, 17, (80 * this.hp) / H.player.maxHp, 6);
  }

  private feet(): Vec {
    return { x: this.hunter.x, y: this.hunter.body!.bottom };
  }

  private hand(): Vec {
    const f = this.feet();
    return { x: f.x + this.facing * H.harpoon.hand.x, y: f.y - H.harpoon.hand.y };
  }

  private updatePlayer(dt: number) {
    this.cooldownMs = Math.max(0, this.cooldownMs - dt);
    this.harpoonCooldownMs = Math.max(0, this.harpoonCooldownMs - dt);
    this.swingMs = Math.max(0, this.swingMs - dt);
    this.msSinceSwing += dt;
    const body = this.hunter.body as Phaser.Physics.Arcade.Body;
    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.W) || Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(this.cursors.up)) this.jumpQueued = true;
    if (Phaser.Input.Keyboard.JustDown(k.Z)) this.slashQueued = true;
    if (Phaser.Input.Keyboard.JustDown(k.X)) this.shotQueued = { x: this.hunter.x + this.facing * 100, y: this.hand().y };

    if (!this.touch) {
      const aim = this.toWorld(this.input.activePointer.x, this.input.activePointer.y);
      this.facing = aim.x >= this.hunter.x ? 1 : -1;
    }

    const onGround = body.blocked.down;
    if (this.jumpQueued) {
      this.jumpQueued = false;
      if (onGround) body.setVelocityY(-JUMP_SPEED);
    }

    if (this.swingMs > 0) {
      body.setVelocityX(0);
      this.hunter.setFlipX(this.facing < 0);
      return;
    }
    if (this.slashQueued && this.cooldownMs === 0) {
      this.slashQueued = false;
      this.slash();
      body.setVelocityX(0);
      return;
    }
    if (this.shotQueued) {
      const at = this.shotQueued;
      this.shotQueued = null;
      if (this.harpoonCooldownMs === 0 && !this.harpoon && this.reelingId === null) {
        this.facing = at.x >= this.hunter.x ? 1 : -1;
        this.harpoonCooldownMs = H.harpoon.cooldownMs;
        this.swingMs = H.harpoon.throwLockMs;
        this.hunter.setFlipX(this.facing < 0).play("p_hunter_throw");
        this.harpoon = fireHarpoon(this.hand(), at, this.facing);
        body.setVelocityX(0);
        return;
      }
    }

    const c = this.cursors;
    const x = Phaser.Math.Clamp((c.right.isDown || k.D.isDown ? 1 : 0) - (c.left.isDown || k.A.isDown ? 1 : 0) + this.stickVec.x, -1, 1);
    body.setVelocityX(x * RUN_SPEED);
    if (this.touch && x !== 0 && this.aimPointer === null) this.facing = x > 0 ? 1 : -1;
    const anim = x !== 0 && onGround ? "p_hunter_walk" : "p_hunter_idle";
    if (this.hunter.anims.currentAnim?.key !== anim || !this.hunter.anims.isPlaying) this.hunter.play(anim);
    // drawn in front of a boar on the same ledge, so the hunter never disappears behind it
    this.hunter.setFlipX(this.facing < 0).setDepth(this.feet().y + 1);
  }

  private slash() {
    this.comboStep = nextComboStep(this.comboStep, this.msSinceSwing, true, "melee", H.hit);
    this.msSinceSwing = 0;
    this.cooldownMs = H.weapons.melee.cooldownMs;
    this.swingMs = H.weapons.melee.swingMs;
    this.hunter.x += this.facing * H.hit.knockback;
    this.hunter.setFlipX(this.facing < 0).play("p_hunter_attack");
    const step = this.comboStep;
    this.time.delayedCall(H.weapons.melee.swingMs * 0.5, () => this.landSlash(step));
  }

  private landSlash(comboStep: number) {
    if (this.down) return;
    const me = this.feet();
    const live = this.boars.filter((b) => !b.dead && b.id !== this.reelingId).map((b) => ({ pos: b.ai.pos, boar: b }));
    const struck = swingTargets(me, this.facing, live, H.weapons.melee, H.laneTolerance).map((t) => t.boar);
    if (struck.length === 0) return;
    let big = false;
    for (const b of struck) {
      const hit = computeHit({ weapon: H.weapons.melee, comboStep, targetVulnerable: isVulnerable(b.ai), attackerX: me.x, targetX: b.ai.pos.x, targetFacing: b.ai.facing }, H.hit);
      big ||= hit.finisher || hit.counter;
      b.ai = { ...b.ai, pos: clampToField({ x: b.ai.pos.x + this.facing * hit.knockback, y: b.ai.pos.y }, ledgeField(b.ledge)) };
      this.applyHit(b, "melee", hit.damage, [hit.counter && "카운터!", hit.backAttack && "백어택!", hit.finisher && "막타!"]);
    }
    this.hitStop(big ? H.hitStopMs * 2 : H.hitStopMs);
    if (big) this.cameras.main.shake(120, 0.012);
  }

  private updateHarpoon(dt: number) {
    if (this.harpoon) {
      const h = stepHarpoon(this.harpoon, H.harpoon.speed, dt);
      const live = this.boars.filter((b) => !b.dead).map((b) => ({ pos: b.ai.pos, boar: b }));
      const struck = harpoonHit(h.tip, live, H.harpoon.bodyOffsetY, H.harpoon.hitRadius)?.boar;
      if (struck) {
        this.harpoon = null;
        const me = this.feet();
        const hit = computeHit({ weapon: H.weapons.ranged, comboStep: 1, targetVulnerable: isVulnerable(struck.ai), attackerX: me.x, targetX: struck.ai.pos.x, targetFacing: struck.ai.facing }, H.hit);
        this.applyHit(struck, "ranged", hit.damage, [hit.counter && "카운터!", hit.backAttack && "백어택!"]);
        this.hitStop(H.hitStopMs);
        if (!struck.dead) {
          this.reelingId = struck.id;
          this.tweens.killTweensOf(struck.sprite);
          struck.sprite.setAlpha(1).clearTint().anims.stop();
          struck.sprite.setTexture("boar_idle");
        }
      } else this.harpoon = harpoonDone(h, H.harpoon.range) ? null : h;
    }
    if (this.reelingId !== null) {
      const b = this.boars.find((x) => x.id === this.reelingId && !x.dead);
      if (!b || this.down) {
        this.reelingId = null;
        return;
      }
      // reeled through the air toward the hunter, then dropped onto the hunter's ledge
      const world = { minX: 0, maxX: WORLD.w, minY: 0, maxY: WORLD.h };
      const r = reelStep(b.ai.pos, this.feet(), H.harpoon.pullSpeed, dt, H.harpoon.pullStopDist, world);
      b.ai = { ...b.ai, pos: r.pos };
      b.sprite.setPosition(r.pos.x, r.pos.y).setDepth(r.pos.y);
      if (r.done) {
        this.reelingId = null;
        b.ledge = this.ledgeUnder(this.feet());
        const f = ledgeField(b.ledge);
        b.ai = { ...b.ai, pos: clampToField(r.pos, f), phase: "recover", phaseMs: H.boar.recoverMs - H.harpoon.dazeMs, facing: this.hunter.x >= r.pos.x ? 1 : -1 };
        this.popText(r.pos.x, r.pos.y - 56, "기회!", "#7fe0ff", 600);
      }
    }
  }

  private ledgeUnder(p: Vec): number {
    let best = 0;
    for (let i = 0; i < LEDGES.length; i++) {
      const l = LEDGES[i];
      if (p.x >= l.x && p.x <= l.x + l.w && Math.abs(l.y - p.y) < Math.abs(LEDGES[best].y - p.y)) best = i;
    }
    return best;
  }

  private applyHit(b: Boar, kind: WeaponKind, damage: number, tagList: (string | false)[]) {
    b.hp -= damage;
    b.hits = recordHit(b.hits, kind);
    b.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => b.sprite.active && b.sprite.clearTint());
    const tags = tagList.filter(Boolean).join(" ");
    this.popText(b.ai.pos.x, b.ai.pos.y - 52, `${damage}${tags ? " " + tags : ""}`, tags ? "#ffd166" : "#ffffff");
    if (b.hp <= 0) this.killBoar(b);
  }

  private killBoar(b: Boar) {
    b.dead = true;
    if (this.reelingId === b.id) this.reelingId = null;
    const premium = meatGrade(b.hits, H.premiumMaxRangedHits) === "premium";
    this.popText(b.ai.pos.x, b.ai.pos.y - 70, premium ? "삼겹살 ★특급" : "삼겹살 (보통)", premium ? "#ffd166" : "#dddddd", 1400);
    const spot = BOAR_SPOTS[(b.id - 1) % BOAR_SPOTS.length];
    this.tweens.add({
      targets: b.sprite,
      alpha: 0,
      duration: 500,
      onComplete: () => {
        b.sprite.destroy();
        this.boars = this.boars.filter((x) => x !== b);
        this.time.delayedCall(2500, () => this.spawnBoar(spot[0], spot[1]));
      },
    });
  }

  private updateBoar(b: Boar, dt: number) {
    if (b.dead || b.id === this.reelingId) return;
    const before = b.ai.phase;
    const seen = this.down ? { x: -99999, y: -99999 } : this.feet();
    const r = updateCharger(b.ai, seen, dt, H.boar, ledgeField(b.ledge), Math.random);
    b.ai = r.state;
    if (r.hit) this.hurt(H.boar.contactDamage, b.ai.facing);
    b.sprite.setPosition(b.ai.pos.x, b.ai.pos.y).setDepth(b.ai.pos.y).setFlipX(b.ai.facing < 0);
    if (b.ai.phase !== before) {
      const s = b.sprite;
      this.tweens.killTweensOf(s);
      s.setAlpha(1).clearTint();
      if (b.ai.phase === "telegraph") {
        s.anims.stop();
        s.setTexture("boar_attack_0").setTint(0xff6060);
        this.tweens.add({ targets: s, alpha: 0.45, yoyo: true, repeat: 3, duration: H.boar.telegraphMs / 8 });
        this.popText(b.ai.pos.x, b.ai.pos.y - 60, "!", "#ff5050", H.boar.telegraphMs);
      } else if (b.ai.phase === "charge") s.play("p_boar_charge");
      else if (b.ai.phase === "recover") {
        s.anims.stop();
        s.setTexture("boar_idle");
      } else s.play("p_boar_walk");
    }
  }

  private hurt(damage: number, dir: 1 | -1) {
    if (this.down) return;
    this.hp = Math.max(0, this.hp - damage);
    const body = this.hunter.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(dir * 140, -160);
    this.swingMs = 0;
    this.hunter.setTint(0xff8080);
    this.time.delayedCall(150, () => this.hunter.clearTint());
    this.cameras.main.shake(100, 0.01);
    this.popText(this.hunter.x, this.feet().y - 50, `-${damage}`, "#ff6060");
    if (this.hp === 0) {
      this.down = true;
      this.harpoon = null;
      this.reelingId = null;
      this.hunter.anims.stop();
      this.hunter.setTint(0x777777).setAngle(-90);
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "쓰러졌다… 2초 뒤 다시", { fontFamily: "monospace", fontSize: "12px", color: "#ffffff", backgroundColor: "#000000aa", padding: { x: 6, y: 3 } }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
      this.time.delayedCall(2000, () => this.scene.restart());
    }
  }

  private spawnBoar(ledge: number, x: number) {
    const y = LEDGES[ledge].y;
    const sprite = this.add.sprite(x, y, "boar_idle").setOrigin(0.5, FEET.boar);
    sprite.play("p_boar_walk");
    this.boars.push({ id: this.nextBoarId++, ledge, sprite, ai: newCharger({ x, y }), hp: H.boar.maxHp, hits: EMPTY_HIT_LOG, dead: false });
  }

  private createTouchControls() {
    this.input.addPointer(2);
    const ui = (o: Phaser.GameObjects.Arc) => o.setScrollFactor(0).setDepth(1000);
    ui(this.add.circle(STICK.x, STICK.y, STICK.radius, 0x000000, 0.35).setStrokeStyle(1, 0xffffff, 0.6));
    this.stickKnob = ui(this.add.circle(STICK.x, STICK.y, 10, 0xffffff, 0.6));
    const button = (b: { x: number; y: number; radius: number }, color: number, text: string, onPress: () => void) => {
      const c = ui(this.add.circle(b.x, b.y, b.radius, color, 0.6).setStrokeStyle(1, 0xffffff, 0.8));
      this.add.text(b.x, b.y, text, { fontFamily: "monospace", fontSize: "8px", color: "#ffffff" }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
      c.setInteractive(new Phaser.Geom.Circle(b.radius, b.radius, b.radius + 5), Phaser.Geom.Circle.Contains).on("pointerdown", onPress);
    };
    button(SLASH_BTN, 0xc03030, "베기", () => (this.slashQueued = true));
    button(JUMP_BTN, 0x30a050, "점프", () => (this.jumpQueued = true));
    const onButton = (p: Phaser.Input.Pointer) =>
      [SLASH_BTN, JUMP_BTN].some((b) => Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) <= b.radius + 5);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (onButton(p)) return;
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
      if (p.id === this.aimPointer) this.aimScreen = { x: p.x, y: p.y };
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

  private drawRope() {
    const g = this.rope;
    g.clear();
    if (this.down) return;
    const hand = this.hand();
    let end: Vec | null = this.harpoon ? this.harpoon.tip : null;
    const reeled = this.boars.find((b) => b.id === this.reelingId && !b.dead);
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

  private hitStop(ms: number) {
    this.hitStopMs = Math.max(this.hitStopMs, ms);
    this.anims.pauseAll();
  }

  private popText(x: number, y: number, text: string, color: string, ms = 700) {
    const t = this.add.text(x, y, text, { fontFamily: "monospace", fontSize: "10px", color, stroke: "#000000", strokeThickness: 3 }).setOrigin(0.5).setDepth(900);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: ms, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
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

  // A rectangle cut out of an image, as its own texture (for the ledge strips).
  private cutStrip(key: string, x: number, y: number, w: number, h: number): string {
    const out = `${key}_strip`;
    if (this.textures.exists(out)) return out;
    const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
    const canvas = this.textures.createCanvas(out, w, h)!;
    canvas.getContext().drawImage(src, x, y, w, h, 0, 0, w, h);
    canvas.refresh();
    return out;
  }
}
