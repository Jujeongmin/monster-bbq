// The 3D shop's controls (shop 3D design 7): the same as the 2D shop's. A/D or the arrows walk, Shift runs;
// on touch a stick on the left walks and pushing it to the edge runs.

export function moveFrom(keys: { left: boolean; right: boolean; run: boolean }, stickX: number): { x: number; run: boolean } {
  const x = Math.max(-1, Math.min(1, (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + stickX));
  return { x, run: keys.run || Math.abs(stickX) > 0.9 };
}

// The 3D shop only where WebGL works (else the 2D one, not a blank screen); ?shop2d asks for the 2D one.
export function canUse3D(makeCanvas: () => { getContext(kind: string): unknown }, search: string): boolean {
  if (new URLSearchParams(search).has("shop2d")) return false;
  try {
    const c = makeCanvas();
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as { getExtension?: (n: string) => { loseContext(): void } | null } | null;
    // the test's own context is let go at once (phones allow few contexts: mobile frame drops, 2026-10-27)
    gl?.getExtension?.("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

// asked once a page: every night and every day used to ask again, each leaving a context behind
let known: boolean | null = null;
export const has3D = (): boolean => (known ??= canUse3D(() => document.createElement("canvas"), location.search));
