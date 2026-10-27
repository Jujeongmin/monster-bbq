import Phaser from "phaser";
import { BALANCE } from "../../../shared/balance";
import { DISHES, HOUSE_DISH, type DishId } from "../../../shared/content/dishes";
import { t, type StringKey } from "../../i18n";
import { artUrl, hasArt } from "../art";
import { createCharacterAnims, loadCharacterArt } from "../hunt/anims";
import { joystickVector } from "../joystick";
import { addButton, addGauge, kitSlice, loadUiArt, TEXT, TEXT_SMALL, type UiButton, type UiGauge } from "../ui";
import { promptOf } from "../shop3d/look";
import { loadShift, saveShift } from "./night";
import { LAYOUT, Shift, type Guest, type Target } from "./shift";
import { clockText, SHOP_WIDTH, type ServiceData } from "./types";

// The shop at night (restaurant v2 design 4, plan 07b), like Dave the Diver's sushi bar: one long grill
// counter, yokai on stools in front of it (seen from behind), the waiter walking the aisle behind it,
// Bandal cooking in the kitchen window, a clock on the open hours. The rules are ./shift.ts; this scene
// draws them and feeds them the keys: A/D or the stick to walk, Shift to run, Space or the action button
// to take, serve, add charcoal, scrub (pressed) and pour (held). When everyone is done: game.events
// "service:end" { served, left, cleaned }.
// The shop is wider than the hunt (960x540) so the characters stand as small against it as in Dave.
// Art: the shop, counter props and the yokai are approved (2026-10-16). Pictures still to come drop in
// by file, no code change: the 480x270 shop (test/shop/hall480.png, else the 320x180 one drawn 3x), the
// shop's own small dishes (test/shop/dishes/<dish>.png, else the kitchen's icons shrunk), the waiter's
// shop outfit (test/waiter/<pose>.png, see WAITER_FRAMES; else the hunter stands in). New grills replace
// test/shop/grill_*.png.
export { SHOP_HEIGHT, SHOP_WIDTH, type ServedReport, type ServiceData } from "./types";
const BIG_HALL = hasArt("test/shop/hall480.png");
const BG_W = BIG_HALL ? 480 : 320;
const BG_H = BIG_HALL ? 270 : 180;
const BG_SCALE = SHOP_WIDTH / BG_W; // shop picture pixel -> game pixels
// the counter front and floor start here in the picture (row 111 of the 320 one): drawn again over the waiter
const FRONT_ROW = Math.round((111 * BG_W) / 320);
const S = 2; // characters and props: art pixel -> game pixels
// The waiter's shop outfit, frame files under test/waiter/ (all of them, or the hunter stands in).
const WAITER_FRAMES = { walk: 4, carry: 4, stand: 1, serve: 1, grind: 2, scrub: 2, pour: 1 } as const;
type Pose = keyof typeof WAITER_FRAMES;
const WAITER_ART = Object.entries(WAITER_FRAMES).every(([pose, n]) => Array.from({ length: n }, (_, i) => `test/waiter/${pose}_${i}.png`).every(hasArt));
const WAITER_SCALE = WAITER_ART ? S : 1.6; // the hunter standing in is finer art: as tall as the guests
// the shop's own small dishes when drawn, else the kitchen's icons shrunk
const SHOP_DISHES = Object.keys(DISHES).every((id) => hasArt(`test/shop/dishes/${id}.png`));
// the night moves in slices of at most STEP_MS, as many as the frame took (a slow phone runs it as fast as a
// PC: user 2026-10-22); a longer gap (the tab hidden) counts as MAX_GAP_MS
const STEP_MS = 50;
const MAX_GAP_MS = 250;
const COUNTER_TOP = 330; // the grills stand here
const SEAT_FLOOR = 404; // the stools stand at the counter's foot
const WALK_FLOOR = 448;
const WAITER_FEET = 342;
const BUBBLE_Y = 268;
// the order bubble, sized to the dish pictures in it; plates on the pass overlap a little when big
const BUBBLE = SHOP_DISHES ? { w: 64, h: 60 } : { w: 40, h: 38 };
const PASS_STEP = SHOP_DISHES ? 38 : 32;
const PLAQUES = [352, 400, 448, 498, 548, 597];
const YOKAI = ["dokkaebi", "gumiho", "reaper", "ghost"] as const;
const POSES = ["walk_0", "walk_1", "sit", "eat", "happy", "angry"];
const PROPS = ["grill_lit", "grill_dirty", "grill_off", "stool", "coal_box", "drink_cart", "tray", "cup_tea", "cup_cider", "bowl_sikhye", "plate", "plate_dirty"];
const BANDAL = ["idle", "breathe", "grill", "turn", "serve", "smile"];
const DISH_SCALE = SHOP_DISHES ? S : 0.6;
const PLAQUE_SCALE = SHOP_DISHES ? 1 : 0.6; // the wall plaques are narrower than a bubble
const STICK = { x: 110, y: 440, radius: 40, deadZone: 0.25 };
const ACT_BTN = { x: 850, y: 470, radius: 34 };
const drinkIcon = { tea: "prop_cup_tea", cider: "prop_cup_cider", sikhye: "prop_bowl_sikhye" } as const;

interface GuestView {
  sprite: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Image;
  fill: Phaser.GameObjects.Rectangle;
}


export class ServiceScene extends Phaser.Scene {
  private data0!: ServiceData;
  private shift!: Shift;
  private savedAt = 0;
  private paused = false;
  private ended = false;
  private views = new Map<string, GuestView>();
  private grills: Phaser.GameObjects.Image[] = [];
  private stools: Phaser.GameObjects.Image[] = [];
  private passPlates: Phaser.GameObjects.Image[] = [];
  private carried: Phaser.GameObjects.Image | null = null;
  private plaqueCounts: Phaser.GameObjects.Text[] = [];
  private waiter!: Phaser.GameObjects.Sprite;
  // tonight's friends: the waiter's picture stands in, a name over each (staff design 5)
  private helpers: { body: Phaser.GameObjects.Sprite; name: Phaser.GameObjects.Text }[] = [];
  private bandal!: Phaser.GameObjects.Image;
  private bandalBusyUntil = 0;
  private cart!: Phaser.GameObjects.Image;
  private coalBox!: Phaser.GameObjects.Image;
  private coalGauge!: UiGauge;
  private pourGauge!: UiGauge;
  private pourMark!: Phaser.GameObjects.Text;
  private glowing: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | null = null;
  // what the action key does at the nearest thing (shop remake step 3, same rule as the 3D shop)
  private promptText!: Phaser.GameObjects.Text;
  private tally!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private pauseButton!: UiButton;
  private keys!: Record<"A" | "D" | "LEFT" | "RIGHT" | "SHIFT" | "SPACE" | "E", Phaser.Input.Keyboard.Key>;
  private stickPointer: number | null = null;
  private stickX = 0;
  private stickKnob!: Phaser.GameObjects.Arc;
  private pose: Pose | null = null;
  private busyPose: Pose = "grind";
  private poseUntil = 0;

  constructor() {
    super("shop");
  }

  init(data: ServiceData) {
    this.data0 = data;
    const cfg = { customers: data.customers, dishes: data.dishes, stools: data.stools, walkMul: data.walkMul, coalPerDish: data.coalPerDish, staff: data.staff };
    // a reload picks the night up where it was (the ingredients went when the shop opened)
    const saved = loadShift(localStorage, data.serviceId);
    this.shift = new Shift(cfg, saved && saved.seats.length === data.stools ? saved : undefined);
    this.savedAt = this.shift.s.clock;
    // plates added to the menu from the page (shop remake step 4), and whether more could still be
    this.game.events.off("service:addPlates");
    this.game.events.on("service:addPlates", (dish: DishId, plates: number, price: number) => {
      this.shift.addPlates(dish, plates, price);
      saveShift(localStorage, data.serviceId, this.shift.s);
    });
    this.paused = false;
    this.ended = false;
    this.views = new Map();
    this.grills = [];
    this.stools = [];
    this.passPlates = [];
    this.carried = null;
    this.plaqueCounts = [];
    this.glowing = null;
    this.stickPointer = null;
    this.stickX = 0;
    this.pose = null;
    this.poseUntil = 0;
  }

  preload() {
    loadCharacterArt(this);
    loadUiArt(this);
    this.load.image("hall", artUrl(BIG_HALL ? "test/shop/hall480.png" : "test/shop/hall.png"));
    // tonight's friends who have their own pictures (staff design 9)
    for (const f of Object.values(this.data0.staff ?? {})) if (f && hasArt(`test/staff/${f.id}/walk_0.png`)) for (const n of ["walk_0", "walk_1", "walk_2", "walk_3", "work"]) this.load.image(`staff_${f.id}_${n}`, artUrl(`test/staff/${f.id}/${n}.png`));
    if (WAITER_ART) for (const [pose, n] of Object.entries(WAITER_FRAMES)) for (let i = 0; i < n; i++) this.load.image(`waiter_${pose}_${i}`, artUrl(`test/waiter/${pose}_${i}.png`));
    for (const p of PROPS) this.load.image(`prop_${p}`, artUrl(`test/shop/${p}.png`));
    for (const y of YOKAI) for (const p of POSES) this.load.image(`yk_${y}_${p}`, artUrl(`test/yokai/counter/${y}_${p}.png`));
    for (const b of BANDAL) this.load.image(`bandal_${b}`, artUrl(`test/bandal/${b}.png`));
    // and the bowl of rice once the dishes are gone (HOUSE_DISH)
    for (const id of [...Object.keys(DISHES), HOUSE_DISH]) this.load.image(`dish_${id}`, artUrl(SHOP_DISHES ? `test/shop/dishes/${id}.png` : `test/dishes/${id}.png`));
  }

  create() {
    createCharacterAnims(this);
    if (WAITER_ART && !this.anims.exists("waiter_walk"))
      for (const [pose, rate] of [["walk", 8], ["carry", 8], ["grind", 8], ["scrub", 10]] as const)
        this.anims.create({ key: `waiter_${pose}`, frames: Array.from({ length: WAITER_FRAMES[pose] }, (_, i) => ({ key: `waiter_${pose}_${i}` })), frameRate: rate, repeat: -1 });
    const s = this.shift.s;
    if (import.meta.env.DEV) (window as unknown as { __service?: ServiceScene }).__service = this;
    this.add.image(0, 0, "hall").setOrigin(0).setScale(BG_SCALE).setDepth(0);
    // Bandal in the kitchen window
    this.bandal = this.add.image(849, 314, "bandal_idle").setOrigin(0.5, 1).setScale(S).setDepth(5);
    // tonight's menu on the wall plaques: the dish and the plates still to order
    this.data0.dishes.slice(0, PLAQUES.length).forEach((d, i) => {
      this.add.image(PLAQUES[i], 152, `dish_${d.dish}`).setScale(PLAQUE_SCALE).setDepth(4);
      this.plaqueCounts.push(this.add.text(PLAQUES[i], 182, "", TEXT_SMALL).setOrigin(0.5).setDepth(4));
    });
    // the waiter walks behind the counter: the counter front and the floor are drawn again over the legs
    this.waiter = this.add.sprite(s.x, WAITER_FEET, WAITER_ART ? "waiter_stand_0" : "hunter_side_1").setOrigin(0.5, 1).setScale(WAITER_SCALE).setDepth(10);
    this.add.image(0, 0, "hall").setOrigin(0).setScale(BG_SCALE).setCrop(0, FRONT_ROW, BG_W, BG_H - FRONT_ROW).setDepth(20);
    for (const seat of s.seats) {
      this.grills.push(this.add.image(seat.x, COUNTER_TOP, "prop_grill_off").setOrigin(0.5, 1).setScale(S).setDepth(30));
      this.stools.push(this.add.image(seat.x, SEAT_FLOOR, "prop_stool").setOrigin(0.5, 1).setScale(S).setDepth(40));
    }
    this.cart = this.add.image(LAYOUT.drinkCart, WALK_FLOOR, "prop_drink_cart").setOrigin(0.5, 1).setScale(S).setDepth(40);
    this.coalBox = this.add.image(LAYOUT.coalBox, WALK_FLOOR, "prop_coal_box").setOrigin(0.5, 1).setScale(S).setDepth(40);
    this.coalGauge = addGauge(this, LAYOUT.coalBox - 14, 382, 64);
    this.coalGauge.box.setDepth(60);
    this.add.image(LAYOUT.coalBox - 58, 382, "ui_icon_charcoal").setDepth(61);
    this.pourGauge = addGauge(this, LAYOUT.drinkCart, 372, 72);
    this.pourGauge.box.setDepth(60).setVisible(false);
    this.pourMark = this.add.text(LAYOUT.drinkCart - 36 + 72 * BALANCE.service.drinks.line, 358, "▼", TEXT_SMALL).setOrigin(0.5).setDepth(61).setVisible(false);
    // tonight's tally and the clock on a wooden strip, and the buttons
    kitSlice(this, 220, 18, "topbar", 420, 22, 5, 5, 3, 3).setDepth(999);
    this.add.image(22, 18, "ui_icon_gold").setDepth(1000);
    this.tally = this.add.text(38, 18, "", TEXT).setOrigin(0, 0.5).setDepth(1000);
    this.promptText = this.add.text(0, 0, "", TEXT_SMALL).setOrigin(0.5, 1).setDepth(999).setVisible(false);
    this.clock = this.add.text(420, 18, "", TEXT).setOrigin(1, 0.5).setDepth(1000);
    this.pauseButton = addButton(this, 910, 20, t("service.pause"), () => this.togglePause(), 64);
    this.pauseButton.box.setDepth(1000);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("A,D,LEFT,RIGHT,SHIFT,SPACE,E") as typeof this.keys;
    // the action key: E as by day and in the hunt (user, 2026-10-20), or Space
    for (const key of [this.keys.SPACE, this.keys.E]) {
      key.on("down", () => this.press());
      key.on("up", () => this.release());
    }
    if (this.sys.game.device.input.touch || new URLSearchParams(location.search).has("touch")) this.createTouchControls();
  }

  // Placeholder touch controls, as on the hunt (UI art later): a stick on the left, the action button
  // on the right (press to act, hold at the drink cart to pour).
  private createTouchControls() {
    this.input.addPointer(2);
    const ui = <T extends Phaser.GameObjects.Arc>(o: T) => o.setDepth(10000);
    ui(this.add.circle(STICK.x, STICK.y, STICK.radius, 0x000000, 0.35).setStrokeStyle(1, 0xffffff, 0.6));
    this.stickKnob = ui(this.add.circle(STICK.x, STICK.y, 16, 0xffffff, 0.6));
    const act = ui(this.add.circle(ACT_BTN.x, ACT_BTN.y, ACT_BTN.radius, 0x30a050, 0.6).setStrokeStyle(1, 0xffffff, 0.8));
    this.add.text(ACT_BTN.x, ACT_BTN.y, t("service.actButton"), TEXT_SMALL).setOrigin(0.5).setDepth(10001);
    act.setInteractive(new Phaser.Geom.Circle(ACT_BTN.radius, ACT_BTN.radius, ACT_BTN.radius + 6), Phaser.Geom.Circle.Contains);
    act.on("pointerdown", () => this.press());
    act.on("pointerup", () => this.release());
    act.on("pointerout", () => this.release());
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.x < SHOP_WIDTH * 0.45 && p.y > 60 && this.stickPointer === null) {
        this.stickPointer = p.id;
        this.updateStick(p);
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.id === this.stickPointer) this.updateStick(p);
    });
    const up = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickPointer) return;
      this.stickPointer = null;
      this.stickX = 0;
      this.stickKnob.setPosition(STICK.x, STICK.y);
    };
    this.input.on("pointerup", up);
    this.input.on("pointerupoutside", up);
  }

  private updateStick(p: Phaser.Input.Pointer) {
    const v = joystickVector(STICK, { x: p.x, y: p.y }, STICK.radius, STICK.deadZone);
    this.stickX = v.x;
    this.stickKnob.setPosition(STICK.x + v.x * STICK.radius, STICK.y);
  }

  private press() {
    if (this.paused || this.ended) return;
    if (this.shift.target()?.kind === "drinks") this.shift.pourStart();
    else this.shift.act();
  }

  private release() {
    if (this.shift.s.pouring) this.shift.pourEnd();
  }

  private togglePause() {
    this.paused = !this.paused;
    this.pauseButton.setText(this.paused ? t("service.resume") : t("service.pause"));
  }

  update(time: number, rawDt: number) {
    if (this.paused || this.ended) return;
    const dt = Math.min(rawDt, MAX_GAP_MS);
    const k = this.keys;
    const x = Phaser.Math.Clamp((k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0) + this.stickX, -1, 1);
    for (let left = dt; left > 0; left -= STEP_MS) this.shift.tick(Math.min(left, STEP_MS), { x, run: k.SHIFT.isDown || Math.abs(this.stickX) > 0.9 });
    if (this.shift.s.clock - this.savedAt > 1000) {
      this.savedAt = this.shift.s.clock;
      saveShift(localStorage, this.data0.serviceId, this.shift.s);
    }
    this.handleEvents(time);
    this.draw(time, x);
    if (this.shift.done) {
      this.ended = true;
      saveShift(localStorage, this.data0.serviceId, this.shift.s);
      this.time.delayedCall(800, () => this.game.events.emit("service:end", this.shift.report()));
    }
  }

  private handleEvents(time: number) {
    for (const e of this.shift.drain()) {
      switch (e.type) {
        case "take":
        case "drink":
          this.poseUntil = time + 250;
          break;
        case "served": {
          this.poseUntil = time + 250;
          const v = this.views.get(e.guest);
          if (v) this.pop(v.sprite.x, BUBBLE_Y - 20, t("service.tip", { n: e.tip }), "#ffd166");
          this.bandal.setTexture("bandal_smile");
          this.bandalBusyUntil = time + 700;
          break;
        }
        case "cooked":
          this.bandal.setTexture("bandal_serve");
          this.bandalBusyUntil = time + 500;
          break;
        case "angry": {
          const v = this.views.get(e.guest);
          if (v) this.pop(v.sprite.x, BUBBLE_Y - 20, t("service.angry"), "#ff8080");
          break;
        }
        case "scrub":
          this.busyPose = "scrub";
          if (e.done) this.pop(this.shift.s.seats[e.seat].x, COUNTER_TOP - 40, t("service.tip", { n: e.tip }), "#ffd166");
          break;
        case "pour":
          this.pop(LAYOUT.drinkCart, 348, t(`service.pour.${e.pour}`), e.pour === "perfect" ? "#ffd166" : e.pour === "good" ? "#bfe8a0" : "#ff8080");
          break;
        case "coal":
          this.busyPose = "grind";
          this.pop(LAYOUT.coalBox, 364, `${Math.round(e.level)}%`, "#ffb070");
          break;
        case "noCoal":
          this.pop(LAYOUT.coalBox, 348, t("service.coalOut"), "#ff8080");
          break;
        case "soldOut":
          this.pop(480, 90, t("service.soldOut"), "#ffd166");
          break;
        case "closing":
          this.pop(480, 90, t("service.closing"), "#ffd166");
          break;
      }
    }
  }

  private draw(time: number, moveX: number) {
    const s = this.shift.s;
    (s.helpers ?? []).forEach((h, i) => {
      if (!this.helpers[i]) {
        const body = this.add.sprite(0, WAITER_FEET, WAITER_ART ? "waiter_stand_0" : "hunter_side_1").setOrigin(0.5, 1).setScale(WAITER_SCALE).setDepth(9);
        this.helpers.push({ body, name: this.add.text(0, 0, t(`staff.name.${h.id}` as StringKey), TEXT_SMALL).setOrigin(0.5, 1).setDepth(95) });
      }
      const v = this.helpers[i];
      // the kitchen helper stands beside Bandal at the pass
      const x = h.job === "kitchen" ? LAYOUT.pass - 70 : h.x;
      const moving = h.job !== "kitchen" && h.busyMs === 0 && !!h.target;
      v.body.setX(x).setFlipX(h.facing < 0);
      if (this.textures.exists(`staff_${h.id}_walk_0`)) {
        v.body.setTexture(`staff_${h.id}_${h.busyMs > 0 ? "work" : `walk_${moving ? Math.floor(time / 125) % 4 : 1}`}`);
        v.name.setPosition(x, v.body.y - v.body.displayHeight - 2);
        return;
      }
      if (moving && !v.body.anims.isPlaying) v.body.play(WAITER_ART ? "waiter_walk" : "hunter_walk_side");
      if (!moving && v.body.anims.isPlaying) v.body.stop().setTexture(WAITER_ART ? "waiter_stand_0" : "hunter_side_1");
      v.name.setPosition(x, v.body.y - v.body.displayHeight - 2);
    });
    // the waiter
    this.waiter.x = s.x;
    this.waiter.setFlipX(s.facing < 0);
    const carrying = s.tray.length > 0;
    this.setPose(s.pouring ? "pour" : s.busyMs > 0 ? this.busyPose : time < this.poseUntil ? "serve" : moveX !== 0 ? (carrying ? "carry" : "walk") : "stand");
    // what the waiter carries, held up above the head
    const item = s.tray[0];
    const key = item ? (item.kind === "dish" ? `dish_${item.dish}` : drinkIcon[item.drink]) : null;
    if (!key) {
      this.carried?.destroy();
      this.carried = null;
    } else {
      if (!this.carried || this.carried.texture.key !== key) {
        this.carried?.destroy();
        this.carried = this.add.image(0, 0, key).setDepth(90).setScale(key.startsWith("dish_") ? DISH_SCALE : S);
      }
      this.carried.setPosition(s.x, 246);
    }
    // Bandal: grilling while an order is on, a breath now and then otherwise
    if (time > this.bandalBusyUntil) {
      const cooking = s.kitchen[0]?.started;
      this.bandal.setTexture(cooking ? (Math.floor(time / 300) % 2 ? "bandal_grill" : "bandal_turn") : Math.floor(time / 900) % 2 ? "bandal_breathe" : "bandal_idle");
    }
    // the pass
    if (this.passPlates.length !== s.pass.length || this.passPlates.some((p, i) => p.texture.key !== `dish_${s.pass[i]}`)) {
      this.passPlates.forEach((p) => p.destroy());
      this.passPlates = s.pass.map((d, i) => this.add.image(790 + i * PASS_STEP, COUNTER_TOP - 2, `dish_${d}`).setOrigin(0.5, 1).setScale(DISH_SCALE).setDepth(31));
    }
    // plaques: plates still to order
    this.data0.dishes.slice(0, PLAQUES.length).forEach((d, i) => this.plaqueCounts[i].setText(`×${s.plates[d.dish] ?? 0}`));
    // grills and stools
    s.seats.forEach((seat, i) => {
      const g = s.guests.find((x) => x.id === seat.guest);
      this.grills[i].setTexture(seat.dirty ? "prop_grill_dirty" : g && g.phase !== "walk" ? "prop_grill_lit" : "prop_grill_off");
      this.stools[i].setVisible(!g || g.phase === "walk");
    });
    // charcoal and the pour
    this.coalGauge.set(s.coal / 100);
    this.pourGauge.box.setVisible(!!s.pouring);
    this.pourMark.setVisible(!!s.pouring);
    if (s.pouring) this.pourGauge.set(s.pouring.fill);
    // guests
    for (const g of s.guests) this.drawGuest(g, time);
    // the outline glow on what the action key would use
    this.glow(this.glowTarget(this.shift.canAct() ? this.shift.target() : null));
    const prompt = promptOf(this.shift);
    this.promptText.setVisible(!!prompt);
    if (prompt) {
      const at = prompt.at;
      const x = at.kind === "seat" ? s.seats[at.seat].x : at.kind === "pass" ? LAYOUT.pass : at.kind === "coal" ? LAYOUT.coalBox : LAYOUT.drinkCart;
      this.promptText.setText(prompt.ok ? `E ${t(`prompt.${prompt.verb}` as StringKey)}` : t(`prompt.why.${prompt.why}` as StringKey)).setColor(prompt.ok ? "#fff3d8" : "#b8a690").setPosition(x, 300);
    }
    // tally and clock
    const sold = s.guests.filter((g) => g.servedMs !== null).length;
    this.tally.setText(`${t("service.tally", { served: sold, total: this.data0.customers.length, gold: this.shift.earned() })} · ${t("service.platesLeft", { n: this.shift.platesLeft() })}`);
    this.clock.setText(s.clock >= BALANCE.service.openMs ? t("service.closed") : clockText(s.clock));
  }

  // The waiter's pose: the outfit's frames, or the hunter's nearest ones while the outfit is not drawn.
  private setPose(pose: Pose) {
    if (pose === this.pose) return;
    this.pose = pose;
    const w = this.waiter;
    const loop = pose === "walk" || pose === "carry" || pose === "grind" || pose === "scrub";
    if (WAITER_ART) {
      if (loop) w.play(`waiter_${pose}`);
      else w.stop().setTexture(`waiter_${pose}_0`);
      return;
    }
    if (loop) w.play(pose === "grind" || pose === "scrub" ? "hunter_slash" : "hunter_walk_side");
    else w.stop().setTexture(pose === "serve" ? "hunter_throw_2" : pose === "pour" ? "hunter_throw_0" : "hunter_side_1");
  }

  private drawGuest(g: Guest, time: number) {
    let v = this.views.get(g.id);
    if (g.phase === "gone") {
      if (v) {
        v.sprite.destroy();
        v.bubble.destroy();
        this.views.delete(g.id);
      }
      return;
    }
    const who = YOKAI[g.kind];
    if (!v) {
      const sprite = this.add.image(g.x, WALK_FLOOR, `yk_${who}_walk_0`).setOrigin(0.5, 1).setScale(S).setDepth(45);
      const back = kitSlice(this, 0, 0, "bubble_plain", BUBBLE.w, BUBBLE.h, 3, 3, 3, 3);
      // full height, squashed from the bottom up as patience runs (scaleY), so it never spills out
      const fill = this.add.rectangle(0, BUBBLE.h / 2 - 4, BUBBLE.w - 8, BUBBLE.h - 8, 0xd83a2a, 0.45).setOrigin(0.5, 1).setScale(1, 0);
      const icon = this.add.image(0, -2, `dish_${g.dish}`).setScale(DISH_SCALE);
      const bubble = this.add.container(g.x, BUBBLE_Y, [back, fill, icon]).setDepth(80).setVisible(false);
      v = { sprite, bubble, icon, fill };
      this.views.set(g.id, v);
    }
    const step = Math.floor(time / 220) % 2;
    const sp = v.sprite;
    sp.x = g.x;
    switch (g.phase) {
      case "queue":
      case "walk":
        sp.setTexture(`yk_${who}_walk_${g.phase === "walk" ? step : 0}`).setFlipX(false).setY(WALK_FLOOR).setDepth(46);
        break;
      case "seated":
        sp.setTexture(`yk_${who}_sit`).setFlipX(false).setY(SEAT_FLOOR).setDepth(45);
        break;
      case "eating":
        sp.setTexture(`yk_${who}_${Math.floor(time / 300) % 2 ? "eat" : "sit"}`).setY(SEAT_FLOOR);
        break;
      case "thirsty":
        sp.setTexture(`yk_${who}_happy`).setY(SEAT_FLOOR);
        break;
      case "leaving":
        sp.setTexture(g.angry ? `yk_${who}_angry` : `yk_${who}_walk_${step}`).setFlipX(!g.angry).setY(WALK_FLOOR).setDepth(46);
        break;
    }
    // the bubble: a dirty grill to scrub before ordering, the dish (patience rising red from the bottom),
    // the tea asked for with it, the cider or sikhye after the meal
    const seat = g.seat !== null ? this.shift.s.seats[g.seat] : null;
    const dirty = g.phase === "seated" && !g.ordered && !!seat?.dirty;
    const wantsDish = g.phase === "seated" && g.ordered && g.servedMs === null;
    const wantsTea = g.drink === "tea" && !g.pour && g.ordered && (g.phase === "seated" || g.phase === "eating");
    const wantsAfter = g.phase === "thirsty" && (g.drink === "cider" || g.drink === "sikhye");
    const show = dirty || wantsDish || wantsTea || wantsAfter;
    v.bubble.setVisible(show).setPosition(g.x, BUBBLE_Y);
    if (!show) return;
    const key = dirty ? "prop_plate_dirty" : wantsDish ? `dish_${g.dish}` : wantsTea ? drinkIcon.tea : drinkIcon[g.drink as "cider" | "sikhye"];
    if (v.icon.texture.key !== key) v.icon.setTexture(key).setScale(key.startsWith("dish_") ? DISH_SCALE : 1);
    const used = wantsDish || dirty ? g.waitedMs / g.patienceMs : 0;
    v.fill.setScale(1, Math.min(1, used));
    v.bubble.setAngle(used > 0.75 || dirty ? Math.sin(time / 60) * 6 : 0);
  }

  private glowTarget(target: Target | null): Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | null {
    if (!target) return null;
    const s = this.shift.s;
    switch (target.kind) {
      case "pass":
        return this.passPlates[0] ?? null;
      case "drinks":
        return this.cart;
      case "coal":
        return this.coalBox;
      case "seat": {
        const seat = s.seats[target.seat];
        if (seat.dirty) return this.grills[target.seat];
        return (seat.guest && this.views.get(seat.guest)?.sprite) || null;
      }
    }
  }

  private glow(o: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | null) {
    if (o === this.glowing) return;
    this.glowing?.preFX?.clear();
    this.glowing = o;
    o?.preFX?.addGlow(0xffe08a, 2, 0, false, 0.1, 8);
  }

  private pop(x: number, y: number, text: string, color: string) {
    const s = this.add.text(x, y, text, { ...TEXT, color }).setOrigin(0.5).setDepth(1000);
    this.tweens.add({ targets: s, y: y - 18, alpha: 0, delay: 700, duration: 800, onComplete: () => s.destroy() });
  }
}
