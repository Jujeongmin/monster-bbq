import Phaser from "phaser";
import type { DishId, Method } from "../../../shared/content/dishes";
import type { Customer } from "../../../shared/service/plan";
import { dishScore, serveValue } from "../../../shared/service/settle";
import { t } from "../../i18n";
import type { CookStage, Order } from "../cook/CookStage";
import { createCharacterAnims, loadCharacterArt } from "../hunt/anims";
import { addButton, addGauge, loadUiArt, TEXT, type UiButton, type UiGauge } from "../ui";

// The shop at night (cooking-service design 5), seen from the side. Customers (the server's seed, see
// shared/service/plan) come in at their time, sit at their table and show their order with a patience
// bar. Tap an order: the view zooms into the cooking stage at that dish's station (the stage keeps
// cooking either way). A served customer eats, pays and leaves; one who runs out of patience leaves
// angry. When everyone is done: game.events "service:end" { served, left }.
// Art: until the shop and customer pictures are approved (plan 05b Task 4), the approved hunt monsters
// stand in for customers and the grill for tables.
export interface ServiceData {
  // the service's id: the shop clock is kept per service so a reload resumes the night where it was
  serviceId: string;
  customers: Customer[];
  // dish -> its station
  methods: Partial<Record<DishId, Method>>;
}

export interface ServedReport {
  customer: string;
  keys: string[];
  accuracy: number;
}

const MAX_DT_MS = 50;
const SEATS_X = [110, 250, 390, 530];
const SEAT_Y = 214;
const DOOR_X = -30;
const WALK_SPEED = 70; // px per second
const STAND_IN = ["rabbit", "chicken", "boar", "bee"] as const;
const label = TEXT;

type Phase = "waiting" | "walking" | "seated" | "eating" | "leaving" | "gone";

interface Guest {
  c: Customer;
  phase: Phase;
  sprite: Phaser.GameObjects.Sprite;
  bubble: Phaser.GameObjects.Container;
  gauge: UiGauge | null;
  waitedMs: number;
  targetX: number;
  angry: boolean;
}

export class ServiceScene extends Phaser.Scene {
  private customers: Customer[] = [];
  private serviceId = "";
  private savedAt = 0;
  private methods: Partial<Record<DishId, Method>> = {};
  private guests: Guest[] = [];
  private clock = 0;
  private paused = false;
  private served: ServedReport[] = [];
  private left: string[] = [];
  private ended = false;
  private inCook = false;
  private pauseButton!: UiButton;
  private tally!: Phaser.GameObjects.Text;
  private earned = 0;

  constructor() {
    super("shop");
  }

  init(data: ServiceData) {
    this.customers = data.customers;
    this.serviceId = data.serviceId;
    this.savedAt = 0;
    this.methods = data.methods;
    this.guests = [];
    this.clock = this.resumedClock();
    this.paused = false;
    this.served = [];
    this.left = [];
    this.ended = false;
    this.inCook = false;
    this.earned = 0;
  }

  // the grill, plate and dish pictures come from the cooking stage, which loads first (ServiceGame)
  preload() {
    loadCharacterArt(this);
    loadUiArt(this);
  }

  create() {
    createCharacterAnims(this);
    this.cameras.main.setBackgroundColor("#3a2a20");
    // tables: the grill stands in until the shop picture is approved
    for (const x of SEATS_X) this.add.image(x, SEAT_Y + 34, "grill").setScale(0.3).setDepth(SEAT_Y + 40);
    // tonight's tally on a wooden strip, and the pause button
    this.add.nineslice(112, 16, "ui_topbar", undefined, 212, 19, 12, 12, 6, 6).setDepth(999);
    this.add.image(18, 16, "ui_icon_gold").setDepth(1000);
    this.tally = this.add.text(34, 16, "", label).setOrigin(0, 0.5).setDepth(1000);
    this.pauseButton = addButton(this, 596, 18, t("service.pause"), () => this.togglePause(), 64);
    this.pauseButton.box.setDepth(1000);
    this.game.events.on("service:serve", (r: ServedReport) => this.onServed(r));
    this.game.events.on("service:shop", () => this.toShop());
    this.events.once("shutdown", () => {
      this.game.events.off("service:serve");
      this.game.events.off("service:shop");
    });
  }

  private togglePause() {
    this.paused = !this.paused;
    this.pauseButton.setText(this.paused ? t("service.resume") : t("service.pause"));
    // the stage stops cooking too
    if (this.paused) this.scene.pause("cook");
    else this.scene.resume("cook");
  }

  update(_time: number, rawDt: number) {
    if (this.paused || this.ended) return;
    const dt = Math.min(rawDt, MAX_DT_MS);
    this.clock += dt;
    // remember how far into the night we are (a reload resumes there instead of starting over)
    if (this.clock - this.savedAt > 1000) {
      this.savedAt = this.clock;
      try {
        sessionStorage.setItem(`monster-bbq:service:${this.serviceId}`, String(Math.round(this.clock)));
      } catch {
        // private mode: a reload starts the night over, as before
      }
    }
    // arrivals: to their table, or queue at the door while it is taken
    for (const c of this.customers) {
      if (c.arriveMs <= this.clock && !this.guests.some((g) => g.c.id === c.id)) this.guests.push(this.makeGuest(c));
    }
    for (const g of this.guests) this.stepGuest(g, dt);
    // waiting orders for the stage's chips: seated, not served yet, oldest first
    const orders: Order[] = this.guests
      .filter((g) => g.phase === "seated")
      .map((g) => ({ customer: g.c.id, dish: g.c.dish, patience: Math.max(0, 1 - g.waitedMs / g.c.patienceMs) }));
    this.registry.set("orders", orders);
    this.tally.setText(t("service.tally", { served: this.served.length, total: this.customers.length, gold: this.earned }));
    if (!this.ended && this.customers.length > 0 && this.guests.length === this.customers.length && this.guests.every((g) => g.phase === "gone")) {
      this.ended = true;
      this.time.delayedCall(800, () => this.game.events.emit("service:end", { served: this.served, left: this.left }));
    }
  }

  private resumedClock(): number {
    try {
      const v = Number(sessionStorage.getItem(`monster-bbq:service:${this.serviceId}`));
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch {
      return 0;
    }
  }

  private makeGuest(c: Customer): Guest {
    const who = STAND_IN[c.kind];
    const sprite = this.add.sprite(DOOR_X, SEAT_Y, `${who}_side_0`).setOrigin(0.5, 0.9).setScale(1.3);
    sprite.play(`${who}_walk_side`);
    const bubble = this.add.container(0, 0).setVisible(false).setDepth(900);
    // after a reload, guests who came in meanwhile have already been waiting; those out of patience are gone
    const waited = Math.max(0, this.clock - c.arriveMs);
    const g: Guest = { c, phase: "waiting", sprite, bubble, gauge: null, waitedMs: waited, targetX: SEATS_X[c.seat], angry: false };
    this.makeBubble(g);
    if (waited >= c.patienceMs) {
      g.phase = "gone";
      sprite.destroy();
      bubble.destroy();
      this.left.push(c.id);
    }
    return g;
  }

  // The order above the customer: the dish in a speech bubble, patience in a gauge below it. Tap to cook.
  private makeBubble(g: Guest) {
    g.bubble.removeAll(true);
    const bubble = this.add.nineslice(0, 0, "ui_bubble", undefined, 56, 50, 22, 8, 8, 14);
    const dish = this.add.image(1, -4, `dish_${g.c.dish}`);
    g.gauge = addGauge(this, 0, 32);
    g.bubble.add([bubble, dish, g.gauge.box]);
    g.bubble.setSize(56, 50).setInteractive({ useHandCursor: true }).on("pointerdown", () => this.openOrder(g));
  }

  private stepGuest(g: Guest, dt: number) {
    const s = g.sprite;
    const who = STAND_IN[g.c.kind];
    const seatTaken = () => this.guests.some((o) => o !== g && o.c.seat === g.c.seat && (o.phase === "walking" || o.phase === "seated" || o.phase === "eating"));
    switch (g.phase) {
      case "waiting":
        // queue just inside the door until the table is free (patience already running)
        g.waitedMs += dt;
        if (s.x < 30) s.x += (WALK_SPEED * dt) / 1000;
        else s.anims.stop();
        if (!seatTaken()) {
          g.phase = "walking";
          s.play(`${who}_walk_side`);
        }
        break;
      case "walking":
        g.waitedMs += dt;
        s.setFlipX(false);
        s.x = Math.min(g.targetX, s.x + (WALK_SPEED * 1.6 * dt) / 1000);
        if (s.x >= g.targetX) {
          g.phase = "seated";
          s.anims.stop();
          s.setTexture(`${who}_side_0`);
          g.bubble.setPosition(s.x, SEAT_Y - 62).setVisible(true);
        }
        break;
      case "seated": {
        g.waitedMs += dt;
        const left = Math.max(0, 1 - g.waitedMs / g.c.patienceMs);
        g.gauge?.set(left);
        // impatient: a little jiggle when the bar runs red
        g.bubble.setAngle(left < 0.25 ? Math.sin(this.clock / 60) * 6 : 0);
        if (left <= 0) this.storm(g);
        break;
      }
      case "eating":
        break;
      case "leaving":
        s.x += (g.angry ? -1 : 1) * ((WALK_SPEED * 1.8 * dt) / 1000);
        if (s.x < DOOR_X - 10 || s.x > 680) {
          g.phase = "gone";
          s.destroy();
          g.bubble.destroy();
        }
        break;
    }
    if (g.phase !== "gone") s.setDepth(SEAT_Y);
  }

  // Out of patience: storms out, and the shop's reputation suffers.
  private storm(g: Guest) {
    g.phase = "leaving";
    g.angry = true;
    g.bubble.setVisible(false);
    this.left.push(g.c.id);
    g.sprite.setTint(0xff7070).setFlipX(true).play(`${STAND_IN[g.c.kind]}_walk_side`);
    this.pop(g.sprite.x, SEAT_Y - 70, t("service.angry"), "#ff8080");
  }

  private onServed(r: ServedReport) {
    const g = this.guests.find((x) => x.c.id === r.customer && x.phase === "seated");
    if (!g) return;
    this.served.push(r);
    g.phase = "eating";
    g.bubble.setVisible(false);
    const v = serveValue(g.c.dish, dishScore(r.accuracy, r.keys));
    this.earned += v.gold + v.tip;
    // a happy little bounce while eating, then the coins, then out
    this.tweens.add({ targets: g.sprite, y: SEAT_Y - 4, duration: 180, yoyo: true, repeat: 5 });
    this.time.delayedCall(2200, () => {
      this.pop(g.sprite.x, SEAT_Y - 70, `+${v.gold + v.tip}${v.tip ? " ♥" : ""}`, v.happy ? "#ffd166" : "#ffffff");
      g.phase = "leaving";
      g.sprite.play(`${STAND_IN[g.c.kind]}_walk_side`);
    });
  }

  // Into the cooking stage at the order's station: a quick zoom toward the table, then the stage.
  private openOrder(g: Guest) {
    if (this.inCook || this.paused) return;
    this.inCook = true;
    const cook = this.scene.get("cook") as CookStage;
    cook.showMethod(this.methods[g.c.dish] ?? "grill");
    this.cameras.main.pan(g.sprite.x, SEAT_Y - 20, 250, "Sine.easeIn");
    this.cameras.main.zoomTo(1.8, 250, "Sine.easeIn", false, (_cam, progress) => {
      if (progress < 1) return;
      this.input.enabled = false;
      this.scene.setVisible(false);
      cook.scene.setVisible(true);
      cook.input.enabled = true;
      cook.cameras.main.fadeIn(180);
    });
  }

  private toShop() {
    if (!this.inCook) return;
    this.inCook = false;
    const cook = this.scene.get("cook") as CookStage;
    cook.input.enabled = false;
    cook.scene.setVisible(false);
    this.scene.setVisible(true);
    this.input.enabled = true;
    this.cameras.main.zoomTo(1, 250, "Sine.easeOut");
    this.cameras.main.pan(320, 180, 250, "Sine.easeOut");
  }

  private pop(x: number, y: number, text: string, color: string) {
    const s = this.add.text(x, y, text, { ...label, fontSize: "13px", color }).setOrigin(0.5).setDepth(1000);
    this.tweens.add({ targets: s, y: y - 18, alpha: 0, delay: 700, duration: 800, onComplete: () => s.destroy() });
  }
}
