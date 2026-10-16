import * as THREE from "three";
import { DISHES } from "../../../shared/content/dishes";
import { artUrl, hasArt } from "../art";
import { LAYOUT } from "../service/shift";
import { CAMERA, COUNTER, cameraX, FLOOR_Y, HUNTER_FEET, PASS, toWorldX, Z } from "./layout";
import { YOKAI, type Glow, type Pose, type ShopLook } from "./look";
import type { Anchors } from "./ShopHud";
import { Board, loadTextures } from "./sprites";

// The night shop as a 3D room (shop 3D design 4-5): Bancho Sushi's counter seen from the front, our pixel
// art on boxes and upright boards, drawn at 960x540 through an orthographic camera so one art pixel is
// always two screen pixels. It only draws: the night's rules are Shift, what to show is lookAt.

const W = 960;
const H = 540;
const BANDAL_SINK = 4; // Bandal's picture stops at the waist: that much of it stays behind the pass
const YK_POSES = ["walk_0", "walk_1", "sit", "eat", "happy", "angry"];
const BANDAL = ["idle", "breathe", "grill", "turn", "serve", "smile"];
// the six menu plaques on the back wall picture: centre columns and the icon's row (counted from its top)
const PLAQUES = [186, 212.5, 237, 263, 289, 315.5];
const PLAQUE_ROW = 66;
const WALL_H = 201;
const GUEST_HEAD = 50; // a bubble sits on top of a guest this high
const PROPS = ["stool", "plate_dirty", "drink_cart", "coal_box", "cup_tea", "cup_cider", "bowl_sikhye"];

function textureUrls(): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const n of ["backwall", "countertop", "counterfront", "floor"]) urls[`room_${n}`] = artUrl(`test/shop3d/${n}.png`);
  for (const p of PROPS) urls[`prop_${p}`] = artUrl(`test/shop/${p}.png`);
  for (const d of Object.keys(DISHES)) urls[`dish_${d}`] = artUrl(hasArt(`test/shop/dishes/${d}.png`) ? `test/shop/dishes/${d}.png` : `test/dishes/${d}.png`);
  for (const y of YOKAI) for (const p of YK_POSES) urls[`yk_${y}_${p}`] = artUrl(`test/yokai/counter/${y}_${p}.png`);
  for (const b of BANDAL) urls[`bandal_${b}`] = artUrl(`test/bandal/${b}.png`);
  for (const row of ["side", "slash", "throw"]) for (let i = 0; i < 4; i++) urls[`hunter_${row}_${i}`] = artUrl(`test/hunter/${row}_${i}.png`);
  return urls;
}

// the grandchild's frame for a pose (the hunt's frames stand in until the shop outfit is drawn)
function waiterTex(pose: Pose, time: number): string {
  const step = Math.floor(time / 125) % 4;
  switch (pose) {
    case "walk":
    case "carry":
      return `hunter_side_${step}`;
    case "serve":
      return "hunter_throw_2";
    case "pour":
      return "hunter_throw_0";
    case "grind":
    case "scrub":
      return `hunter_slash_${step}`;
    default:
      return "hunter_side_1";
  }
}

export class ShopView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-W / 4, W / 4, H / 4, -H / 4, 1, 4000);
  private tex: Record<string, THREE.Texture> = {};
  private camX = 0;
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
  private shadows: THREE.Mesh[] = [];
  private shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
  private glowing: Board | null = null;
  private waiterShadow!: THREE.Mesh;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly seatsX: number[],
    // by day (the shop between hunts): daylight through the shop, the lanterns and the fire low
    private readonly day = false,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x1a0f0a);
  }

  async load(): Promise<void> {
    this.tex = await loadTextures(textureUrls());
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
    wall.rotation.set(-p, 0, 0);
    wall.position.set(0, FLOOR_Y + 100.5 * Math.cos(p), Z.backWall - 100.5 * Math.sin(p));
    scene.add(wall);
    // the floor: plain planks, so lying down does not break them up
    const floorTex = tex.room_floor;
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(1.4, 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(520, 400), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, FLOOR_Y, 90);
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
    this.waiter = this.board("hunter_side_1", HUNTER_FEET);
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

  // Screen position (in the 960x540 picture) of a world point, for the HUD.
  private projectWorld(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: Math.round(((v.x + 1) / 2) * W), y: Math.round(((1 - v.y) / 2) * H) };
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
    return { guests, plaques, coal: this.project(LAYOUT.coalBox, FLOOR_Y + 30, Z.station), cart: this.project(LAYOUT.drinkCart, FLOOR_Y + 44, Z.station) };
  }

  render(look: ShopLook, dt: number) {
    this.time += dt * 1000;
    const t = this.time;
    // the grandchild
    const wx = toWorldX(look.waiter.x);
    this.waiter.setTexture(waiterTex(look.waiter.pose, t)).setFlip(look.waiter.flip).place(wx, FLOOR_Y, Z.waiter);
    this.waiterShadow.position.set(wx, FLOOR_Y + 0.2, Z.waiter);
    this.carried.setVisible(!!look.waiter.carried);
    if (look.waiter.carried) this.carried.setTexture(look.waiter.carried).place(wx, FLOOR_Y + 64, Z.waiter + 1);
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
    // the camera follows the grandchild a little
    this.camX = cameraX(this.camX, wx, dt);
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
