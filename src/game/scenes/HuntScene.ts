import Phaser from "phaser";
import { artUrl } from "../art";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";

// Asset test from the side-view hunting prototype: three parallax layers and a boar that walks and
// charges. The boar sprite has ~23px of transparent padding under its feet, hence the ground line.
const GROUND_Y = 195;
const WALK_SPEED = 70;
const PARALLAX = { far: 0.15, mid: 0.4, near: 1 };
const WALK_FRAMES = 6;
const ATTACK_FRAMES = 7;

type Keys = Record<"A" | "D" | "SPACE", Phaser.Input.Keyboard.Key>;

export class HuntScene extends Phaser.Scene {
  private far!: Phaser.GameObjects.TileSprite;
  private mid!: Phaser.GameObjects.TileSprite;
  private near!: Phaser.GameObjects.TileSprite;
  private boar!: Phaser.GameObjects.Sprite;
  private attacking = false;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Keys;

  constructor() {
    super("hunt");
  }

  preload() {
    this.load.image("bg_far", artUrl("test/bg/far.png"));
    this.load.image("bg_mid", artUrl("test/bg/mid.png"));
    this.load.image("bg_near", artUrl("test/bg/near.png"));
    this.load.image("boar_idle", artUrl("test/boar/idle.png"));
    for (let i = 0; i < WALK_FRAMES; i++) this.load.image(`boar_walk_${i}`, artUrl(`test/boar/walk_${i}.png`));
    for (let i = 0; i < ATTACK_FRAMES; i++) this.load.image(`boar_attack_${i}`, artUrl(`test/boar/attack_${i}.png`));
  }

  create() {
    this.far = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "bg_far").setOrigin(0);
    this.mid = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "bg_mid").setOrigin(0);
    this.near = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "bg_near").setOrigin(0).setDepth(20);

    this.anims.create({
      key: "boar_walk",
      frames: Array.from({ length: WALK_FRAMES }, (_, i) => ({ key: `boar_walk_${i}` })),
      frameRate: 9,
      repeat: -1,
    });
    this.anims.create({
      key: "boar_attack",
      frames: Array.from({ length: ATTACK_FRAMES }, (_, i) => ({ key: `boar_attack_${i}` })),
      frameRate: 12,
      repeat: 0,
    });

    this.boar = this.add.sprite(170, GROUND_Y, "boar_idle").setOrigin(0.5, 1).setDepth(30);
    this.boar.on(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + "boar_attack", () => {
      this.attacking = false;
    });

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys("A,D,SPACE") as Keys;

    this.add
      .text(6, 4, "← → / A D : move    SPACE : attack", {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#ffffff",
        backgroundColor: "#00000088",
      })
      .setDepth(100);
  }

  update(_time: number, deltaMs: number) {
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;

    if (!this.attacking && Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
      this.attacking = true;
      this.boar.play("boar_attack");
    }

    const dir = this.attacking ? 0 : (right ? 1 : 0) - (left ? 1 : 0);
    if (dir !== 0) {
      this.boar.setFlipX(dir < 0);
      if (this.boar.anims.currentAnim?.key !== "boar_walk" || !this.boar.anims.isPlaying) this.boar.play("boar_walk");
    } else if (!this.attacking) {
      this.boar.anims.stop();
      this.boar.setTexture("boar_idle");
    }

    const dx = (dir * WALK_SPEED * deltaMs) / 1000;
    this.far.tilePositionX += dx * PARALLAX.far;
    this.mid.tilePositionX += dx * PARALLAX.mid;
    this.near.tilePositionX += dx * PARALLAX.near;
  }
}
