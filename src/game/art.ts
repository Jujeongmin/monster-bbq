import artVersions from "virtual:art-versions";

// Every picture the game loads, by URL (hashed in builds, versioned by file time in the dev server;
// see vite-plugins/artVersions.ts).
const URLS = import.meta.glob(["../../art/**/*.png"], { eager: true, query: "?url", import: "default" }) as Record<
  string,
  string
>;

// Pictures not drawn yet stand in with a near one until theirs comes in (plan 08d: the Charge King's
// rib and his signature dish).
const STAND_IN: Record<string, string> = {
  "test/items/icon_king_rib.png": "test/items/icon_boar_rib.png",
  "test/dishes/king_galbi.png": "test/dishes/rib_stew.png",
  "test/shop/dishes/king_galbi.png": "test/shop/dishes/rib_stew.png",
};
const own = (path: string): boolean => `../../art/${path}` in URLS;
const resolve = (path: string): string => (own(path) || !STAND_IN[path] ? path : STAND_IN[path]);

// URL of art/<path>, e.g. artUrl("test/boar/idle.png").
export function artUrl(wanted: string): string {
  const path = resolve(wanted);
  const src = URLS[`../../art/${path}`];
  if (!src) throw new Error(`missing art: ${path}`);
  const v = artVersions[path];
  return v ? `${src}${src.includes("?") ? "&" : "?"}v=${v}` : src;
}

// Whether art/<path> is in the game yet (new art goes in only once approved), or stands in for now.
export const hasArt = (path: string): boolean => own(resolve(path));
