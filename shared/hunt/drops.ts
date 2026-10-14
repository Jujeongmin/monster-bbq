import type { ItemId } from "../content/items";
import { MONSTERS, type MonsterId } from "../content/monsters";
import { seededRandom } from "./scatter";

// FNV-1a over the spawn id, mixed with the hunt seed: one stable number per (hunt, monster).
function hash(seed: number, id: string): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// The part a monster leaves, decided by the hunt seed and the spawn id so the server and the client
// agree without trusting the client (spec 7).
export function dropFor(seed: number, spawn: { id: string; monster: MonsterId }): ItemId {
  const table = MONSTERS[spawn.monster].drops;
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  let roll = seededRandom(hash(seed, spawn.id))() * total;
  for (const [item, w] of table) {
    roll -= w;
    if (roll < 0) return item;
  }
  return table[table.length - 1][0];
}
