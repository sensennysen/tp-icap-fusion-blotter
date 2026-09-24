# Docker Compose Test Pattern

For `docker-compose.yml`, the Dockerfiles and `.dockerignore` (see
`backend/test/composeWiring.test.ts` and `seedWiring.test.ts`). Startup ordering and
healthchecks are acceptance criteria, but CI has no Docker. So pin them with static tests, and
boot the real stack once in `/validate`.

- **Parse, don't regex.** Load the compose file with `yaml` (exact-pinned devDependency) and
  assert on the typed object: `depends_on.<svc>.condition === 'service_healthy'`, `build.context`
  / `build.dockerfile`, `healthcheck.start_period`.
- **Assert against the file's own values, not literals.** The healthcheck URL is built from the
  backend's `environment.PORT`. CORS_ORIGIN's port must equal the frontend's published port, and
  the VITE_* URLs must use the backend's published port. A port change in one place then fails
  the test instead of shipping a broken stack.
- **Quote substrings in `toContain`.** `'…/health'` also matches `'…/healthz'`. Assert
  `fetch('…/health')`, with the quotes.
- **`.dockerignore` both ways.** It must contain `**/node_modules` and `.env`, and must not contain
  anything a Dockerfile `COPY`s (`database`, `shared`, the lockfile, `tsconfig.base.json`).
- **The CMD is a static test too** (seedWiring): migrate → seed → start, joined by `&&`.
- Mutation-check: each `service_healthy` → `service_started`, health path, `r.status===200` →
  `r.ok`, drop `start_period`, change the CORS or WS port, change the pinned image tag, drop
  `**/node_modules`, add `shared` to `.dockerignore`.
- **Live check in `/validate`:** `git clone` into a scratch directory (a truly clean checkout), then
  `docker compose -p <scratch> up -d --build`. Watch `docker compose ps`: the frontend stays
  `Created` until the backend is `healthy`. Check `curl /health` gives 200, then restart and
  expect "No pending migrations" with the seed skipped. Run `down -v` on the scratch project only.
