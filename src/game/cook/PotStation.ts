import Phaser from "phaser";
import { BALANCE } from "../../../shared/balance";
import { parseItemKey } from "../../../shared/content/items";
import { addToPot, judgePot, newPot, setDial, skim, stepPot, toggleLid, type Dial, type Pot } from "../../../shared/cooking/pot";
import { t } from "../../i18n";
import { cookedKey, rawKey } from "./art";
import type { CookHost, Station } from "./host";
import { TEXT_SMALL } from "../ui";

// The stew pot (cooking-service design 2), seen from above. The rules live in shared/cooking/pot.
//  - drag from the tray into the broth: in it goes (a splash)
//  - the dial: drag it round (or tap it) through off, low, mid, high
//  - the lid beside the pot: tap to cover or uncover (covered boils sooner, hides the broth, spills sooner)
//  - holding the ladle, drag across the broth: skim off the scum; drag from the broth to the plate: serve
// Heat shows as steam and bubbles (lazy at a simmer, rolling at a boil), scum as the foamy broth picture
// fading in, a spill as froth over the rim.
const S = 1.3;
const BROTH_CX = 112; // broth surface centre and radii inside the pot sprite (measured)
const BROTH_CY = 93;
const RX = 70;
const RY = 56;
const DIAL_ANGLES = [0, 60, 120, 180]; // off, low, mid, high
const SKIM_PX = 40; // a stroke this long across the broth is one pass of the ladle
const SLOTS = [
  { x: -26, y: -8 },
  { x: 24, y: -12 },
  { x: 0, y: 16 },
];
const P = BALANCE.cooking.pot;

export class PotStation implements Station {
  readonly method = "boil" as const;
  private pot: Pot = newPot();
  private root: Phaser.GameObjects.Container;
  private clear: Phaser.GameObjects.Image;
  private foam: Phaser.GameObjects.Image;
  private lidOn: Phaser.GameObjects.Image;
  private lidAside: Phaser.GameObjects.Image;
  private dial: Phaser.GameObjects.Image;
  private dialLabels: Phaser.GameObjects.Text[] = [];
  private items: { key: string; raw: Phaser.GameObjects.Image; cooked: Phaser.GameObjects.Image }[] = [];
  private steam: Phaser.GameObjects.Particles.ParticleEmitter;
  private bubbles: Phaser.GameObjects.Particles.ParticleEmitter;
  private splash: Phaser.GameObjects.Particles.ParticleEmitter;
  private froth: Phaser.GameObjects.Particles.ParticleEmitter;
  private statusText: Phaser.GameObjects.Text;
  private cx: number;
  private cy: number;
  private stroke: { x: number; y: number; run: number; startedInBroth: boolean } | null = null;
  private dialDrag = false;
  private dialMoved = false;
  // the knob's angle while it is being turned (0 = off .. 180 = high), and the finger's last angle
  private knobDeg = 0;
  private lastPointerDeg: number | null = null;
  private boilOversSeen = 0;
  private visible = true;
  private fx: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private scene: Phaser.Scene,
    private host: CookHost,
    x: number,
    y: number,
    rightX: number,
  ) {
    this.root = scene.add.container(0, 0);
    this.clear = scene.add.image(x, y, "pot_clear").setOrigin(0).setScale(S);
    // the foamy picture is drawn 2 px further right in its own frame
    this.foam = scene.add.image(x - 2 * S, y, "pot_foam").setOrigin(0).setScale(S).setAlpha(0);
    this.cx = x + BROTH_CX * S;
    this.cy = y + BROTH_CY * S;
    this.lidOn = scene.add.image(this.cx, this.cy + 6 * S, "pot_lid").setScale(S * 1.02).setVisible(false);
    this.root.add([this.clear, this.foam]);

    this.lidAside = scene.add.image(rightX, 168, "pot_lid").setScale(0.42).setInteractive({ useHandCursor: true });
    this.lidAside.on("pointerdown", () => this.flipLid());
    this.lidOn.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.flipLid());

    this.dial = scene.add.image(rightX, 262, "dial").setScale(1.2).setInteractive({ useHandCursor: true });
    this.dial.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.dialDrag = true;
      this.dialMoved = false;
      this.knobDeg = DIAL_ANGLES[this.pot.dial];
      this.lastPointerDeg = this.pointerDeg(p);
    });
    ["dial.off", "dial.low", "dial.mid", "dial.high"].forEach((k, i) => {
      const a = Phaser.Math.DegToRad(DIAL_ANGLES[i] - 90);
      this.dialLabels.push(
        scene.add
          .text(rightX + Math.cos(a) * 46, 262 + Math.sin(a) * 46, t(`cook.${k}` as never), { ...TEXT_SMALL, color: "#ffe0b0" })
          .setOrigin(0.5),
      );
    });
    this.root.add([this.lidAside, this.dial, ...this.dialLabels]);

    const broth = { x: { min: -RX * S * 0.75, max: RX * S * 0.75 }, y: { min: -RY * S * 0.6, max: RY * S * 0.6 } };
    this.steam = scene.add.particles(this.cx, this.cy - 10, "fx_puff", {
      ...broth,
      speedY: { min: -30, max: -14 },
      scale: { start: 1, end: 3.2 },
      alpha: { start: 0.35, end: 0 },
      lifespan: 1600,
      emitting: false,
    });
    this.bubbles = scene.add.particles(this.cx, this.cy, "fx_dot", {
      ...broth,
      scale: { start: 0.5, end: 2.2 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xfff3d0, 0xffffff],
      lifespan: 420,
      emitting: false,
    });
    this.splash = scene.add.particles(0, 0, "fx_dot", {
      speed: { min: 40, max: 110 },
      angle: { min: 200, max: 340 },
      gravityY: 260,
      lifespan: 450,
      tint: [0xe8c890, 0xffffff],
      emitting: false,
    });
    this.froth = scene.add.particles(this.cx, this.cy + RY * S, "fx_puff", {
      x: { min: -RX * S, max: RX * S },
      speedY: { min: 10, max: 40 },
      gravityY: 60,
      scale: { start: 1.4, end: 0.6 },
      alpha: { start: 0.9, end: 0 },
      tint: 0xf4ead8,
      lifespan: 900,
      emitting: false,
    });
    this.statusText = scene.add.text(this.cx, y - 2, "", { ...TEXT_SMALL, color: "#ffd9a0" }).setOrigin(0.5, 0);
    this.lidOn.setDepth(30);
    this.steam.setDepth(40);
    this.bubbles.setDepth(12);
    this.splash.setDepth(41);
    this.froth.setDepth(42);
    this.statusText.setDepth(70);
    this.fx = [this.lidOn, this.steam, this.bubbles, this.splash, this.froth, this.statusText];

    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.visible && this.host.tool === "ladle") this.stroke = { x: p.x, y: p.y, run: 0, startedInBroth: this.inBroth(p.x, p.y) };
    });
    scene.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
    scene.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onUp(p));
    this.setVisible(false);
  }

  setVisible(on: boolean) {
    this.visible = on;
    this.root.setVisible(on);
    for (const f of this.fx) (f as unknown as Phaser.GameObjects.Components.Visible).setVisible(on);
    this.lidOn.setVisible(on && this.pot.lid);
    for (const i of this.items) {
      i.raw.setVisible(on && !this.pot.lid);
      i.cooked.setVisible(on && !this.pot.lid);
    }
  }

  keysInUse(): string[] {
    return this.pot.items.map((i) => i.key);
  }

  status() {
    const level = this.pot.items.reduce((m, i) => Math.max(m, Math.min(1, i.cooked)), 0);
    const spillAt = this.pot.lid ? P.boilOverMs / 2 : P.boilOverMs;
    return { level, alarm: this.pot.fullBoilMs > spillAt * 0.6 || this.pot.foam > 0.5 };
  }

  private inBroth(x: number, y: number) {
    const dx = (x - this.cx) / (RX * S);
    const dy = (y - this.cy) / (RY * S);
    return dx * dx + dy * dy <= 1.1;
  }

  dropFromTray(key: string, x: number, y: number): boolean {
    if (!this.visible || !this.inBroth(x, y) || this.pot.lid || this.pot.items.length >= SLOTS.length) return false;
    this.pot = addToPot(this.pot, key);
    const id = parseItemKey(key)!.id;
    const slot = SLOTS[this.items.length];
    const at = { x: this.cx + slot.x * S, y: this.cy + slot.y * S };
    const raw = this.scene.add.image(at.x, at.y, rawKey(id)).setScale(0.9).setAlpha(0.92).setDepth(11);
    const cooked = this.scene.add.image(at.x, at.y, cookedKey(id)).setScale(0.9).setAlpha(0).setDepth(11);
    this.items.push({ key, raw, cooked });
    this.splash.explode(14, at.x, at.y);
    return true;
  }

  private flipLid() {
    if (!this.visible) return;
    this.pot = toggleLid(this.pot);
    this.setVisible(true);
  }

  // the finger's angle round the knob, clockwise from the top; null too near the centre to tell
  private pointerDeg(p: Phaser.Input.Pointer): number | null {
    const dx = p.x - this.dial.x;
    const dy = p.y - this.dial.y;
    if (Math.hypot(dx, dy) < 8) return null;
    return (Phaser.Math.RadToDeg(Math.atan2(dy, dx)) + 90 + 360) % 360;
  }

  private dialTo(dial: Dial) {
    this.pot = setDial(this.pot, dial);
    this.dial.setAngle(DIAL_ANGLES[dial]);
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!this.visible || !p.isDown) return;
    if (this.dialDrag) {
      // the knob turns by as much as the finger goes round it, and stops at off and at high (a real
      // knob cannot spin through the gap between them); it settles on the nearest mark
      const deg = this.pointerDeg(p);
      if (deg === null) return;
      if (this.lastPointerDeg === null) {
        this.lastPointerDeg = deg;
        return;
      }
      const delta = ((deg - this.lastPointerDeg + 540) % 360) - 180;
      this.lastPointerDeg = deg;
      if (Math.abs(delta) > 0.5) this.dialMoved = true;
      this.knobDeg = Phaser.Math.Clamp(this.knobDeg + delta, 0, 180);
      this.dial.setAngle(this.knobDeg);
      let best: Dial = 0;
      DIAL_ANGLES.forEach((d, i) => {
        if (Math.abs(this.knobDeg - d) < Math.abs(this.knobDeg - DIAL_ANGLES[best])) best = i as Dial;
      });
      if (best !== this.pot.dial) this.pot = setDial(this.pot, best);
      return;
    }
    const s = this.stroke;
    if (!s || this.host.tool !== "ladle") return;
    if (this.inBroth(p.x, p.y) && this.inBroth(s.x, s.y) && !this.pot.lid) {
      s.run += Math.hypot(p.x - s.x, p.y - s.y);
      if (s.run >= SKIM_PX) {
        s.run = 0;
        if (this.pot.foam > 0) {
          this.pot = skim(this.pot);
          this.splash.explode(5, p.x, p.y);
        }
      }
    }
    s.x = p.x;
    s.y = p.y;
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.dialDrag) {
      this.dialDrag = false;
      // a tap (no turn) moves it one mark up, wrapping to off; a turn snaps onto its mark
      this.dialTo(this.dialMoved ? this.pot.dial : (((this.pot.dial + 1) % 4) as Dial));
      return;
    }
    const s = this.stroke;
    this.stroke = null;
    if (!this.visible || !s || !s.startedInBroth || this.pot.items.length === 0 || this.pot.lid) return;
    if (!this.host.overPlate(p.x, p.y)) return;
    // a ladleful of everything in the pot into the bowl
    const judgement = judgePot(this.pot);
    if (!this.host.tryPlate(this.pot.items.map((i) => ({ key: i.key, judgement })), "boil")) return;
    for (const i of this.items) {
      i.raw.destroy();
      i.cooked.destroy();
    }
    this.items = [];
    this.pot = { ...newPot(), temp: this.pot.temp, dial: this.pot.dial };
    this.boilOversSeen = 0;
  }

  update(dt: number) {
    this.pot = stepPot(this.pot, dt);
    const pot = this.pot;
    const boiling = pot.temp >= 99.5;
    const warm = Math.max(0, (pot.temp - 60) / 40);
    this.steam.frequency = warm > 0 ? Math.max(60, 600 - warm * 520) * (pot.lid ? 0.6 : 1) : -1;
    this.steam.emitting = this.visible && warm > 0;
    this.bubbles.emitting = this.visible && !pot.lid && pot.temp >= P.cookFrom;
    this.bubbles.frequency = boiling && pot.dial === 3 ? 25 : boiling ? 70 : 160;
    this.foam.setAlpha(Math.min(1, pot.foam * 1.4));
    // a hard boil under the lid makes it rattle
    if (pot.lid && boiling && pot.dial >= 2) this.lidOn.setPosition(this.cx + (Math.random() - 0.5) * 2, this.cy + 6 * S + (Math.random() - 0.5) * 2);
    if (pot.boilOvers > this.boilOversSeen) {
      this.boilOversSeen = pot.boilOvers;
      if (this.visible) {
        this.froth.explode(30);
        this.host.say(t("cook.boilOver"), this.cx, this.cy - RY * S - 8, "#ffb0b0");
        this.scene.cameras.main.shake(120, 0.004);
      }
    }
    const tnow = this.scene.time.now / 600;
    this.items.forEach((it, i) => {
      const c = pot.items[i]?.cooked ?? 0;
      const bob = boiling ? Math.sin(tnow * 3 + i) * 1.5 : Math.sin(tnow + i) * 0.6;
      const slot = SLOTS[i];
      const y = this.cy + slot.y * S + bob;
      it.raw.setY(y);
      it.cooked.setY(y).setAlpha(Math.min(1, c) * 0.95);
    });
    this.statusText.setText(pot.dial === 0 && pot.items.length > 0 ? t("cook.fireOff") : "");
  }
}
