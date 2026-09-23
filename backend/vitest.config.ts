import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // DB-backed suites share one Postgres, and routes/trades.test.ts wipes the
    // whole trades table in beforeEach — run files serially so they can't race.
    fileParallelism: false,
  },
});
