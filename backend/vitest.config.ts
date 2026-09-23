import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // DB-backed suites share one Postgres (and trade ids are count-derived, so
    // concurrent creates could collide) — run files serially so they can't race.
    fileParallelism: false,
  },
});
