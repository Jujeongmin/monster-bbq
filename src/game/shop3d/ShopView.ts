import * as THREE from "three";
import { DISHES, HOUSE_DISH } from "../../../shared/content/dishes";
import { STAFF_IDS, type StaffId } from "../../../shared/content/staff";
import { artUrl, hasArt } from "../art";
import { LAYOUT } from "../service/shift";
import { CAMERA, COUNTER, cameraX, FLOOR_Y, HUNTER_FEET, LAYER_MAX_W, PASS, toWorldX, Z } from "./layout";
import { YOKAI, type Glow, type HelperLook, type Pose, type ShopLook } from "./look";
import type { Anchors } from "./ShopHud";
import { Board, loadTextures } from "./sprites";

// The night shop as a 3D room (shop 3D design 4-5): Bancho Sushi's counter seen from the front, our pixel
// art on boxes and upright boards, drawn at 960x540 through an orthographic camera so one art pixel is
// always two screen pixels. It only draws: the night's rules are Shift, what to show is lookAt.

// the picture's height; its width follows the screen (layerFit), 960 to 1170
const H = 540;
// past the back wall's ends (480 world units) the wall runs on as its own end strips, this many art
// pixels wide, tiled and a little darker (a longer phone sees more room: user, 2026-10-22)
const WALL_STRIP = 6;
const SIDE_W = (LAYER_MAX_W / 2 - 480) / 2 + 30;
const BANDAL_SINK = 4; // Bandal's picture stops at the waist: that much of it stays behind the pass
const YK_POSES = ["walk_0", "walk_1", "sit", "eat", "happy", "angry"];
const BANDAL = ["idle", "breathe", "grill", "turn", "serve", "smile"];
// the six menu plaques on the back wall picture: the middle of each board's wood (art pixel edges, so
// a board from column 178 through 196 has its middle at 187.5), and the row (counted from its top) the
// plaque's icon and count are centred on, the boards' middle (user, 2026-10-22: they sat high and to the
// left on the boards)
const PLAQUES = [187.5, 212.5, 238, 264, 289.5, 316];
const PLAQUE_ROW = 70;
const WALL_H = 201;
const GUEST_HEAD = 50; // a bubble sits on top of a guest this high
// the grandchild in the shop, at the guests' scale, in the hunt frames' 105 px box (feet on row 98)
const HERO = ["walk_0", "walk_1", "walk_2", "walk_3", "carry_0", "carry_1", "carry_2", "carry_3", "serve", "scrub_0", "scrub_1", "pour", "stand"];
// Grandma's old friends at work: their own walk frames once approved and in (art/test/staff/<id>/), until
// then the grandchild's frames with a name tag over them (the HUD's)
const STAFF_FRAMES = ["walk_0", "walk_1", "walk_2", "walk_3", "work"];
const hasStaffArt = (id: StaffId) => hasArt(`test/staff/${id}/walk_0.png`);
const KITCHEN_X = 30; // the kitchen helper at Bandal's right, behind the pass, clear of the pass's prompt (world units from its centre)
const PROPS = ["stool", "plate_dirty", "drink_cart", "coal_box", "cup_tea", "cup_cider", "bowl_sikhye"];

function textureUrls(day: boolean): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const n of ["backwall", "countertop", "counterfront", "floor"]) urls[`room_${n}`] = artUrl(`test/shop3d/${n}.png`);
  // by day the daylight back wall once it is approved and in (the night one until then)
  if (day && hasArt("test/shop3d/backwall_day.png")) urls.room_backwall = artUrl("test/shop3d/backwall_day.png");
  // and the evening's, with the sunset through the window, once approved and in (the kitchen scene)
  if (day && hasArt("test/shop3d/backwall_evening.png")) urls.room_backwall_evening = artUrl("test/shop3d/backwall_evening.png");
  for (const p of PROPS) urls[`prop_${p}`] = artUrl(`test/shop/${p}.png`);
  // a dish set in the room (the pass, the counter): its small 20 px picture once approved and in, beside a
  // 48 px grandchild (the HUD's bubbles and plaques keep the 32 px one)
  const dishArt = (d: string) => [`test/shop3d/dishes/${d}.png`, `test/shop/dishes/${d}.png`].find(hasArt) ?? `test/dishes/${d}.png`;
  // and the bowl of rice once the dishes are gone (HOUSE_DISH)
  for (const d of [...Object.keys(DISHES), HOUSE_DISH]) urls[`dish_${d}`] = artUrl(dishArt(d));
  for (const y of YOKAI) for (const p of YK_POSES) urls[`yk_${y}_${p}`] = artUrl(`test/yokai/counter/${y}_${p}.png`);
  for (const b of BANDAL) urls[`bandal_${b}`] = artUrl(`test/bandal/${b}.png`);
  for (const h of HERO) urls[`hero_${h}`] = artUrl(`test/shop3d/hero/${h}.png`);
  for (const id of STAFF_IDS) if (hasStaffArt(id)) for (const f of STAFF_FRAMES) urls[`staff_${id}_${f}`] = artUrl(`test/staff/${id}/${f}.png`);
  return urls;
}

// the grandchild's frame for a pose. With a dish he holds the plate drawn in his carry frames (always the
// same plate: user, 2026-10-20) instead of the dish floating over him; a drink still floats.
function waiterTex(pose: Pose, time: number, dish: boolean): string {
  const step = Math.floor(time / 125) % 4;
  switch (pose) {
    case "walk":
    case "carry":
      return dish ? `hero_carry_${step}` : `hero_walk_${step}`;
    case "serve":
      return "hero_serve";
    case "pour":
      return "hero_pour";
    case "grind":
    case "scrub":
      return `hero_scrub_${Math.floor(time / 200) % 2}`;
    default:
      return dish ? "hero_carry_1" : "hero_stand";
  }
}

function helperTex(h: HelperLook, time: number): string {
  if (!hasStaffArt(h.id)) return waiterTex(h.pose, time, !!h.carried?.startsWith("dish_"));
  // scrubbing, pouring, tipping in charcoal: their one working picture
  if (h.pose === "scrub" || h.pose === "grind" || h.pose === "pour" || h.pose === "serve") return `staff_${h.id}_work`;
  const moving = h.pose === "walk" || h.pose === "carry";
  return `staff_${h.id}_walk_${moving ? Math.floor(time / 125) % 4 : 1}`;
}

// where a friend stands in the room: the kitchen helper beside Bandal, the others in the grandchild's
// lane just behind him (so he stays in front when they cross)
const helperAt = (h: HelperLook): { x: number; z: number } => (h.job === "kitchen" ? { x: PASS.x + KITCHEN_X, z: Z.bandal } : { x: toWorldX(h.x), z: Z.waiter - 2 });

export class ShopView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private w = 960;
  private readonly camera = new THREE.OrthographicCamera(-this.w / 4, this.w / 4, H / 4, -H / 4, 1, 4000);
  private tex: Record<string, THREE.Texture> = {};
  private camX = 0;
  // a closer look at one spot (an old friend arriving, postcard reveal A): world x and zoom, or none
  private focus: { x: number; zoom: number } | null = null;
  private lanterns: THREE.PointLight[] = [];
  private fire!: THREE.PointLight;
  private time = 0;
  private waiter!: Board;
  private carried!: Board;
  private bandal!: Board;
  private cart!: Board;
  private coalBox!: Board;
  private stools: Board[] = [];
  private seatPlates: Board[] = [];
  private messes: Board[] = [];
  private passPlates: Board[] = [];
  private guests = new Map<string, Board>();
  private helpers: { body: Board; carried: Board; shadow: THREE.Mesh }[] = [];
  private shadows: THREE.Mesh[] = [];
  private shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
  private glowing: Board | null = null;
  private waiterShadow!: THREE.Mesh;
  private wall!: THREE.MeshLambertMaterial;
  private wallEnds: THREE.MeshLambertMaterial[] = [];
  private evening = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly seatsX: number[],
    // by day (the shop between hunts): daylight through the shop, the lanterns and the fire low
    private readonly day = false,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.w, H, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x1a0f0a);
  }

  async load(): Promise<void> {
    this.tex = await loadTextures(textureUrls(this.day));
    this.build();
  }

  private board(key: string, feet = 0): Board {
    return new Board(this.tex, this.scene, key, CAMERA.pitch, feet);
  }

  private shadow(r: number): THREE.Mesh {
    const s = new THREE.Mesh(new THREE.CircleGeometry(r, 16), this.shadowMat);
    s.rotation.x = -Math.PI / 2;
    this.scene.add(s);
    this.shadows.push(s);
    return s;
  }

  private build() {
    const { scene, tex } = this;
    const p = CAMERA.pitch;
    // the back wall, leaning with the camera like every upright picture
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(480, 201), new THREE.MeshLambertMaterial({ map: tex.room_backwall }));
    this.wall = wall.material;
    wall.rotation.set(-p, 0, 0);
    wall.position.set(0, FLOOR_Y + 100.5 * Math.cos(p), Z.backWall - 100.5 * Math.sin(p));
    scene.add(wall);
    // the wall's ends running on past it, both sides
    for (const side of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.PlaneGeometry(SIDE_W, 201), new THREE.MeshLambertMaterial({ color: 0xc8c8c8 }));
      this.wallEnds.push(end.material);
      end.rotation.set(-p, 0, 0);
      end.position.set(side * (240 + SIDE_W / 2), FLOOR_Y + 100.5 * Math.cos(p), Z.backWall - 100.5 * Math.sin(p));
      scene.add(end);
    }
    this.paintWallEnds();
    // the floor: plain planks, so lying down does not break them up
    const floorTex = tex.room_floor;
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    // deep enough to reach the bottom of the view (it stopped short: a dark band under the room)
    floorTex.repeat.set((LAYER_MAX_W / 2 + 40) / 340, 5.25);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(LAYER_MAX_W / 2 + 40, 700), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, FLOOR_Y, 240);
    scene.add(floor);
    // the counter and the kitchen's pass: low wooden boxes
    const wood = new THREE.MeshLambertMaterial({ color: 0x4a1c08 });
    const top = new THREE.MeshLambertMaterial({ map: tex.room_countertop });
    const front = new THREE.MeshLambertMaterial({ map: tex.room_counterfront });
    const box = (w: number, h: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wood, wood, top, wood, front, wood]);
      m.position.set(x, FLOOR_Y + h / 2, z);
      scene.add(m);
    };
    box(COUNTER.x1 - COUNTER.x0, COUNTER.h, COUNTER.d, (COUNTER.x0 + COUNTER.x1) / 2, Z.counter);
    box(PASS.w, PASS.h, PASS.d, PASS.x, Z.pass);
    // Bandal behind the pass, the waist hidden by it
    this.bandal = this.board("bandal_idle").place(PASS.x, FLOOR_Y + PASS.h - BANDAL_SINK, Z.bandal);
    // the stations behind the counter, just in front of the grandchild
    this.cart = this.board("prop_drink_cart").place(toWorldX(LAYOUT.drinkCart), FLOOR_Y, Z.station);
    this.coalBox = this.board("prop_coal_box").place(toWorldX(LAYOUT.coalBox), FLOOR_Y, Z.station);
    // stools, and what lies on the counter in front of each
    for (const x of this.seatsX) {
      const wx = toWorldX(x);
      this.stools.push(this.board("prop_stool").place(wx, FLOOR_Y, Z.stool));
      this.shadow(10).position.set(wx, FLOOR_Y + 0.2, Z.stool);
      this.seatPlates.push(this.board("prop_plate_dirty").place(wx, FLOOR_Y + COUNTER.h, Z.counter).setVisible(false));
      this.messes.push(this.board("prop_plate_dirty").place(wx, FLOOR_Y + COUNTER.h, Z.counter + 1).setVisible(false));
    }
    // the grandchild and what he carries
    this.waiter = this.board("hero_stand", HUNTER_FEET);
    this.waiterShadow = this.shadow(12);
    this.carried = this.board("prop_cup_tea").setVisible(false);
    // light: a dim warm room, four lanterns, a little from the front, and Bandal's charcoal fire
    scene.add(new THREE.AmbientLight(this.day ? 0xfff4e4 : 0xffe0c0, this.day ? 1.25 : 0.85));
    this.lanterns = [-150, -40, 70, 180].map((x) => {
      const l = new THREE.PointLight(0xffa040, 2.2, 260, 1.2);
      l.position.set(x, 120, -10);
      scene.add(l);
      return l;
    });
    const fill = new THREE.DirectionalLight(0xfff0e0, 0.5);
    fill.position.set(0, 120, 200);
    scene.add(fill);
    this.fire = new THREE.PointLight(0xff6a20, 2, 120, 1.5);
    this.fire.position.set(PASS.x, FLOOR_Y + 40, Z.bandal - 10);
    scene.add(this.fire);
  }

  // By day: the evening's back wall (sunset through the window) in the kitchen scene, the day's otherwise.
  setEvening(on: boolean) {
    if (on === this.evening || !this.wall) return;
    this.evening = on;
    this.wall.map = (on && this.tex.room_backwall_evening) || this.tex.room_backwall;
    this.wall.needsUpdate = true;
    this.paintWallEnds();
  }

  // The wall's end strips, cut from the back wall shown now (no new art: its own edge columns, tiled).
  private paintWallEnds() {
    const img = this.wall.map?.image as HTMLImageElement | undefined;
    if (!img) return;
    this.wallEnds.forEach((m, i) => {
      const c = document.createElement("canvas");
      c.width = WALL_STRIP;
      c.height = img.height;
      c.getContext("2d")!.drawImage(img, i === 0 ? 0 : img.width - WALL_STRIP, 0, WALL_STRIP, img.height, 0, 0, WALL_STRIP, img.height);
      const t = new THREE.CanvasTexture(c);
      t.magFilter = t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(SIDE_W / WALL_STRIP, 1);
      // tiled outward from the wall's edge: the left strip ends flush at the wall, the right one starts there
      t.offset.set(i === 0 ? -((SIDE_W / WALL_STRIP) % 1) : 0, 0);
      m.map?.dispose();
      m.map = t;
      m.needsUpdate = true;
    });
  }

  // The picture's width now (layerFit): the camera sees that much of the room, at the same scale.
  setWidth(w: number) {
    if (w === this.w) return;
    this.w = w;
    this.renderer.setSize(w, H, false);
    this.camera.left = -w / 4;
    this.camera.right = w / 4;
    this.camera.updateProjectionMatrix();
  }

  // Look closer at a spot along the aisle (game x), or back at the whole room (null).
  setFocus(gameX: number | null, zoom = 1) {
    this.focus = gameX === null ? null : { x: toWorldX(gameX), zoom };
  }

  // Screen position (in the picture, 540 tall) of a world point, for the HUD.
  private projectWorld(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: Math.round(((v.x + 1) / 2) * this.w), y: Math.round(((1 - v.y) / 2) * H) };
  }

  // the same for a point given in the rules' 960-wide x
  project(gameX: number, y: number, z: number): { x: number; y: number } {
    return this.projectWorld(toWorldX(gameX), y, z);
  }

  // Where the HUD hangs its bubbles, plate counts and gauges this frame (after render: the camera moved).
  anchors(look: ShopLook): Anchors {
    const p = CAMERA.pitch;
    const guests: Anchors["guests"] = {};
    for (const g of look.guests) guests[g.id] = this.project(g.x, FLOOR_Y + GUEST_HEAD, g.z);
    const plaques = PLAQUES.map((px) => {
      const h = WALL_H - PLAQUE_ROW;
      return this.projectWorld(px - 240, FLOOR_Y + h * Math.cos(p), Z.backWall - h * Math.sin(p));
    });
    // where the action key's bubble goes: over the pass, and on the floor under a seat (clear of the
    // guest's own bubble over their head)
    const seats = look.seats.map((st) => this.project(st.x, FLOOR_Y, Z.stool + 6));
    // a friend's name tag, over the head
    const helpers = look.helpers.map((h) => {
      const at = helperAt(h);
      return this.projectWorld(at.x, FLOOR_Y + 50, at.z);
    });
    return { guests, helpers, plaques, coal: this.project(LAYOUT.coalBox, FLOOR_Y + 30, Z.station), cart: this.project(LAYOUT.drinkCart, FLOOR_Y + 44, Z.station), pass: this.project(LAYOUT.pass, FLOOR_Y + PASS.h + 34, Z.pass), seats };
  }

  render(look: ShopLook, dt: number) {
    this.time += dt * 1000;
    const t = this.time;
    // the grandchild
    const wx = toWorldX(look.waiter.x);
    const dish = !!look.waiter.carried?.startsWith("dish_");
    this.waiter.setTexture(waiterTex(look.waiter.pose, t, dish)).setFlip(look.waiter.flip).place(wx, FLOOR_Y, Z.waiter);
    this.waiterShadow.position.set(wx, FLOOR_Y + 0.2, Z.waiter);
    // a drink floats just over his head (he is 48 px tall in the shop)
    this.carried.setVisible(!!look.waiter.carried && !dish);
    if (look.waiter.carried && !dish) this.carried.setTexture(look.waiter.carried).place(wx, FLOOR_Y + 54, Z.waiter + 1);
    // tonight's friends
    look.helpers.forEach((h, i) => {
      if (!this.helpers[i]) this.helpers.push({ body: this.board("hero_stand", HUNTER_FEET), carried: this.board("prop_cup_tea").setVisible(false), shadow: this.shadow(12) });
      const b = this.helpers[i];
      const at = helperAt(h);
      const dish = !!h.carried?.startsWith("dish_");
      b.body.setTexture(helperTex(h, t)).setFlip(h.flip).place(at.x, FLOOR_Y, at.z);
      b.shadow.visible = h.job !== "kitchen";
      b.shadow.position.set(at.x, FLOOR_Y + 0.2, at.z);
      // a drink, or a dish when their own picture has no plate in its hands, floats over the head
      const float = !!h.carried && (!dish || hasStaffArt(h.id));
      b.carried.setVisible(float);
      if (float) b.carried.setTexture(h.carried!).place(at.x, FLOOR_Y + 54, at.z + 1);
    });
    // Bandal and the fire that follows the charcoal
    this.bandal.setTexture(look.bandal);
    this.fire.intensity = 0.3 + 2.2 * (look.coal / 100);
    this.lanterns.forEach((l, i) => (l.intensity = (this.day ? 0.5 : 2) + 0.25 * Math.sin(t / 160 + i * 1.7)));
    // seats: a stool where no one sits, the dish while its guest eats, leftovers
    look.seats.forEach((s, i) => {
      this.stools[i].setVisible(s.stool);
      this.seatPlates[i].setVisible(!!s.plate);
      if (s.plate) this.seatPlates[i].setTexture(s.plate);
      this.messes[i].setVisible(s.mess);
    });
    // plates on the pass
    while (this.passPlates.length < look.pass.length) this.passPlates.push(this.board("prop_plate_dirty"));
    this.passPlates.forEach((b, i) => {
      const key = look.pass[i];
      b.setVisible(!!key);
      if (key) b.setTexture(key).place(PASS.x - 28 + i * 14, FLOOR_Y + PASS.h, Z.pass + PASS.d / 2);
    });
    // guests
    const seen = new Set<string>();
    for (const g of look.guests) {
      seen.add(g.id);
      let b = this.guests.get(g.id);
      if (!b) {
        b = this.board(g.tex);
        this.guests.set(g.id, b);
      }
      b.setTexture(g.tex).setFlip(g.flip).place(toWorldX(g.x), FLOOR_Y, g.z);
    }
    for (const [id, b] of this.guests)
      if (!seen.has(id)) {
        b.dispose();
        this.guests.delete(id);
      }
    this.setGlow(look.glow);
    // the camera follows the grandchild a little, or eases in on the focus, never past the room's walls
    const zoom = this.focus?.zoom ?? 1;
    const ease = Math.min(1, dt * CAMERA.rate);
    if (Math.abs(this.camera.zoom - zoom) > 0.001) {
      this.camera.zoom += (zoom - this.camera.zoom) * ease;
      this.camera.updateProjectionMatrix();
    }
    const edge = this.w / 4 - this.w / 4 / this.camera.zoom;
    this.camX = this.focus ? Math.max(-edge, Math.min(edge, this.camX + (this.focus.x - this.camX) * ease)) : cameraX(this.camX, wx, dt);
    const target = new THREE.Vector3(this.camX, 45, 0);
    this.camera.position.set(target.x, target.y + Math.sin(CAMERA.pitch) * 1000, target.z + Math.cos(CAMERA.pitch) * 1000);
    this.camera.lookAt(target);
    this.renderer.render(this.scene, this.camera);
  }

  private setGlow(glow: Glow | null) {
    const b = !glow
      ? null
      : glow.kind === "drinks"
        ? this.cart
        : glow.kind === "coal"
          ? this.coalBox
          : glow.kind === "pass"
            ? (this.passPlates[0] ?? null)
            : glow.kind === "seat"
              ? this.messes[glow.seat]
              : (this.guests.get(glow.id) ?? null);
    if (b === this.glowing) return;
    this.glowing?.setGlow(false);
    this.glowing = b;
    b?.setGlow(true);
  }

  dispose() {
    this.renderer.dispose();
    for (const t of Object.values(this.tex)) t.dispose();
  }
}
