/**
 * A localStorage that never throws.
 *
 * The Verse8 editor frames the game from another site, so in the preview we are a third-party
 * context and the browser may refuse storage outright. @agent8/gameserver reads and writes
 * localStorage while its module is being evaluated, unguarded, so a refusal takes the whole import
 * chain down and the game never mounts. When the real store is unusable it is swapped for an
 * in-memory one for the session. Imported first in main.tsx, ahead of anything that touches storage.
 * (From grove hunters, where this was found: docs/VERSE8-EDITOR.md.)
 */

export function storageWorks(get: () => Storage): boolean {
  try {
    const store = get();
    const probe = "__mb_probe__";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, String(value));
    },
  };
}

if (typeof window !== "undefined" && !storageWorks(() => window.localStorage)) {
  try {
    Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });
    console.warn("[monster-bbq] localStorage is blocked here; using an in-memory store for this session.");
  } catch {
    // The property is locked; our own callers still guard their storage use.
  }
}
