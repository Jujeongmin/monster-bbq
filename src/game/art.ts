import artVersions from "virtual:art-versions";

// Every picture the game loads, by URL (hashed in builds, versioned by file time in the dev server;
// see vite-plugins/artVersions.ts).
const URLS = import.meta.glob(["../../art/**/*.png"], { eager: true, query: "?url", import: "default" }) as Record<
  string,
  string
>;

// URL of art/<path>, e.g. artUrl("test/boar/idle.png").
export function artUrl(path: string): string {
  const src = URLS[`../../art/${path}`];
  if (!src) throw new Error(`missing art: ${path}`);
  const v = artVersions[path];
  return v ? `${src}${src.includes("?") ? "&" : "?"}v=${v}` : src;
}

// Whether art/<path> is in the game yet (new art goes in only once approved).
export const hasArt = (path: string): boolean => `../../art/${path}` in URLS;
