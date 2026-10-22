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
  // the bowl of rice (HOUSE_DISH, 2026-10-22) until its picture is approved and copied in
  "test/dishes/rice.png": "test/dishes/shiitake_grill.png",
  "test/shop/dishes/rice.png": "test/shop/dishes/shiitake_grill.png",
  // the Dave-style UI's pictures (design 2026-10-16-dave-ui, section 8): near icons (the bag: the starter
  // pack's bojagi bundle, not the pork belly it first borrowed: user, 2026-10-16) until the drawn
  // ones are approved and copied in
  "test/ui/hud/time_morning.png": "test/ui/icon_day.png",
  "test/ui/hud/time_noon.png": "test/ui/icon_day.png",
  "test/ui/hud/time_afternoon.png": "test/ui/icon_day.png",
  "test/ui/hud/time_evening.png": "test/ui/icon_day.png",
  "test/ui/hud/time_night.png": "test/ui/icon_day.png",
  "test/ui/hud/bag.png": "test/shop/products/starter_pack.png",
  "test/ui/hud/app_bag.png": "test/shop/products/starter_pack.png",
  "test/ui/hud/app_upgrade.png": "test/ui/upg_melee.png",
  "test/ui/hud/app_awaken.png": "test/ui/icon_golden_charcoal.png",
  "test/ui/hud/app_cookbook.png": "test/ui/icon_notebook.png",
  "test/ui/hud/app_menu.png": "test/ui/icon_pot.png",
  "test/ui/hud/app_shop.png": "test/ui/vip_badge.png",
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

// Every picture's URL (the loading screen fetches them all up front).
export const allArtUrls = (): string[] => Object.keys(URLS).map((k) => artUrl(k.slice("../../art/".length)));
