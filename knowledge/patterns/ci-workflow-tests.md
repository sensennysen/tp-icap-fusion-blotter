# CI Workflow Test Pattern

For `.github/workflows/ci.yml` (see `backend/test/ciWiring.test.ts`). GitHub Actions can't run
locally and the repo may have no remote. So pin the workflow with static tests, and replay it from
a clean clone in `/validate`.

- **Parse, don't regex.** Load `ci.yml` with `yaml` and assert on the typed object: triggers,
  `env`, `services.postgres`, and `steps[].run` / `steps[].uses`.
- **Step order by index.** Map the expected `run` commands to `findIndex`, assert none is `-1`,
  and assert the indices are ascending. This catches a dropped step and a reordered one with a
  single assertion.
- **Cross-file agreement, not literals.** The pnpm version in `pnpm/action-setup` must equal the
  root `packageManager`. `node-version` must satisfy `engines.node`. The service image must equal
  the compose `postgres` image. `DATABASE_URL`'s user, password, database and port must equal the
  service's `POSTGRES_*` env and published port.
- **Anything the Dockerfile does before building, CI must do too.** In this repo that is
  `prisma generate`, because the client output is gitignored. Assert that it comes before
  typecheck, test and build.
- Mutation-check: drop generate, move generate after typecheck, move migrate after test, drop
  `--frozen-lockfile`, change the pnpm version, change the image tag, change the DB name or host
  port in `DATABASE_URL`, drop `pull_request`, drop the healthcheck `options`, lower
  `node-version`, and set `HUSKY` to anything but `'0'`.
- **Live replay in `/validate`:** `git clone` into a scratch directory (no `node_modules`, no
  `generated/`, no `.env`) and start a throwaway `postgres:16-alpine` on a scratch port with the
  workflow's credentials. Then run the workflow's `run:` steps in order with its job `env`
  (`DATABASE_URL` pointed at the scratch port). Negative control: the same clone without the
  generate step must fail. Remove the container and the clone afterwards, and never touch the
  dev DB.
- **Prove each gate can fail.** In the clean clone, inject one regression per gate: a type error
  in a backend _test_ file (typecheck), a wrong expectation in a DB-backed suite (test), and a
  frontend type error (build). For lint, use an **error-level** rule such as an explicit `any`.
  Warning-level rules (`no-unused-vars` is `warn`) exit 0 without `--max-warnings 0`.
