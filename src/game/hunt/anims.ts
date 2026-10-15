import Phaser from "phaser";
import { BALANCE } from "../../../shared/balance";
import { artUrl } from "../art";

// Codex sprite sheets (art-src/codex), sliced to art/test/<who>/<row>_<n>.png, 4 frames per row.
const ROWS = {
  hunter: ["down", "up", "side", "slash", "throw"],
  boar: ["side", "down", "up", "windup", "charge"],
  rabbit: ["side", "down", "up", "special"],
  bee: ["side", "down", "up", "attack"],
  chicken: ["side", "down", "up", "peck"],
} as const;

export type Who = keyof typeof ROWS;

// Quarter-view sprites face down, up, or sideways (the side picture is flipped for left).
export type Look = "down" | "up" | "side";
export function lookOf(v: { x: number; y: number }): Look {
  return Math.abs(v.y) > Math.abs(v.x) ? (v.y > 0 ? "down" : "up") : "side";
}

// Walk cycles go contact, passing, contact, passing: lift the body a pixel on the passing frames so the
// step reads (the frames alone barely move).
export function stepBob(sprite: Phaser.GameObjects.Sprite): number {
  const i = sprite.anims.currentFrame?.index ?? 1;
  return i % 2 === 0 ? -1 : 0;
}

export function loadCharacterArt(scene: Phaser.Scene) {
  for (const [who, rows] of Object.entries(ROWS))
    for (const row of rows) for (let i = 0; i < 4; i++) scene.load.image(`${who}_${row}_${i}`, artUrl(`test/${who}/${row}_${i}.png`));
  scene.load.image("bee_stinger", artUrl("test/bee/stinger.png"));
}

const frames = (prefix: string, ids: number[]) => ids.map((i) => ({ key: `${prefix}_${i}` }));

// Every animation the hunt uses, created once per game.
export function createCharacterAnims(scene: Phaser.Scene) {
  const A = scene.anims;
  if (A.exists("hunter_slash")) return;
  const H = BALANCE.hunt;
  const all = [0, 1, 2, 3];
  for (const look of ["down", "up", "side"] as const) {
    A.create({ key: `hunter_walk_${look}`, frames: frames(`hunter_${look}`, all), frameRate: 8, repeat: -1 });
    A.create({ key: `boar_walk_${look}`, frames: frames(`boar_${look}`, all), frameRate: 7, repeat: -1 });
    A.create({ key: `boar_run_${look}`, frames: frames(`boar_${look}`, all), frameRate: 16, repeat: -1 });
    A.create({ key: `rabbit_walk_${look}`, frames: frames(`rabbit_${look}`, all), frameRate: 8, repeat: -1 });
    A.create({ key: `rabbit_run_${look}`, frames: frames(`rabbit_${look}`, all), frameRate: 16, repeat: -1 });
    A.create({ key: `bee_walk_${look}`, frames: frames(`bee_${look}`, all), frameRate: 14, repeat: -1 });
    A.create({ key: `chicken_walk_${look}`, frames: frames(`chicken_${look}`, all), frameRate: 8, repeat: -1 });
    A.create({ key: `chicken_run_${look}`, frames: frames(`chicken_${look}`, all), frameRate: 14, repeat: -1 });
  }
  A.create({ key: "hunter_slash", frames: frames("hunter_slash", all), frameRate: Math.round(4000 / H.weapons.melee.swingMs) });
  A.create({ key: "hunter_throw", frames: frames("hunter_throw", all), frameRate: 18 });
  A.create({ key: "boar_windup", frames: frames("boar_windup", all), frameRate: Math.round(4000 / H.boar.telegraphMs) });
  A.create({ key: "boar_charge", frames: frames("boar_charge", all), frameRate: 14, repeat: -1 });
  A.create({ key: "rabbit_sprint", frames: frames("rabbit_special", [2, 3]), frameRate: 12, repeat: -1 });
  A.create({ key: "bee_aim", frames: frames("bee_attack", [0, 1]), frameRate: 8, repeat: -1 });
  A.create({ key: "chicken_windup", frames: frames("chicken_peck", [0, 1]), frameRate: Math.round(2000 / H.chicken.windupMs), repeat: -1 });
}
