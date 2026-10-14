import Phaser from "phaser";
import { BALANCE } from "../../../shared/balance";
import { parseItemKey } from "../../../shared/content/items";
import {
  cutPiece,
  flipPiece,
  heatAt,
  judgePiece,
  juicy,
  movePiece,
  newGrill,
  placePiece,
  removePiece,
  replaceGrill,
  stepGrill,
  type Grill,
  type GrillPiece,
} from "../../../shared/cooking/grill";
import { t } from "../../i18n";
import { cookedKey, rawKey } from "./art";
import type { CookHost, Station } from "./host";

// The grill plate, seen from above (cooking-service design 2). The rules live in shared/cooking/grill;
// this draws them and turns pointer moves into tongs and scissors.
//  - drag from the tray onto the plate: lay it on (sizzle, smoke, a splash of fat)
//  - tap a piece: flip it with the tongs; drag it: move it (rim = cooler); drag it onto the plate: serve
//  - holding the scissors, drag across a piece: cut it
//  - tap the left handle: swap in a clean plate (it has to heat up again)
// What you see is the top. The side on the plate shows as browning creeping out around the rim, and
// juice beads on top when it is time to flip.
const S = 1.45; // grill sprite scale
const PLATE_CX = 119; // cooking surface centre and radii inside the grill sprite (measured)
const PLATE_CY = 79;
const RX = 84;
const RY = 60;
const PIECE_SCALE = 1.25;
const TAP_MS = 280;
const TAP_PX = 8;
const G = BALANCE.cooking.grill;

interface PieceView {
  box: Phaser.GameObjects.Container;
  rim: Phaser.GameObjects.Image;
  layers: { raw: Phaser.GameObjects.Image; cooked: Phaser.GameObjects.Image }[];
  cutShown: boolean;
  beads: Phaser.GameObjects.Graphics;
  nextBeads: number;
}

export class GrillStation implements Station {
  readonly method = "grill" as const;
  private grill: Grill = newGrill();
  private views = new Map<string, PieceView>();
  private nextId = 0;
  private root: Phaser.GameObjects.Container;
  private plateImg: Phaser.GameObjects.Image;
  private cx: number;
  private cy: number;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private shimmer: Phaser.GameObjects.Particles.ParticleEmitter;
  private grease: Phaser.GameObjects.Particles.ParticleEmitter;
  private drip: Phaser.GameObjects.Particles.ParticleEmitter;
  private fatGlint: Phaser.GameObjects.Particles.ParticleEmitter;
  private status: Phaser.GameObjects.Text;
  private drag: { id: string; startX: number; startY: number; at: number; moved: boolean } | null = null;
  private cutTrail: { x: number; y: number } | null = null;
  private visible = true;
  private fx: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private scene: Phaser.Scene,
    private host: CookHost,
    x: number,
    y: number,
  ) {
    this.root = scene.add.container(0, 0);
    this.plateImg = scene.add.image(x, y, "grill").setOrigin(0).setScale(S);
    this.cx = x + PLATE_CX * S;
    this.cy = y + PLATE_CY * S;
    this.root.add(this.plateImg);
    // the left handle swaps the plate
    const handle = scene.add.zone(x + 4 * S, y + 50 * S, 26 * S, 45 * S).setOrigin(0).setInteractive({ useHandCursor: true });
    handle.on("pointerdown", () => this.swapPlate());
    this.root.add(handle);

    this.shimmer = scene.add.particles(this.cx, this.cy, "fx_puff", {
      x: { min: -RX * 0.7, max: RX * 0.7 },
      y: { min: -RY * 0.5, max: RY * 0.5 },
      speedY: { min: -14, max: -6 },
      scale: { start: 0.6, end: 1.6 },
      alpha: { start: 0.18, end: 0 },
      lifespan: 1400,
      frequency: 220,
      emitting: false,
    });
    this.smoke = scene.add.particles(0, 0, "fx_puff", {
      speedY: { min: -40, max: -18 },
      speedX: { min: -8, max: 8 },
      scale: { start: 0.8, end: 3 },
      alpha: { start: 0.45, end: 0 },
      tint: 0xe8e8e8,
      lifespan: 1400,
      emitting: false,
    });
    this.grease = scene.add.particles(0, 0, "fx_dot", {
      speed: { min: 30, max: 90 },
      angle: { min: 200, max: 340 },
      gravityY: 220,
      lifespan: 400,
      tint: [0xfff2b0, 0xffffff, 0xf0c060],
      emitting: false,
    });
    this.drip = scene.add.particles(x + 119 * S, y + 165 * S, "fx_dot", {
      speedY: { min: 20, max: 40 },
      gravityY: 80,
      lifespan: 450,
      tint: 0xf0c060,
      frequency: 600,
      emitting: false,
    });
    // pork fat pooling at the low edge by the spout: golden glints show where garnish fries best
    const fatTop = this.cy + G.fatZoneY * RY * S;
    this.fatGlint = scene.add.particles(this.cx, (fatTop + this.cy + RY * S) / 2, "fx_dot", {
      x: { min: -RX * S * 0.55, max: RX * S * 0.55 },
      y: { min: -(this.cy + RY * S - fatTop) / 2, max: (this.cy + RY * S - fatTop) / 2 },
      scale: { start: 1.5, end: 0.5 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffe08a, 0xfff6d0],
      lifespan: 700,
      frequency: 90,
      emitting: false,
    });
    this.status = scene.add.text(this.cx, y - 2, "", { fontFamily: "monospace", fontSize: "10px", color: "#ffd9a0", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5, 1);
    // effects above the meat (pieces sit at depth 10, a dragged one at 50)
    this.shimmer.setDepth(30);
    this.smoke.setDepth(40);
    this.grease.setDepth(41);
    this.drip.setDepth(5);
    this.fatGlint.setDepth(6);
    this.status.setDepth(70);
    this.fx = [this.shimmer, this.smoke, this.grease, this.drip, this.fatGlint, this.status];

    scene.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
    scene.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onUp(p));
    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.visible && this.host.tool === "scissors") this.cutTrail = { x: p.x, y: p.y };
    });
  }

  setVisible(on: boolean) {
    this.visible = on;
    this.root.setVisible(on);
    for (const f of this.fx) (f as unknown as Phaser.GameObjects.Components.Visible).setVisible(on);
    for (const v of this.views.values()) v.box.setVisible(on);
  }

  keysInUse(): string[] {
    return this.grill.pieces.map((p) => p.key);
  }

  private toGrill(x: number, y: number) {
    return { x: (x - this.cx) / RX / S, y: (y - this.cy) / RY / S };
  }
  private toScreen(gx: number, gy: number) {
    return { x: this.cx + gx * RX * S, y: this.cy + gy * RY * S };
  }
  private onPlateSurface(x: number, y: number) {
    const g = this.toGrill(x, y);
    return g.x * g.x + g.y * g.y <= 1.15;
  }

  dropFromTray(key: string, x: number, y: number): boolean {
    if (!this.visible || !this.onPlateSurface(x, y)) return false;
    const id = `p${this.nextId++}`;
    const g = this.toGrill(x, y);
    this.grill = placePiece(this.grill, id, key, g.x, g.y);
    const piece = this.grill.pieces.find((p) => p.id === id)!;
    this.views.set(id, this.makeView(piece));
    const at = this.toScreen(piece.x, piece.y);
    // the sizzle: fat jumps, a puff of smoke; a cold plate just grabs the meat
    if (piece.stuck) this.host.say(t("cook.stuck"), at.x, at.y - 24, "#ffb0b0");
    else this.grease.explode(14, at.x, at.y);
    this.smoke.explode(4, at.x, at.y);
    return true;
  }

  private makeView(p: GrillPiece): PieceView {
    const scene = this.scene;
    const id = parseItemKey(p.key)!.id;
    const at = this.toScreen(p.x, p.y);
    const box = scene.add.container(at.x, at.y).setScale(PIECE_SCALE).setDepth(10);
    // the browning on the plate side shows as a rim creeping out around the piece
    const rim = scene.add.image(0, 0, cookedKey(id)).setScale(1.28).setAlpha(0);
    const raw = scene.add.image(0, 0, rawKey(id));
    const cooked = scene.add.image(0, 0, cookedKey(id)).setAlpha(0);
    const beads = scene.add.graphics();
    box.add([rim, raw, cooked, beads]);
    box.setSize(raw.width, raw.height).setInteractive({ useHandCursor: true, draggable: false });
    box.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      if (this.host.tool !== "tongs") return;
      this.drag = { id: p.id, startX: ptr.x, startY: ptr.y, at: scene.time.now, moved: false };
      box.setDepth(50);
    });
    return { box, rim, layers: [{ raw, cooked }], cutShown: false, beads, nextBeads: 0 };
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!this.visible) return;
    if (this.drag && p.isDown) {
      const v = this.views.get(this.drag.id);
      if (!v) return;
      if (Math.hypot(p.x - this.drag.startX, p.y - this.drag.startY) > TAP_PX) this.drag.moved = true;
      if (this.drag.moved) v.box.setPosition(p.x, p.y);
    }
    if (this.cutTrail && p.isDown && this.host.tool === "scissors") {
      const from = this.cutTrail;
      for (const piece of this.grill.pieces) {
        if (piece.cut) continue;
        const at = this.toScreen(piece.x, piece.y);
        if (distToSegment(at, from, p) < 14) this.cut(piece.id, at);
      }
      this.cutTrail = { x: p.x, y: p.y };
    }
  }

  private onUp(p: Phaser.Input.Pointer) {
    this.cutTrail = null;
    const d = this.drag;
    this.drag = null;
    if (!d || !this.visible) return;
    const v = this.views.get(d.id);
    if (!v) return;
    v.box.setDepth(10);
    if (!d.moved && this.scene.time.now - d.at < TAP_MS) return this.flip(d.id);
    const piece = this.grill.pieces.find((x) => x.id === d.id)!;
    if (this.host.overPlate(p.x, p.y)) {
      if (this.host.tryPlate([{ key: piece.key, judgement: judgePiece(piece) }], "grill")) {
        this.grill = removePiece(this.grill, d.id);
        v.box.destroy();
        this.views.delete(d.id);
        return;
      }
    } else if (this.onPlateSurface(p.x, p.y)) {
      const g = this.toGrill(p.x, p.y);
      this.grill = movePiece(this.grill, d.id, g.x, g.y);
      const at = this.toScreen(this.grill.pieces.find((x) => x.id === d.id)!.x, this.grill.pieces.find((x) => x.id === d.id)!.y);
      this.smoke.explode(2, at.x, at.y);
    }
    // back to where the rules say it is
    const now = this.grill.pieces.find((x) => x.id === d.id)!;
    const at = this.toScreen(now.x, now.y);
    v.box.setPosition(at.x, at.y);
  }

  // The tongs pick it up and turn it over: a quick squash, then the other side shows.
  private flip(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    const scene = this.scene;
    const tongs = scene.add.image(v.box.x + 10, v.box.y - 14, "tongs").setAngle(-20).setDepth(60);
    scene.tweens.add({
      targets: v.box,
      scaleY: 0,
      duration: 80,
      yoyo: true,
      onYoyo: () => {
        this.grill = flipPiece(this.grill, id);
        this.grease.explode(8, v.box.x, v.box.y);
        this.smoke.explode(3, v.box.x, v.box.y);
      },
      onComplete: () => v.box.setScale(PIECE_SCALE),
    });
    scene.tweens.add({ targets: tongs, y: tongs.y - 6, alpha: 0, delay: 120, duration: 200, onComplete: () => tongs.destroy() });
  }

  private cut(id: string, at: { x: number; y: number }) {
    this.grill = cutPiece(this.grill, id);
    this.grease.explode(6, at.x, at.y);
    const piece = this.grill.pieces.find((p) => p.id === id)!;
    if (piece.cutEarly) this.host.say(t("cook.juice"), at.x, at.y - 24, "#ffb0b0");
  }

  private swapPlate() {
    if (!this.visible) return;
    this.grill = replaceGrill(this.grill);
    this.host.say(t("cook.newPlate"), this.cx, this.cy - RY * S - 6, "#c8f0ff");
    this.plateImg.setTint(0xffffff);
  }

  update(dt: number) {
    this.grill = stepGrill(this.grill, dt);
    const g = this.grill;
    // a plate getting dark with soot and burnt fat
    const soot = Math.round(255 - g.soot * 110);
    this.plateImg.setTint(Phaser.Display.Color.GetColor(soot, soot, soot));
    this.status.setText(g.heat < G.stickBelow ? t("cook.preheat") : g.soot > 0.3 ? t("cook.sooty") : "");
    // ready: heat shimmers over the empty plate
    this.shimmer.emitting = this.visible && g.heat >= G.stickBelow && g.pieces.length === 0;
    this.drip.emitting = this.visible && g.fat > 0.2;
    this.fatGlint.emitting = this.visible && g.fat >= G.fatNeeded;
    for (const piece of g.pieces) this.drawPiece(piece);
  }

  private drawPiece(p: GrillPiece) {
    const v = this.views.get(p.id);
    if (!v) return;
    const scene = this.scene;
    if (p.cut && !v.cutShown) this.showCut(v, p);
    const top = Math.min(1, p.up);
    const darken = Math.round(255 - Math.min(1, p.char) * 190);
    const tint = Phaser.Display.Color.GetColor(darken, Math.round(darken * 0.92), Math.round(darken * 0.85));
    // heat climbing through from below turns the raw top opaque and pale before it is ever flipped
    const through = Math.min(1, p.down) * 0.55;
    const rawTint = Phaser.Display.Color.GetColor(
      Math.round(darken),
      Math.round(darken * (1 - through * 0.18)),
      Math.round(darken * (1 - through * 0.3)),
    );
    for (const l of v.layers) {
      l.cooked.setAlpha(top);
      l.raw.setTint(rawTint);
      l.cooked.setTint(tint);
    }
    v.rim.setVisible(!p.cut).setAlpha(Math.min(1, p.down) * 0.9).setTint(tint);
    // sizzling: smoke in proportion to the heat under it; more once it starts to burn
    const at = this.toScreen(p.x, p.y);
    const heat = heatAt(p.x, p.y) * this.grill.heat;
    // smoke rises off the meat (starting above it, so the piece stays visible); burning, it billows
    if (this.visible && Math.random() < heat * 0.06 + p.char * 0.12) this.smoke.emitParticleAt(at.x + (Math.random() - 0.5) * 16, at.y - 18);
    if (this.visible && Math.random() < heat * 0.03) this.grease.emitParticleAt(at.x + (Math.random() - 0.5) * 20, at.y);
    // juice beading on top: the cue to flip
    if (scene.time.now >= v.nextBeads) {
      v.nextBeads = scene.time.now + 220;
      v.beads.clear();
      if (juicy(p)) {
        v.beads.fillStyle(0xfff6e0, 0.95);
        for (let i = 0; i < 5; i++) v.beads.fillCircle((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 30, 1.5);
      }
    }
  }

  // Scissors: three bite-size pieces with a little gap between them.
  private showCut(v: PieceView, p: GrillPiece) {
    const scene = this.scene;
    const id = parseItemKey(p.key)!.id;
    for (const l of v.layers) {
      l.raw.destroy();
      l.cooked.destroy();
    }
    v.layers = [];
    const w = scene.textures.get(rawKey(id)).getSourceImage().width;
    const h = scene.textures.get(rawKey(id)).getSourceImage().height;
    for (let i = 0; i < 3; i++) {
      const y0 = Math.round((h * i) / 3);
      const y1 = Math.round((h * (i + 1)) / 3);
      const off = (i - 1) * 3;
      const raw = scene.add.image(0, off, rawKey(id)).setCrop(0, y0, w, y1 - y0);
      const cooked = scene.add.image(0, off, cookedKey(id)).setCrop(0, y0, w, y1 - y0);
      v.box.addAt(raw, 1 + i * 2);
      v.box.addAt(cooked, 2 + i * 2);
      v.layers.push({ raw, cooked });
    }
    v.cutShown = true;
  }
}

function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}
