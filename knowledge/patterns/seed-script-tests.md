# Seed Script Test Pattern

For startup seed scripts (`backend/src/seed.ts`, logic in `backend/src/seedTrades.ts`, tests in
`backend/test/seedTrades.test.ts` and `seedWiring.test.ts`).

- **Keep the entry point thin.** A script that calls `seed()` at import time can't be imported by a
  test. Put the logic in an exported module (`generateTrades`, `seedIfEmpty`) and leave the entry to
  wire the real client, set `process.exitCode` on failure and `$disconnect()`.
- **Inject the client.** Type `seedIfEmpty` against the slice of Prisma it uses (`SeedClient`), then
  test the empty-table branch with a stateful fake (`count` reflects what `createMany` inserted).
  "Run twice, insert once" is `seedIfEmpty(fake)` twice. Emptying the real `trades` table to test
  this would wipe the seeded dev DB (retro #12).
- **Test the skip branch for real** by passing the real client. The dev DB is non-empty, so the
  assertion is "count unchanged", which needs no cleanup.
- **Prove generated rows satisfy the DB** by inserting `generateTrades(n, { idPrefix: 'TEST-SEED-' })`
  into real Postgres. That covers the unique index, enums, CHECK constraints and `Decimal(12,4)` in
  one go. Delete only the prefix, and assert `before + n`, not absolute counts.
- **Random data: assert invariants, not values.** Rates get loose bounds (10% asserted as 7-13% over
  10,000 rows). Boundaries need `vi.spyOn(Math, 'random').mockReturnValue(0 / 0.999999)`: an off-by-one
  like `quantity` 0 is about 1 in 5,000, so sampling missed it in the first mutation pass.
- **Wiring is a static test.** Read the `Dockerfile` CMD and assert `migrate deploy`, `run seed` and
  `pnpm start` appear in that order, joined by `&&` so a failed seed stops the server starting.
- Mutation-check: guard `> 0`, inverted guard, guard falls through, cancel rate, count, quantity and
  price bounds, id numbering, CMD order and `;` for `&&`.
