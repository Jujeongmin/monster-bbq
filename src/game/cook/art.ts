import Phaser from "phaser";
import { ITEMS } from "../../../shared/content/items";
import { artUrl } from "../art";

// The cooking station pictures (Codex, approved 2026-10-14, cut by hand: art-src/codex/slice_characters.py).
const TOOLS = ["grill", "tongs", "scissors", "ladle", "plate", "bowl", "pot_clear", "pot_foam", "pot_lid", "dial", "crumb", "salt_shaker", "salt_bowl", "rest_board", "salt_flakes"];

export const rawKey = (id: string) => `raw_${id}`;
export const cookedKey = (id: string) => `cooked_${id}`;

export function loadCookArt(scene: Phaser.Scene) {
  for (const t of TOOLS) scene.load.image(t, artUrl(`test/cooking/${t}.png`));
  for (const id of Object.keys(ITEMS)) {
    scene.load.image(rawKey(id), artUrl(`test/cooking/raw_${id}.png`));
    scene.load.image(cookedKey(id), artUrl(`test/cooking/cooked_${id}.png`));
  }
}

// Soft puffs and specks for smoke, steam, sizzle and splashes: effects, made once per game.
export function makeEffectTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("fx_puff")) return;
  const g = scene.add.graphics();
  for (let r = 8; r > 0; r--) g.fillStyle(0xffffff, 0.2).fillCircle(8, 8, r);
  g.generateTexture("fx_puff", 16, 16);
  g.clear().fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
  g.generateTexture("fx_dot", 2, 2);
  g.destroy();
}
