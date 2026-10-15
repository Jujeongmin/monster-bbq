import { defineConfig } from "vitest/config";

// server/test runs under the Agent8 harness (npm run test:server), not here.
export default defineConfig({
  test: { include: ["shared/**/*.test.ts", "src/**/*.test.ts", "vite-plugins/**/*.test.ts"] },
});
