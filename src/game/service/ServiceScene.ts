import Phaser from "phaser";
import { DISHES, type DishId } from "../../../shared/content/dishes";
import type { TonightDish } from "../../../shared/kitchen/dish";
import type { Customer } from "../../../shared/service/plan";
import { t } from "../../i18n";
import { artUrl } from "../art";
import { loadServed, pickDish, platesLeft, saveServed, type ServedReport } from "./night";
import { createCharacterAnims, loadCharacterArt } from "../hunt/anims";
import { addButton, addGauge, kitSlice, loadUiArt, TEXT, type UiButton, type UiGauge } from "../ui";

// The shop at night (cooking-service design 5), seen from the side. Customers (the server's seed, see
// shared/service/plan) come in at their time, sit at their table and show their order with a patience
// bar. Tap an order: the plate goes out at once (restaurant v2 stage 1, until the waiter serves by hand).
// When the last plate is gone the doors close by themselves. A served customer eats, pays and leaves; one who runs out of patience leaves
// angry. Closing (user, 2026-10-15): "close orders" lets no one else in; after it "close the hall" sends
// whoever is still waiting home angry (they count as left). When everyone is done: game.events
// "service:end" { served, left }.
// Art: until the shop and customer pictures are approved (plan 05b Task 4), the approved hunt monsters
// stand in for customers and the grill for tables.
export interface ServiceData {
  // the service's id: the shop clock is kept per service so a reload resumes the night where it was
  serviceId: string;
  customers: Customer[];
  // tonight's plates and prices (openShop)
  dishes: TonightDish[];
}

export type { ServedReport };

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
  private plates = new Map<DishId, number>();
  private prices = new Map<DishId, number>();
  private guests: Guest[] = [];
  private clock = 0;
  private paused = false;
  private served: ServedReport[] = [];
  private left: string[] = [];
  private ended = false;
  // orders closed: no more arrivals; the button then closes the hall
  private ordersClosed = false;
  private closeButton!: UiButton;
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
    // what was served before a reload stays served (the ingredients went when the shop opened)
    this.served = loadServed(sessionStorage, data.serviceId);
    this.plates = platesLeft(data.dishes, this.served);
    this.prices = new Map(data.dishes.map((d) => [d.dish, d.price]));
    this.guests = [];
    this.clock = this.resumedClock();
    this.paused = false;
    this.left = [];
    this.ended = false;
    this.ordersClosed = this.resumedClosed();
    this.earned = this.served.reduce((n, s) => n + (this.prices.get(s.dish) ?? 0), 0);
  }

  preload() {
    loadCharacterArt(this);
    loadUiArt(this);
    // tables: the grill stands in until the new shop art goes in (stage 2)
    this.load.image("grill", artUrl("test/cooking/grill.png"));
    for (const id of Object.keys(DISHES)) this.load.image(`dish_${id}`, artUrl(`test/dishes/${id}.png`));
  }

  create() {
    createCharacterAnims(this);
    this.cameras.main.setBackgroundColor("#3a2a20");
    // tables: the grill stands in until the shop picture is approved
    for (const x of SEATS_X) this.add.image(x, SEAT_Y + 34, "grill").setScale(0.3).setDepth(SEAT_Y + 40);
    // tonight's tally on a wooden strip, and the pause button
    kitSlice(this, 112, 16, "topbar", 212, 20, 5, 5, 3, 3).setDepth(999);
    this.add.image(18, 16, "ui_icon_gold").setDepth(1000);
    this.tally = this.add.text(34, 16, "", label).setOrigin(0, 0.5).setDepth(1000);
    this.pauseButton = addButton(this, 596, 18, t("service.pause"), () => this.togglePause(), 64);
    this.pauseButton.box.setDepth(1000);
    this.closeButton = addButton(this, 514, 18, t(this.ordersClosed ? "service.closeHall" : "service.closeOrders"), () => this.close(), 84);
    this.closeButton.box.setDepth(1000);
  }

  // First press: no one else comes in. Second press: the hall closes and whoever still waits leaves angry.
  private close() {
    if (this.ended) return;
    if (!this.ordersClosed) {
      this.ordersClosed = true;
      try {
        sessionStorage.setItem(`monster-bbq:service:${this.serviceId}:closed`, "1");
      } catch {
        // private mode: a reload opens the doors again, nothing worse
      }
      this.closeButton.setText(t("service.closeHall"));
      this.pop(320, 70, t("service.ordersClosed"), "#ffd166");
      return;
    }
    for (const g of this.guests) if (g.phase === "waiting" || g.phase === "walking" || g.phase === "seated") this.storm(g);
    this.closeButton.setEnabled(false);
  }

  private resumedClosed(): boolean {
    try {
      return sessionStorage.getItem(`monster-bbq:service:${this.serviceId}:closed`) === "1";
    } catch {
      return false;
    }
  }

  private togglePause() {
    this.paused = !this.paused;
    this.pauseButton.setText(this.paused ? t("service.resume") : t("service.pause"));
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
      if (!this.ordersClosed && c.arriveMs <= this.clock && !this.guests.some((g) => g.c.id === c.id)) this.guests.push(this.makeGuest(c));
    }
    for (const g of this.guests) this.stepGuest(g, dt);
    const left = [...this.plates.values()].reduce((a, b) => a + b, 0);
    this.tally.setText(`${t("service.tally", { served: this.served.length, total: this.customers.length, gold: this.earned })} · ${t("service.platesLeft", { n: left })}`);
    // the last plate is gone: no one else comes in (the ones inside still wait for theirs)
    if (left === 0 && !this.ordersClosed) this.close();
    // done when everyone who came has gone, and either everyone came or the doors were closed
    const allCame = this.guests.length === this.customers.length || this.ordersClosed;
    if (!this.ended && (this.customers.length > 0 || this.ordersClosed) && allCame && this.guests.every((g) => g.phase === "gone")) {
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
    // served before a reload: already fed and gone
    if (this.served.some((s) => s.customer === c.id)) {
      g.phase = "gone";
      sprite.destroy();
      bubble.destroy();
      return g;
    }
    if (waited >= c.patienceMs) {
      g.phase = "gone";
      sprite.destroy();
      bubble.destroy();
      this.left.push(c.id);
    }
    return g;
  }

  // The order above the customer: the dish in a speech bubble, patience in a gauge below it. Tap to serve.
  private makeBubble(g: Guest) {
    g.bubble.removeAll(true);
    const bubble = kitSlice(this, 0, 0, "bubble_plain", 56, 50, 3, 3, 3, 3);
    const dish = this.add.image(1, -4, `dish_${g.c.dish}`);
    g.gauge = addGauge(this, 0, 32);
    g.bubble.add([bubble, dish, g.gauge.box]);
    g.bubble.setSize(56, 50).setInteractive({ useHandCursor: true }).on("pointerdown", () => this.serve(g));
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
          // tonight's dish if plates are left, else any dish that still has some; none left: home, unbothered
          const dish = pickDish(this.plates, g.c.dish);
          if (!dish) {
            g.phase = "leaving";
            s.setFlipX(true).play(`${who}_walk_side`);
            g.angry = true;
            break;
          }
          if (dish !== g.c.dish) {
            g.c = { ...g.c, dish };
            this.makeBubble(g);
          }
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

  // A tapped order goes out at once if a plate of it is left: the customer eats, pays and leaves.
  private serve(g: Guest) {
    if (this.paused || g.phase !== "seated") return;
    const n = this.plates.get(g.c.dish) ?? 0;
    if (n < 1) return;
    this.plates.set(g.c.dish, n - 1);
    this.served.push({ customer: g.c.id, dish: g.c.dish });
    saveServed(sessionStorage, this.serviceId, this.served);
    // that was the last plate of this dish: everyone else seated waiting for it gets a dish still on the pass
    if (n - 1 === 0)
      for (const o of this.guests) {
        if (o === g || o.phase !== "seated" || o.c.dish !== g.c.dish) continue;
        const other = pickDish(this.plates, o.c.dish);
        if (other) {
          o.c = { ...o.c, dish: other };
          this.makeBubble(o);
          o.bubble.setPosition(o.sprite.x, SEAT_Y - 62).setVisible(true);
        }
      }
    g.phase = "eating";
    g.bubble.setVisible(false);
    const gold = this.prices.get(g.c.dish) ?? 0;
    this.earned += gold;
    // a happy little bounce while eating, then the coins, then out
    this.tweens.add({ targets: g.sprite, y: SEAT_Y - 4, duration: 180, yoyo: true, repeat: 5 });
    this.time.delayedCall(2200, () => {
      this.pop(g.sprite.x, SEAT_Y - 70, `+${gold}`, "#ffd166");
      g.phase = "leaving";
      g.sprite.play(`${STAND_IN[g.c.kind]}_walk_side`);
    });
  }

  private pop(x: number, y: number, text: string, color: string) {
    const s = this.add.text(x, y, text, { ...label, fontSize: "13px", color }).setOrigin(0.5).setDepth(1000);
    this.tweens.add({ targets: s, y: y - 18, alpha: 0, delay: 700, duration: 800, onComplete: () => s.destroy() });
  }
}
