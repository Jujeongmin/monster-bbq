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
    const s = await server.act({ type: "finishHunt", huntId: started.hunt.id, events: [], ko: false });
    expect(s.hunt).toBe(null);
  });

  test("refuses a forged hunt", async (server) => {
    let refused = false;
    try {
      await server.act({ type: "startHunt", zone: "forest" });
      await server.act({ type: "finishHunt", huntId: "forged", events: [{ kill: "s0", grade: "premium" }], ko: false });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });

  test("keeps each account's save apart", async (server) => {
    server.connect({ account: "user-a" });
    await server.act({ type: "endDay" });
    server.connect({ account: "user-b" });
    const s = await server.load();
    expect(s.day).toBe(1);
  });

  test("starts with only the grill", async (server) => {
    server.connect({ account: "cook-a" });
    const s = await server.load();
    expect(s.tools).toEqual(["grill"]);
  });

  test("refuses cooking with ingredients the player does not have", async (server) => {
    server.connect({ account: "cook-b" });
    let refused = false;
    try {
      await server.act({ type: "cook", attemptId: "a1", items: ["boar_belly:premium"], method: "grill" });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });

  test("refuses a menu of dishes not found yet", async (server) => {
    server.connect({ account: "cook-c" });
    let refused = false;
    try {
      await server.act({ type: "setMenu", dishes: ["grilled_belly"] });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });

  test("refuses to open a service without a menu", async (server) => {
    server.connect({ account: "svc-a" });
    let refused = false;
    try {
      await server.act({ type: "startService" });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });

  test("refuses a service report with no service going on", async (server) => {
    server.connect({ account: "svc-b" });
    let refused = false;
    try {
      await server.act({ type: "finishService", serviceId: "forged", served: [{ customer: "c0", keys: ["boar_belly:premium"], accuracy: 1 }], left: [] });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });
});
