// Game server rules end to end through the Agent8 test harness (npm run test:server).
describe("Server", () => {
  test("starts a fresh save", async (server) => {
    const s = await server.load();
    expect(s.day).toBe(1);
  });

  test("opens a hunt with its own seed", async (server) => {
    const s = await server.act({ type: "startHunt", zone: "forest", side: "sling" });
    expect(s.hunt.zone).toBe("forest");
    expect(typeof s.hunt.seed).toBe("number");
  });

  test("settles an empty hunt", async (server) => {
    const started = await server.act({ type: "startHunt", zone: "forest", side: "sling" });
    const s = await server.act({ type: "finishHunt", huntId: started.hunt.id, events: [], exit: "1-e0", ko: false });
    expect(s.hunt).toBe(null);
  });

  test("refuses a forged hunt", async (server) => {
    let refused = false;
    try {
      await server.act({ type: "startHunt", zone: "forest", side: "sling" });
      await server.act({ type: "finishHunt", huntId: "forged", events: [{ take: "1-s0", how: "down" }], exit: "1-e0", ko: false });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });

  test("goes out twice a day: morning, lunch, afternoon", async (server) => {
    server.connect({ account: "two-hunts" });
    const m = await server.act({ type: "startHunt", zone: "forest", side: "sling" });
    const lunch = await server.act({ type: "finishHunt", huntId: m.hunt.id, events: [], exit: "1-e0", ko: false });
    expect(lunch.stage).toBe("lunch");
    const a = await server.act({ type: "startHunt", zone: "forest", side: "sling" });
    expect(a.hunt.period).toBe("afternoon");
  });

  test("takes sleeping monsters only with the sleep dart gun taken out", async (server) => {
    server.connect({ account: "no-darts" });
    const h = await server.act({ type: "startHunt", zone: "forest", side: "sling" });
    let refused = false;
    try {
      await server.act({ type: "finishHunt", huntId: h.hunt.id, events: [{ take: "1-s0", how: "sleep" }], exit: "1-e0", ko: false });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });

  test("keeps each account's save apart", async (server) => {
    server.connect({ account: "user-a" });
    await server.act({ type: "startHunt", zone: "forest", side: "sling" });
    server.connect({ account: "user-b" });
    const s = await server.load();
    expect(s.hunt).toBe(null);
  });

  test("refuses research of a dish whose ingredients were never brought home", async (server) => {
    server.connect({ account: "kitchen-a" });
    let refused = false;
    try {
      await server.act({ type: "research", dish: "grilled_belly" });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });

  test("refuses to open the shop with a dish not researched", async (server) => {
    server.connect({ account: "kitchen-b" });
    let refused = false;
    try {
      await server.act({ type: "openShop", menu: [{ dish: "grilled_belly", sets: 1 }] });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });

  test("refuses a service report with no service going on", async (server) => {
    server.connect({ account: "svc-b" });
    let refused = false;
    try {
      await server.act({ type: "finishService", serviceId: "forged", served: [{ customer: "c0", dish: "grilled_belly" }], left: [] });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });
});

// The VX Shop purchase webhook (06b-1): granted once per purchaseId, under the account's save lock.
describe("purchases", () => {
  test("the same purchaseId is granted once", async (server) => {
    const acct = `buyer-${Date.now()}`;
    await server.$onItemPurchased({ account: acct, purchaseId: "p-1", productId: "charcoal_1", quantity: 1 });
    await server.$onItemPurchased({ account: acct, purchaseId: "p-1", productId: "charcoal_1", quantity: 1 });
    server.connect({ account: acct });
    const s = await server.load();
    expect(s.charcoal).toBe(30);
    expect(s.vip.spent).toBe(100);
  });
  test("refuses a product it does not know", async (server) => {
    const r = await server.$onItemPurchased({ account: `buyer-x-${Date.now()}`, purchaseId: "p-2", productId: "gold_pouch", quantity: 1 });
    expect(r.success).toBe(false);
  });
});
