import * as THREE from "three";
import { snap } from "./layout";

// Pictures in the 3D shop (shop 3D design 5): flat boards that face the tilted camera exactly, one texture
// pixel to one world unit (two screen pixels), never stretched; textures are sampled nearest, no mipmaps.

export async function loadTextures(urls: Record<string, string>): Promise<Record<string, THREE.Texture>> {
  const loader = new THREE.TextureLoader();
  const entries = await Promise.all(
    Object.entries(urls).map(async ([key, url]) => {
      const t = await loader.loadAsync(url);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace;
      return [key, t] as const;
    }),
  );
  return Object.fromEntries(entries);
}

// One picture standing upright. `place` puts its bottom edge (less `feet`, the empty rows under the feet in
// a padded frame) at y.
export class Board {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>;
  private key = "";
  private flip = false;
  private w = 1;
  private h = 1;

  constructor(
    private readonly tex: Record<string, THREE.Texture>,
    scene: THREE.Scene,
    key: string,
    private readonly pitch: number,
    private readonly feet = 0,
  ) {
    const mat = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.mesh.rotation.set(-pitch, 0, 0);
    scene.add(this.mesh);
    this.setTexture(key);
  }

  setTexture(key: string): this {
    if (key === this.key) return this;
    const t = this.tex[key];
    if (!t) throw new Error(`missing shop texture: ${key}`);
    this.key = key;
    this.mesh.material.map = t;
    this.mesh.material.needsUpdate = true;
    const img = t.image as { width: number; height: number };
    this.w = img.width;
    this.h = img.height;
    this.applyScale();
    return this;
  }

  setFlip(flip: boolean): this {
    if (flip !== this.flip) {
      this.flip = flip;
      this.applyScale();
    }
    return this;
  }

  // x, y in world units; the picture's centre sits half its height above its bottom, leaning with the
  // camera so the bottom edge stays where it is put
  place(x: number, y: number, z: number): this {
    const half = this.h / 2;
    const bottom = y - this.feet;
    // turned by -pitch about x, the bottom edge leans toward the camera by half·sin: the centre sits back
    this.mesh.position.set(snap(x), bottom + half * Math.cos(this.pitch), z - half * Math.sin(this.pitch));
    return this;
  }

  setVisible(on: boolean): this {
    this.mesh.visible = on;
    return this;
  }

  // the outline glow on what the action key would use: a warm lift of the whole picture
  setGlow(on: boolean): this {
    this.mesh.material.emissive.setHex(on ? 0x553311 : 0x000000);
    return this;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }

  private applyScale() {
    this.mesh.scale.set(this.flip ? -this.w : this.w, this.h, 1);
  }
}
