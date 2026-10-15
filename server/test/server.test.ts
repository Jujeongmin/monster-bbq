describe('Server', () => {
  test('ping returns pong', async (server) => {
    const result = await server.ping();
    expect(result).toBe('pong');
  });
});
