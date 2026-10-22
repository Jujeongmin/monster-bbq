// Native resolution; Phaser scales it up to fit the screen with crisp pixels. Tall enough that the hunter
// (~45 px tall) is about an eighth of the screen height, like an MMORPG camera. The width follows the
// frame's shape (frame.ts): 640 at 16:9, more of the world at the sides on a longer phone (user, 2026-10-22).
export let GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;
const MAX_WIDTH = 780;

// Set before a game starts, from the shape of the box it fills (width / height).
export function fitGameWidth(aspect: number): number {
  GAME_WIDTH = Math.min(MAX_WIDTH, Math.max(640, Math.round((GAME_HEIGHT * aspect) / 2) * 2));
  return GAME_WIDTH;
}
