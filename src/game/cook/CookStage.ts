import Phaser from "phaser";
import { BALANCE } from "../../../shared/balance";
import { DISHES, type DishId, type Method } from "../../../shared/content/dishes";
import { ITEMS, parseItemKey, type ItemId } from "../../../shared/content/items";
import { canPlate } from "../../../shared/cooking/grill";
import { plateResult, type CookJudgement, type NoteId } from "../../../shared/cooking/notes";
import { t } from "../../i18n";
import { artUrl } from "../art";
import { addButton, addTab, loadUiArt, TEXT, type UiButton, type UiTab } from "../ui";
import { cookedKey, loadCookArt, makeEffectTextures, rawKey } from "./art";
import { GrillStation } from "./GrillStation";
import { PotStation } from "./PotStation";
import type { CookHost, Station } from "./host";

// The cooking stage (cooking-service design 2, 4 and 5), shared by the research kitchen and the night
// service. A station (grill, pot) in the middle, the ingredient tray along the bottom, the serving
// plate on the right with the tools.
//  - research: "Done" sends what is on the plate: game.events "cook:plate" { keys, method, accuracy,
//    note }; the page restarts the stage with the fridge as it is after the try.
//  - service: the tray holds tonight's menu ingredients, counted down all night; waiting customers'
//    orders show as chips (game.registry "orders", kept by the shop scene); dragging the plate onto an
//    order serves it if it is that dish: game.events "service:serve" { customer, keys, accuracy }.
//    Station chips warn when something is about to burn; "to the shop" emits "service:shop". The stage
//    keeps cooking while the shop is in front.
export interface CookStageData {
  items: Record<string, number>;
  mode?: "research" | "service";
  menu?: { dish: DishId; items: ItemId[] }[];
  // tool quality from the upgrades (shared/growth toolQuality): more room before burning / boiling over
  quality?: { grill: number; boil: number };
}

export interface Order {
  customer: string;
  dish: DishId;
  // patience left, 1 .. 0
  patience: number;
}

export interface CookPlate {
  keys: string[];
  method: Method;
  accuracy: number;
  note: NoteId | null;
}

const MAX_DT_MS = 50;
const TOOLS = ["tongs", "scissors", "salt", "ladle"] as const;
const TRAY_Y = 336;
const PLATE = { x: 520, y: 160, scale: 2 };
const CHIPS = { x: 452, y: 64, step: 46, max: 4 };
const STATION_CHIPS = { x: 616, y: [124, 182] };
const PLATE_HIT = { w: 150, h: 130 };
const ORDER = Object.keys(ITEMS);
// a leaf goes on the plate as it is (to wrap with); everything else wants cooking
const SERVED_RAW = new Set(Object.keys(ITEMS).filter((id) => BALANCE.cooking.items[id as keyof typeof ITEMS].oneSide && ITEMS[id as keyof typeof ITEMS].kind === "forage"));
const label = TEXT;

export class CookStage extends Phaser.Scene implements CookHost {
  tool: "tongs" | "scissors" | "salt" | "ladle" = "tongs";
  private items: Record<string, number> = {};
  private stations: Station[] = [];
  private active!: Station;
  private plated: { key: string; judgement: CookJudgement; sprite: Phaser.GameObjects.Image }[] = [];
  private tray: { key: string; img: Phaser.GameObjects.Image; count: Phaser.GameObjects.Text }[] = [];
  private ghost: { key: string; img: Phaser.GameObjects.Image } | null = null;
  private toolIcons!: Record<"tongs" | "scissors" | "salt" | "ladle", Phaser.GameObjects.Image>;
  private cursor!: Phaser.GameObjects.Image;
  private tabs: UiTab[] = [];
  private plateMethod: "grill" | "boil" | null = null;
  private bowl!: Phaser.GameObjects.Image;
  private serveButton!: UiButton;
  private served = false;
  private mode: "research" | "service" = "research";
  private menu: { dish: DishId; items: ItemId[] }[] = [];
  private quality = { grill: 1, boil: 1 };
  // ingredients already served tonight (service mode)
  private usedTotal: Record<string, number> = {};
  private chips: { customer: string; box: Phaser.GameObjects.Container; bar: Phaser.GameObjects.Graphics }[] = [];
  private stationChips: { box: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Graphics; station: Station }[] = [];
  private plateDrag: Phaser.GameObjects.Container | null = null;

  constructor() {
    super("cook");
  }

  init(data: CookStageData) {
    this.items = { ...data.items };
    this.mode = data.mode ?? "research";
    this.menu = data.menu ?? [];
    this.quality = data.quality ?? { grill: 1, boil: 1 };
    this.usedTotal = {};
    this.chips = [];
    this.stationChips = [];
    this.plateDrag = null;
    this.stations = [];
    this.plated = [];
    this.tray = [];
    this.ghost = null;
    this.tool = "tongs";
    this.served = false;
    this.plateMethod = null;
    this.tabs = [];
  }

  preload() {
    loadCookArt(this);
    loadUiArt(this);
    for (const id of Object.keys(DISHES)) this.load.image(`dish_${id}`, artUrl(`test/dishes/${id}.png`));
  }

  create() {
    makeEffectTextures(this);
    this.cameras.main.setBackgroundColor("#2b211c");
    const grill = new GrillStation(this, this, 6, 4, 404, 262, this.quality.grill);
    const pot = new PotStation(this, this, 14, 6, 392, this.quality.boil);
    this.stations = [grill, pot];
    this.active = grill;

    // serving plate
    this.add.image(PLATE.x, PLATE.y, "plate").setScale(PLATE.scale);
    // soup goes into a bowl on the plate
    this.bowl = this.add.image(PLATE.x, PLATE.y, "bowl").setScale(1.6).setDepth(19).setVisible(false);
    if (this.mode === "research") this.add.text(PLATE.x, PLATE.y - 70, t("cook.plate"), label).setOrigin(0.5);
    this.serveButton = addButton(this, PLATE.x, PLATE.y + 82, t("cook.serve"), () => this.serve(), 70);
    this.serveButton.box.setVisible(this.mode === "research");
    if (this.mode === "service") this.buildService();

    // tools: tap to pick one up (tongs and scissors at the grill, the ladle at the pot)
    this.toolIcons = {
      tongs: this.add.image(392, 62, "tongs").setInteractive({ useHandCursor: true }),
      scissors: this.add.image(392, 124, "scissors").setInteractive({ useHandCursor: true }),
      salt: this.add.image(392, 184, "salt_shaker").setInteractive({ useHandCursor: true }),
      ladle: this.add.image(392, 72, "ladle").setInteractive({ useHandCursor: true }),
    };
    for (const k of TOOLS) this.toolIcons[k].on("pointerdown", () => this.pickTool(k));
    this.cursor = this.add.image(0, 0, "scissors").setScale(0.7).setAngle(-30).setDepth(90).setVisible(false);

    // which station is in front: the other keeps cooking where it is
    // the station tabs at the top left, over the station they switch (user, 2026-10-15)
    (["grill", "pot"] as const).forEach((k, i) => this.tabs.push(addTab(this, 30 + i * 52, 22, t(`cook.tab.${k}`), () => this.show(this.stations[i]))));
    this.show(grill);

    this.buildTray();
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      this.ghost?.img.setPosition(p.x, p.y);
      this.plateDrag?.setPosition(p.x, p.y);
      if (this.tool !== "tongs") this.cursor.setPosition(p.x + 8, p.y - 8);
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      this.dropGhost(p);
      this.dropPlate(p);
    });
    this.game.events.emit("cook:ready");
  }

  update(_time: number, rawDt: number) {
    const dt = Math.min(rawDt, MAX_DT_MS);
    for (const s of this.stations) s.update(dt);
    // recounted every frame: a piece moving from a station to the plate is briefly in both
    this.refreshTray();
    this.serveButton.setEnabled(this.plated.length > 0 && !this.served);
    if (this.mode === "service") this.updateService();
  }

  // ------------------------------------------------------------- CookHost

  overPlate(x: number, y: number): boolean {
    return Math.abs(x - PLATE.x) <= PLATE_HIT.w / 2 && Math.abs(y - PLATE.y) <= PLATE_HIT.h / 2;
  }

  tryPlate(entries: { key: string; judgement: CookJudgement }[], from: "grill" | "boil", raw = false): boolean {
    if (this.served || entries.length === 0) return false;
    if (this.plateMethod && this.plateMethod !== from) {
      this.say(t("cook.oneStation"), PLATE.x, PLATE.y - 50, "#ffb0b0");
      return false;
    }
    // already counted out of the tray when it went on the station, so only the plate's own rule matters
    const keys = this.plated.map((p) => p.key);
    for (const e of entries) {
      if (!canPlate(keys, e.key)) {
        this.say(t("cook.plateFull"), PLATE.x, PLATE.y - 50, "#ffb0b0");
        return false;
      }
      keys.push(e.key);
    }
    this.plateMethod = from;
    this.bowl.setVisible(from === "boil");
    for (const e of entries) {
      const i = this.plated.length;
      const at = { x: PLATE.x + [-26, 24, 0][i], y: PLATE.y + [-10, -12, 22][i] };
      const id = parseItemKey(e.key)!.id;
      // what was cooked shows cooked; something straight from the tray stays as it is
      const sprite = this.add.image(at.x, at.y, raw ? rawKey(id) : cookedKey(id)).setScale(from === "boil" ? 0.45 : 0.6).setDepth(20);
      // a burnt piece stays burnt on the plate
      if (e.judgement.notes.includes("burnt")) sprite.setTint(0x6a5246);
      this.plated.push({ key: e.key, judgement: e.judgement, sprite });
    }
    // ready to serve at once (not on the next frame), so a quick tap on Done is not lost
    this.serveButton.setEnabled(!this.served);
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
    return (this.items[key] ?? 0) - (this.usedTotal[key] ?? 0) - this.keysInUse().filter((k) => k === key).length;
  }

  private buildTray() {
    // in service only what tonight's menu is made of
    const menuIds = new Set(this.menu.flatMap((m) => m.items));
    const keys = Object.keys(this.items)
      .filter((k) => parseItemKey(k) && this.items[k] > 0 && (this.mode === "research" || menuIds.has(parseItemKey(k)!.id)))
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
    // research: one of each kind of item, three kinds at most (what the server accepts as one try);
    // service cooks for several tables at once, so only the fridge limits it
    const inUse = [...new Set(this.keysInUse())];
    if (this.mode === "research" && !canPlate(inUse, key)) {
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
      this.tryPlate([{ key: g.key, judgement: leaf ? { accuracy: 1, notes: [] } : { accuracy: 0.2, notes: ["raw"] } }], this.active.method, true);
    } else this.active.dropFromTray(g.key, p.x, p.y);
    this.refreshTray();
  }

  // ------------------------------------------------------------- tools and serving

  private pickTool(tool: "tongs" | "scissors" | "salt" | "ladle") {
    this.tool = tool;
    for (const k of TOOLS) this.toolIcons[k].setScale(k === tool ? 1.15 : 0.9).setAlpha(k === tool ? 1 : 0.6);
    this.cursor.setTexture(tool === "salt" ? "salt_shaker" : tool).setAngle(tool === "salt" ? 160 : -30).setVisible(tool !== "tongs");
  }

  private show(station: Station) {
    this.active = station;
    for (const s of this.stations) s.setVisible(s === station);
    const grill = station.method === "grill";
    this.toolIcons.tongs.setVisible(grill);
    this.toolIcons.scissors.setVisible(grill);
    this.toolIcons.salt.setVisible(grill);
    this.toolIcons.ladle.setVisible(!grill);
    this.tabs.forEach((tab, i) => tab.setOn(this.stations[i] === station));
    this.pickTool(grill ? "tongs" : "ladle");
  }

  // ------------------------------------------------------------- service

  private buildService() {
    // dragging the plate onto an order serves it
    const zone = this.add.zone(PLATE.x, PLATE.y, PLATE_HIT.w * 0.8, PLATE_HIT.h * 0.8).setInteractive({ useHandCursor: true });
    zone.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.plated.length === 0 || this.ghost) return;
      const box = this.add.container(p.x, p.y).setDepth(96).setAlpha(0.9);
      box.add(this.add.image(0, 0, "plate").setScale(1.2));
      for (const it of this.plated) box.add(this.add.image((it.sprite.x - PLATE.x) * 0.6, (it.sprite.y - PLATE.y) * 0.6, it.sprite.texture.key).setScale(0.4));
      this.plateDrag = box;
    });
    addButton(this, 600, 22, t("service.toShop"), () => this.game.events.emit("service:shop"), 60);
    this.stations.forEach((station, i) => {
      const box = this.add.container(STATION_CHIPS.x, STATION_CHIPS.y[i]).setDepth(80);
      const ring = this.add.graphics();
      box.add([this.add.image(0, 0, i === 0 ? "grill" : "pot_clear").setScale(0.17), ring]);
      box.setSize(44, 44).setInteractive({ useHandCursor: true }).on("pointerdown", () => this.show(station));
      this.stationChips.push({ box, ring, station });
    });
  }

  // The station shown in front (the shop scene picks it when an order is tapped).
  showMethod(method: Method) {
    const s = this.stations.find((x) => (method === "grill" ? x.method === "grill" : x.method === "boil"));
    if (s) this.show(s);
  }

  private updateService() {
    const orders = (this.registry.get("orders") as Order[] | undefined) ?? [];
    const shown = orders.slice(0, CHIPS.max);
    // rebuild the chips when the queue changes, refresh the patience every frame
    if (shown.map((o) => o.customer).join() !== this.chips.map((c) => c.customer).join()) {
      for (const c of this.chips) c.box.destroy();
      this.chips = shown.map((o, i) => {
        const box = this.add.container(CHIPS.x + i * CHIPS.step, CHIPS.y).setDepth(80);
        const bar = this.add.graphics();
        box.add([this.add.image(0, -4, `dish_${o.dish}`).setScale(0.9), bar]);
        return { customer: o.customer, box, bar };
      });
    }
    for (const c of this.chips) {
      const o = shown.find((x) => x.customer === c.customer)!;
      c.bar.clear().fillStyle(0x000000, 0.6).fillRect(-18, 16, 36, 4);
      c.bar.fillStyle(o.patience > 0.5 ? 0x7fe07f : o.patience > 0.25 ? 0xffd166 : 0xff5050, 1).fillRect(-18, 16, 36 * o.patience, 4);
    }
    // station chips: how far along, and a red blink when something is about to burn or boil over
    const blink = Math.floor(this.time.now / 250) % 2 === 0;
    for (const sc of this.stationChips) {
      const st = sc.station.status();
      sc.ring.clear().lineStyle(3, 0x000000, 0.5).strokeCircle(0, 0, 21);
      if (st.level > 0) sc.ring.lineStyle(3, 0xffb040, 1).beginPath().arc(0, 0, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * st.level).strokePath();
      if (st.alarm && blink) sc.ring.lineStyle(3, 0xff3030, 1).strokeCircle(0, 0, 24);
      sc.box.setScale(sc.station === this.active ? 1.1 : 0.9);
    }
  }

  private dropPlate(p: Phaser.Input.Pointer) {
    const box = this.plateDrag;
    if (!box) return;
    this.plateDrag = null;
    box.destroy();
    const chip = this.chips.find((c) => Math.abs(c.box.x - p.x) < 22 && Math.abs(c.box.y - p.y) < 26);
    if (!chip) return;
    const order = ((this.registry.get("orders") as Order[] | undefined) ?? []).find((o) => o.customer === chip.customer);
    const recipe = this.menu.find((m) => m.dish === order?.dish)?.items ?? [];
    const ids = this.plated.map((x) => parseItemKey(x.key)!.id);
    if (!order || ids.length !== recipe.length || !recipe.every((id) => ids.includes(id))) {
      this.say(t("service.wrongDish"), chip.box.x, chip.box.y + 30, "#ffb0b0");
      return;
    }
    const r = plateResult(this.plated.map((x) => x.judgement));
    const keys = this.plated.map((x) => x.key);
    for (const k of keys) this.usedTotal[k] = (this.usedTotal[k] ?? 0) + 1;
    for (const x of this.plated) x.sprite.destroy();
    this.plated = [];
    this.plateMethod = null;
    this.bowl.setVisible(false);
    this.game.events.emit("service:serve", { customer: order.customer, keys, accuracy: r.accuracy });
  }

  private serve() {
    if (this.served || this.plated.length === 0) return;
    this.served = true;
    const r = plateResult(this.plated.map((p) => p.judgement));
    const plate: CookPlate = { keys: this.plated.map((p) => p.key), method: this.plateMethod ?? this.active.method, accuracy: r.accuracy, note: r.note };
    this.game.events.emit("cook:plate", plate);
  }
}
