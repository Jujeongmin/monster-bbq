// Game server rules end to end through the Agent8 test harness (npm run test:server).
describe("Server", () => {
  test("starts a fresh save", async (server) => {
    const s = await server.load();
    expect(s.day).toBe(1);
  });

  test("keeps a hunt and sells it", async (server) => {
    await server.act({ type: "huntResult", meat: { premium: 2, normal: 1 } });
    const s = await server.act({ type: "sellAll" });
    expect(s.gold).toBe(75);
  });

  test("refuses a forged hunt", async (server) => {
    let refused = false;
    try {
      await server.act({ type: "huntResult", meat: { premium: 999, normal: 0 } });
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
