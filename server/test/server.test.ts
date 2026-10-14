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
});
