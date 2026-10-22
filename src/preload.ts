// Everything the game shows or plays, fetched behind the loading screen (Loading.tsx) so nothing waits on
// the network mid-game (mobile pass, user 2026-10-22): pictures are decoded and kept, so Phaser, the 3D shop
// and every <img> take them from memory; sounds and music land in the HTTP cache.

// Runs load(url) over every url, `at` at a time, telling onProgress after each one. A failed or slow load
// counts as done: one missing file must never hold the game.
export async function runAll(urls: string[], load: (url: string) => Promise<unknown>, onProgress: (done: number, total: number) => void, at: number): Promise<void> {
  let done = 0;
  let next = 0;
  if (urls.length === 0) return onProgress(0, 0);
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      await load(url).catch(() => {});
      onProgress(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(at, urls.length) }, worker));
}

// The pictures a stylesheet's text points at (the UI kit's frames and buttons), absolute against the sheet.
export function cssUrls(text: string, base: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    if (m[1].startsWith("data:")) continue;
    out.push(new URL(m[1], base).href);
  }
  return out;
}

// every url() in the page's stylesheets now
export function pageCssUrls(): string[] {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const text = Array.from(sheet.cssRules, (r) => r.cssText).join("\n");
      out.push(...cssUrls(text, sheet.href ?? location.href));
    } catch {
      // a sheet from another origin cannot be read; it is not ours
    }
  }
  return out;
}

const TIMEOUT_MS = 20000;
const inTime = <T,>(p: Promise<T>): Promise<T> => Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error("timeout")), TIMEOUT_MS))]);

// decoded pictures stay referenced for the whole session, so the browser keeps them ready
const kept: HTMLImageElement[] = [];
export function loadImage(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  return inTime(img.decode()).then(() => void kept.push(img));
}

export function loadFile(url: string): Promise<void> {
  return inTime(fetch(url).then((r) => r.arrayBuffer())).then(() => {});
}
