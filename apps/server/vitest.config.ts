import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/worker/**'],
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts', 'src/http.ts', 'src/node/server.ts'],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
