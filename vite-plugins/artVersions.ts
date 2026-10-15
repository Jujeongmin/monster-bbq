import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

const ID = "virtual:art-versions";
const RESOLVED = `\0${ID}`;

// Every file under `dir` with its modification time, keyed by its path relative to `dir` with `/`.
export function scanVersions(dir: string): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[relative(dir, full).split(sep).join("/")] = Math.round(statSync(full).mtimeMs);
    }
  };
  try {
    walk(dir);
  } catch {
    // No art folder: nothing to version.
  }
  return out;
}

// The Verse8 editor's container caches static files for hours, so a picture changed in art/ would
// keep showing its old self (the gray-box prototype too). In the dev server, `virtual:art-versions`
// maps each art file to its modification time and src/game/sprites.ts puts that on the URL, so
// every edit gets a fresh URL; an art change also reloads the page. Builds hash file names instead
// and get an empty map.
export function artVersions(artDir = "art"): Plugin {
  let dir = "";
  let serve = false;
  return {
    name: "art-versions",
    configResolved(config) {
      dir = resolve(config.root, artDir);
      serve = config.command === "serve";
    },
    resolveId(id) {
      return id === ID ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      return `export default ${JSON.stringify(serve ? scanVersions(dir) : {})};`;
    },
    configureServer(server) {
      server.watcher.add(dir);
      const changed = (file: string) => {
        if (!resolve(file).startsWith(dir)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("change", changed);
      server.watcher.on("add", changed);
    },
  };
}
