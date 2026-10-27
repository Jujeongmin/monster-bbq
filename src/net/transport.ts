import { applyAction, type Action, type ActionContext } from "../../shared/actions";
import { claimAdCharcoal } from "../../shared/ads";
import { RANKING_TOP, rankEntry, type RankingView } from "../../shared/ranking";
import { readSave, type SaveData } from "../../shared/save";
import { grantPurchase } from "../../shared/shop";

// How the game reaches "the server": load the save, ask for a change.
export interface Transport {
  load(): Promise<SaveData>;
  act(action: Action): Promise<SaveData>;
  // the power ranking's top lines and the player's rank (reads only)
  ranking(): Promise<RankingView>;
  // golden charcoal for a rewarded ad (shared/ads.ts); "pending" while Verse8 has not confirmed the ad yet
  // (ask again shortly; `last` on the final try)
  adCharcoal(requestId: string, last: boolean): Promise<AdCharcoalReply>;
}
export type AdCharcoalReply = { status: "granted"; save: SaveData } | { status: "pending" };

// The server's rules run in the page against browser storage: local development and tests.
export class LocalTransport implements Transport {
  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem">,
    private readonly key = "monster-bbq:save",
    // the server's clock and dice, played by the page
    private readonly context: () => ActionContext = () => ({ now: Date.now(), random: Math.random }),
  ) {}

  async load(): Promise<SaveData> {
    const raw = this.storage.getItem(this.key);
    let parsed: unknown;
    try {
      parsed = raw ? JSON.parse(raw) : undefined;
    } catch {
      // not even JSON: readSave starts a fresh save rather than leaving the game stuck
      parsed = undefined;
    }
    return readSave(parsed);
  }

  async act(action: Action): Promise<SaveData> {
    const result = applyAction(await this.load(), action, this.context());
    if (result.error) throw new Error(result.error);
    this.storage.setItem(this.key, JSON.stringify(result.save));
    return result.save;
  }

  // ?local development: no verifier, only the day's cap
  async adCharcoal(requestId: string): Promise<AdCharcoalReply> {
    const r = claimAdCharcoal(await this.load(), requestId, this.context().now);
    if (r.error) throw new Error(r.error);
    this.storage.setItem(this.key, JSON.stringify(r.save));
    return { status: "granted", save: r.save };
  }

  // ?local development: a ranking of one, the player's own shop
  async ranking(): Promise<RankingView> {
    const entry = rankEntry(await this.load());
    return { top: [{ ...entry, me: true }], mine: { rank: 1, entry } };
  }

  // ?local development: a purchase granted at once by the server's own rules (no Verse8 shop here)
  async purchase(productId: string): Promise<SaveData> {
    const r = grantPurchase(await this.load(), { purchaseId: `local-${Date.now()}-${Math.random()}`, productId, quantity: 1 });
    if (r.error) throw new Error(r.error);
    this.storage.setItem(this.key, JSON.stringify(r.save));
    return r.save;
  }
}

// A call the server never answers gives up after this long, so the screen can offer a retry.
export const CALL_TIMEOUT_MS = 15_000;

// The part of @agent8/gameserver's server object this needs (tests stand in for it).
export interface RemoteCaller {
  remoteFunction(fn: string, args?: unknown[]): Promise<unknown>;
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

function asSave(reply: unknown): SaveData {
  const r = reply as SaveData | null;
  if (!r || typeof r !== "object" || r.version !== 9) throw new Error("bad_reply");
  return readSave(r);
}

// The real server: server/src/server.ts over Verse8's remoteFunction.
export class Verse8Transport implements Transport {
  constructor(private readonly server: RemoteCaller, private readonly timeoutMs = CALL_TIMEOUT_MS) {}

  async load(): Promise<SaveData> {
    return asSave(await withTimeout(this.server.remoteFunction("load"), this.timeoutMs));
  }

  async act(action: Action): Promise<SaveData> {
    return asSave(await withTimeout(this.server.remoteFunction("act", [action]), this.timeoutMs));
  }

  async ranking(): Promise<RankingView> {
    return asRanking(await withTimeout(this.server.remoteFunction("ranking"), this.timeoutMs));
  }

  async adCharcoal(requestId: string, last: boolean): Promise<AdCharcoalReply> {
    const r = (await withTimeout(this.server.remoteFunction("adCharcoal", [requestId, last]), this.timeoutMs)) as { status?: unknown; save?: unknown } | null;
    if (r?.status === "pending") return { status: "pending" };
    if (r?.status === "granted") return { status: "granted", save: asSave(r.save) };
    throw new Error("bad_reply");
  }
}

// The server's ranking reply, checked (a bad reply reads as an error, not a broken window).
export function asRanking(reply: unknown): RankingView {
  const r = reply as RankingView | null;
  const line = (l: unknown) => {
    const x = l as Record<string, unknown> | null;
    if (!x || typeof x !== "object" || typeof x.name !== "string" || typeof x.power !== "number" || typeof x.vip !== "number") throw new Error("bad_reply");
    return { name: x.name, power: x.power, vip: x.vip };
  };
  if (!r || typeof r !== "object" || !Array.isArray(r.top)) throw new Error("bad_reply");
  return {
    top: r.top.slice(0, RANKING_TOP).map((l) => ({ ...line(l), me: (l as { me?: unknown }).me === true })),
    mine: r.mine && typeof r.mine.rank === "number" ? { rank: r.mine.rank, entry: line(r.mine.entry) } : null,
  };
}
