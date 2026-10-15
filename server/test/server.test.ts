// Game server rules end to end through the Agent8 test harness (npm run test:server).
describe("Server", () => {
  test("starts a fresh save", async (server) => {
    const s = await server.load();
    expect(s.day).toBe(1);
  });

  test("opens a hunt with its own seed", async (server) => {
    const s = await server.act({ type: "startHunt", zone: "forest" });
    expect(s.hunt.zone).toBe("forest");
    expect(typeof s.hunt.seed).toBe("number");
  });

  test("settles an empty hunt", async (server) => {
    const started = await server.act({ type: "startHunt", zone: "forest" });
    const s = await server.act({ type: "finishHunt", huntId: started.hunt.id, events: [], exit: "1-e0", ko: false });
    expect(s.hunt).toBe(null);
  });

  test("refuses a forged hunt", async (server) => {
    let refused = false;
    try {
      await server.act({ type: "startHunt", zone: "forest" });
      await server.act({ type: "finishHunt", huntId: "forged", events: [{ kill: "1-s0", grade: "premium" }], exit: "1-e0", ko: false });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });

  test("goes out twice a day: morning, lunch, afternoon", async (server) => {
    server.connect({ account: "two-hunts" });
    const m = await server.act({ type: "startHunt", zone: "forest" });
    const lunch = await server.act({ type: "finishHunt", huntId: m.hunt.id, events: [], exit: "1-e0", ko: false });
    expect(lunch.stage).toBe("lunch");
    const a = await server.act({ type: "startHunt", zone: "forest" });
    expect(a.hunt.period).toBe("afternoon");
  });

  test("keeps each account's save apart", async (server) => {
    server.connect({ account: "user-a" });
    await server.act({ type: "startHunt", zone: "forest" });
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
