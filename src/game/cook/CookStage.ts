import Phaser from "phaser";
import { BALANCE } from "../../../shared/balance";
import type { Method } from "../../../shared/content/dishes";
import { ITEMS, parseItemKey } from "../../../shared/content/items";
import { canPlate } from "../../../shared/cooking/grill";
import { plateResult, type CookJudgement, type NoteId } from "../../../shared/cooking/notes";
import { t } from "../../i18n";
import { cookedKey, loadCookArt, makeEffectTextures, rawKey } from "./art";
import { GrillStation } from "./GrillStation";
import type { CookHost, Station } from "./host";

// The cooking stage (cooking-service design 2 and 4), shared by the research kitchen and (05b) the
// night service. A station (grill, pot) in the middle, the ingredient tray along the bottom, the
// serving plate on the right with the tongs and scissors. "Done" sends what is on the plate:
// game.events "cook:plate" { keys, method, accuracy, note }. The page answers "cook:reset" with the
// fridge as it is after the try, and the stage starts over.
export interface CookStageData {
  items: Record<string, number>;
}

export interface CookPlate {
  keys: string[];
  method: Method;
  accuracy: number;
  note: NoteId | null;
}

const MAX_DT_MS = 50;
const TRAY_Y = 336;
const PLATE = { x: 520, y: 160, scale: 2 };
const PLATE_HIT = { w: 150, h: 130 };
const ORDER = Object.keys(ITEMS);
// a leaf goes on the plate as it is (to wrap with); everything else wants cooking
const SERVED_RAW = new Set(Object.keys(ITEMS).filter((id) => BALANCE.cooking.items[id as keyof typeof ITEMS].oneSide && ITEMS[id as keyof typeof ITEMS].kind === "forage"));
const label = { fontFamily: "monospace", fontSize: "11px", color: "#ffffff", stroke: "#000000", strokeThickness: 3 };

export class CookStage extends Phaser.Scene implements CookHost {
  tool: "tongs" | "scissors" = "tongs";
  private items: Record<string, number> = {};
  private stations: Station[] = [];
  private active!: Station;
  private plated: { key: string; judgement: CookJudgement; sprite: Phaser.GameObjects.Image }[] = [];
  private tray: { key: string; img: Phaser.GameObjects.Image; count: Phaser.GameObjects.Text }[] = [];
  private ghost: { key: string; img: Phaser.GameObjects.Image } | null = null;
  private toolIcons!: { tongs: Phaser.GameObjects.Image; scissors: Phaser.GameObjects.Image };
  private scissorsCursor!: Phaser.GameObjects.Image;
  private serveButton!: Phaser.GameObjects.Text;
  private served = false;

  constructor() {
    super("cook");
  }

  init(data: CookStageData) {
    this.items = { ...data.items };
    this.stations = [];
    this.plated = [];
    this.tray = [];
    this.ghost = null;
    this.tool = "tongs";
    this.served = false;
  }

  preload() {
    loadCookArt(this);
  }

  create() {
    makeEffectTextures(this);
    this.cameras.main.setBackgroundColor("#2b211c");
    const grill = new GrillStation(this, this, 6, 4);
    this.stations = [grill];
    this.active = grill;

    // serving plate
    this.add.image(PLATE.x, PLATE.y, "plate").setScale(PLATE.scale);
    this.add.text(PLATE.x, PLATE.y - 70, t("cook.plate"), label).setOrigin(0.5);
    this.serveButton = this.add
      .text(PLATE.x, PLATE.y + 82, t("cook.serve"), { ...label, fontSize: "14px", backgroundColor: "#7a4a1a", padding: { x: 10, y: 4 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.serve());

    // tongs and scissors: tap to pick one up
    this.toolIcons = {
      tongs: this.add.image(392, 72, "tongs").setInteractive({ useHandCursor: true }),
      scissors: this.add.image(392, 140, "scissors").setInteractive({ useHandCursor: true }),
    };
    this.toolIcons.tongs.on("pointerdown", () => this.pickTool("tongs"));
    this.toolIcons.scissors.on("pointerdown", () => this.pickTool("scissors"));
    this.scissorsCursor = this.add.image(0, 0, "scissors").setScale(0.7).setAngle(-30).setDepth(90).setVisible(false);
    this.pickTool("tongs");

    this.buildTray();
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      this.ghost?.img.setPosition(p.x, p.y);
      if (this.tool === "scissors") this.scissorsCursor.setPosition(p.x + 8, p.y - 8);
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.dropGhost(p));
    this.game.events.emit("cook:ready");
  }

  update(_time: number, rawDt: number) {
    const dt = Math.min(rawDt, MAX_DT_MS);
    for (const s of this.stations) s.update(dt);
    // recounted every frame: a piece moving from a station to the plate is briefly in both
    this.refreshTray();
    this.serveButton.setAlpha(this.plated.length > 0 && !this.served ? 1 : 0.4);
  }

  // ------------------------------------------------------------- CookHost

  overPlate(x: number, y: number): boolean {
    return Math.abs(x - PLATE.x) <= PLATE_HIT.w / 2 && Math.abs(y - PLATE.y) <= PLATE_HIT.h / 2;
  }

  tryPlate(key: string, judgement: CookJudgement, raw = false): boolean {
    if (this.served) return false;
    const onPlate = this.plated.map((p) => p.key);
    // already counted out of the tray when it went on the station, so only the plate's own rule matters
    if (!canPlate(onPlate, key)) {
      this.say(t("cook.plateFull"), PLATE.x, PLATE.y - 50, "#ffb0b0");
      return false;
    }
    const i = this.plated.length;
    const at = { x: PLATE.x + [-26, 24, 0][i], y: PLATE.y + [-10, -12, 22][i] };
    const id = parseItemKey(key)!.id;
    // what was cooked shows cooked; something straight from the tray stays as it is
    const sprite = this.add.image(at.x, at.y, raw ? rawKey(id) : cookedKey(id)).setScale(0.6).setDepth(20);
    this.plated.push({ key, judgement, sprite });
    this.refreshTray();
    return true;
  }

  say(text: string, x: number, y: number, color = "#ffffff") {
    const s = this.add.text(x, y, text, { ...label, color }).setOrigin(0.5).setDepth(100);
    this.tweens.add({ targets: s, y: y - 14, alpha: 0, delay: 600, duration: 700, onComplete: () => s.destroy() });
  }

  // ------------------------------------------------------------- tray

  private keysInUse(): string[] {
    return [...this.stations.flatMap((s) => s.keysInUse()), ...this.plated.map((p) => p.key)];
  }

  private left(key: string): number {
    return (this.items[key] ?? 0) - this.keysInUse().filter((k) => k === key).length;
  }

  private buildTray() {
    const keys = Object.keys(this.items)
      .filter((k) => parseItemKey(k) && this.items[k] > 0)
      .sort((a, b) => ORDER.indexOf(parseItemKey(a)!.id) - ORDER.indexOf(parseItemKey(b)!.id) || (a.endsWith("premium") ? -1 : 1));
    if (keys.length === 0) this.add.text(320, TRAY_Y, t("kitchen.fridgeEmpty"), label).setOrigin(0.5);
    const step = Math.min(56, 600 / Math.max(1, keys.length));
    keys.forEach((key, i) => {
      const x = 20 + step / 2 + i * step;
      const img = this.add.image(x, TRAY_Y, rawKey(parseItemKey(key)!.id)).setScale(0.6).setInteractive({ useHandCursor: true });
      const count = this.add.text(x + 14, TRAY_Y + 12, "", { ...label, fontSize: "10px" }).setOrigin(0.5);
      if (key.endsWith(":premium")) this.add.text(x - 14, TRAY_Y - 16, "★", { ...label, color: "#ffd166" }).setOrigin(0.5);
      img.on("pointerdown", (p: Phaser.Input.Pointer) => this.pickFromTray(key, p));
      this.tray.push({ key, img, count });
    });
    this.refreshTray();
  }

  private refreshTray() {
    for (const s of this.tray) {
      const n = this.left(s.key);
      s.count.setText(`${n}`);
      s.img.setAlpha(n > 0 ? 1 : 0.35);
    }
  }

  private pickFromTray(key: string, p: Phaser.Input.Pointer) {
    if (this.served || this.left(key) <= 0) return;
    // one of each kind of item, three kinds at most (what the server accepts as one try)
    const inUse = [...new Set(this.keysInUse())];
    if (!canPlate(inUse, key)) {
      this.say(t("cook.plateFull"), p.x, p.y - 24, "#ffb0b0");
      return;
    }
    const img = this.add.image(p.x, p.y, rawKey(parseItemKey(key)!.id)).setScale(0.8).setAlpha(0.9).setDepth(95);
    this.ghost = { key, img };
  }

  private dropGhost(p: Phaser.Input.Pointer) {
    const g = this.ghost;
    if (!g) return;
    this.ghost = null;
    g.img.destroy();
    if (this.overPlate(p.x, p.y)) {
      // straight onto the plate, uncooked: right for a leaf to wrap with, not for meat
      const leaf = SERVED_RAW.has(parseItemKey(g.key)!.id);
      this.tryPlate(g.key, leaf ? { accuracy: 1, notes: [] } : { accuracy: 0.2, notes: ["raw"] }, true);
    } else this.active.dropFromTray(g.key, p.x, p.y);
    this.refreshTray();
  }

  // ------------------------------------------------------------- tools and serving

  private pickTool(tool: "tongs" | "scissors") {
    this.tool = tool;
    this.toolIcons.tongs.setScale(tool === "tongs" ? 1.15 : 0.9).setAlpha(tool === "tongs" ? 1 : 0.6);
    this.toolIcons.scissors.setScale(tool === "scissors" ? 1.15 : 0.9).setAlpha(tool === "scissors" ? 1 : 0.6);
    this.scissorsCursor.setVisible(tool === "scissors");
  }

  private serve() {
    if (this.served || this.plated.length === 0) return;
    this.served = true;
    const r = plateResult(this.plated.map((p) => p.judgement));
    const plate: CookPlate = { keys: this.plated.map((p) => p.key), method: this.active.method, accuracy: r.accuracy, note: r.note };
    this.game.events.emit("cook:plate", plate);
  }
}
