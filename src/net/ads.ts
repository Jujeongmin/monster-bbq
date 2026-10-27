import { Verse8Ads } from "@verse8/ads";

// Verse8's rewarded ads (docs/VERSE8.md, user 2026-10-27), the one place the game reaches the ads SDK. An
// ad starts only from a press. Outside a Verse8 page (local development, a plain browser) the SDK answers
// unsupported_env: from then on this visit shows no ad buttons. ?ads=mock (development) plays a pretend
// ad that always rewards, to try the flows.

export type AdResult = { ok: true; requestId: string } | { ok: false; reason: "dismissed" | "busy" | "unsupported" | "failed" };

const mock = typeof location !== "undefined" && new URLSearchParams(location.search).get("ads") === "mock";
let unsupported = false;
let showing = false;

// whether an ad button is worth showing this visit
export const adsAvailable = (): boolean => mock || !unsupported;

export async function watchAd(placementId: string): Promise<AdResult> {
  if (showing) return { ok: false, reason: "busy" };
  showing = true;
  try {
    if (mock) {
      await new Promise((r) => setTimeout(r, 800));
      return { ok: true, requestId: `mock-${Date.now()}-${Math.floor(Math.random() * 1e6)}` };
    }
    const r = await Verse8Ads.showRewarded({ placementId });
    if (r.status === "rewarded") return { ok: true, requestId: r.requestId };
    if (r.status === "dismissed") return { ok: false, reason: "dismissed" };
    if (r.error.code === "unsupported_env") {
      unsupported = true;
      return { ok: false, reason: "unsupported" };
    }
    return { ok: false, reason: r.error.code === "busy" ? "busy" : "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  } finally {
    showing = false;
  }
}

// The server's reward for an ad watched: asked again while Verse8 has not confirmed the ad yet (pending), a
// moment apart, the last try marked so the server settles it.
export async function redeem<T>(claim: (last: boolean) => Promise<{ status: "pending" } | T>, tries = 4, gapMs = 1500): Promise<T> {
  for (let i = 0; ; i++) {
    const r = await claim(i === tries - 1);
    if (!(r && typeof r === "object" && (r as { status?: unknown }).status === "pending")) return r as T;
    if (i === tries - 1) throw new Error("ad_pending");
    await new Promise((res) => setTimeout(res, gapMs));
  }
}
