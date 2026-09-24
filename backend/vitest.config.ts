import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // DB-backed suites share one Postgres and assert on row counts, so run
    // files serially to keep one file's rows out of another's assertions.
    fileParallelism: false,
  },
});
