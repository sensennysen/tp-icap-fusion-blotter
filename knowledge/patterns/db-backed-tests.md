# DB-Backed Test Pattern

For tests that hit the real Postgres (`backend/test/db/`, `backend/test/repositories/`):

- Give the file a unique `tradeId` prefix (e.g. `TEST-REPO-`) and delete **only** rows with that
  prefix in `beforeEach`/`afterEach` — never `deleteMany()` unfiltered, so the seeded dev DB survives.
- Seed via the Prisma client directly when you need columns the repository doesn't expose
  (`status`, `tradeTimestamp`).
- Assert on `list()` results only after narrowing to the prefix, and give fixtures distinct values on
  every sorted column so ordering is unambiguous regardless of other rows.
- Never assert absolute counts or sequence values; assert relative change (`before + 1`).
- Mutation-check: break the code under test, confirm the tests fail, revert.
- `backend/tsconfig.json` does not type-check `test/` — rely on ESLint + vitest (retro item 17).
