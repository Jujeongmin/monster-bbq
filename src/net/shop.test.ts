import { describe, expect, it } from "vitest";
import { LocalTransport } from "./transport";
import { refreshAfterPurchase } from "./shop";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("the shop service", () => {
  it("buys in local development through the same grant rules", async () => {
    const t = new LocalTransport(memory());
    const s = await t.purchase("charcoal_1");
    expect(s.charcoal).toBe(30);
    expect((await t.purchase("charcoal_1")).charcoal).toBe(60);
  });
  it("reads the save again one and four seconds after the payment window closes", async () => {
    const waits: number[] = [];
    let loads = 0;
    await refreshAfterPurchase(async () => void loads++, async (ms) => void waits.push(ms));
    expect([waits, loads]).toEqual([[1000, 3000], 2]);
  });
});
