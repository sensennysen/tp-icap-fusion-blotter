# Prompt Log

This is a representative sample of the prompts that shaped the project, not every message. The
prompts are verbatim from the Claude Code session transcripts. Responses are summarised.

Most day-to-day prompts were one-line slash commands (`/evaluate`, `/plan`, `/apply`, `/validate`,
`/commit`). Their detailed instructions live in `.claude/commands/`, and the project rules live in
`AGENTS.md`. The interesting input was usually my answer at a decision point, so decision-point
exchanges are included too. See [`AI_USAGE_REPORT.md`](AI_USAGE_REPORT.md) for context.

---

## 1. Scaffolding the project (22 Sep)

**Prompt:** `/scaffold`

**Response (summarised):** It read `ARCH.md` and the four ADRs, and generated
`knowledge/rules/arch-summary.md` with the `nexus` MCP tool. It then stopped at two decision
points (below). After that it produced a roughly 55-file plan: monorepo, `shared/`, Express
layers, Prisma schema, `ws` broadcaster, Vite/React shell, Dockerfiles, CI, Husky/commitlint and
`knowledge/`.

---

**Decision point, asked by the AI:** "How do you want to proceed without a Figma export?"

**My answer:** _Skip Figma, derive UI from ARCH doc only._

**Outcome:** The UI was built from `ARCH.md` §11's layout notes and a small Tailwind token set
(`knowledge/rules/design-system.md`). It was flagged as inferred, not taken from a design handoff.

---

**Decision point, asked by the AI:** "`/scaffold`'s mock-only Day-0 restriction doesn't fit a
single-sitting take-home. How should APPLY handle real wiring?" A second question asked whether to
scaffold mock auth.

**My answers:** _Combined pass_ (real Prisma CRUD and real WebSocket broadcasting from the start)
and _Skip mock auth_ (auth stays a bonus).

**Outcome:** The first working version already persisted to Postgres and pushed live events. No
mock→real swap step was needed later. Auth arrived later as bonus TASK-002.

---

**Prompt (mid-`/apply`):** `sorry, but let's change npm to pnpm for faster and smaller profile`

**Outcome:** It switched to pnpm workspaces, `packageManager: pnpm@12.5.1` and `pnpm/action-setup`
in CI. The AI found that the `resolve_package_versions` MCP tool silently returned `{}` for pnpm,
so it resolved exact versions with `pnpm add --save-exact` in a scratch folder instead.

**Miss:** ADR-001 still said "npm workspaces". `/dev-tasks-planner` caught this the next day, and
it was fixed with a dated amendment.

---

## 2. Breaking the work into tasks

**Prompt:** `/dev-tasks-planner trade-blotter based on docs/arch-docs/trade-blotter/`

**Response (summarised):** It produced `core-tasks.csv` (an epic plus 20 tasks, from shared types
through to CI) and `bonus-tasks.csv` (audit trail, mock auth, grid virtualisation). Each task has a
user story, acceptance criteria and dependencies. It also logged that ADR-001 was stale (the
npm/pnpm mismatch above).

**Outcome:** The CSVs became the backlog every later session worked from.

---

## 3. The per-task cycle (repeated for all 23 tasks)

**Prompts:**

```
/evaluate EPIC-CORE-BLOTTER TASK-012
/plan
/apply
/validate
/commit
```

**Response (summarised, for TASK-012 `useRealtimeTrades`):**

- `/evaluate` found that the 4 existing tests covered only cache reconciliation. Backoff, toasts,
  malformed frames and unmount cleanup were untested.
- `/plan` listed the hook changes and about 30 new tests, and waited for approval.
- `/apply` fixed four real bugs:
  - "Connection lost" toasted on _every_ failed retry instead of once per outage.
  - One malformed frame threw inside the message listener.
  - Only the _active_ filter's cache entry was reconciled, so other cached filter views went
    stale.
  - An event could create a one-row list for a query that hadn't loaded yet.
- Tests went from 4 to 37, and 35 planted bugs were all caught.
- `/validate` captured real frames from the running backend (against a scratch database, since
  dropped) and replayed them through the hook.

**Outcome:** Accepted. The same loop, run 23 times, produced most of the 535 tests and 17 `fix:` commits, many of which
bundle several bug fixes.

---

**Prompt:** `/evaluate TASK-001`

**Decision point, asked by the AI:** "There are two TASK-001s. Which one?" It recommended the bonus
Audit Trail task, since the core one was already marked Done.

**My answer:** _Core TASK-001: Shared Trade domain type._

**Outcome:** I rejected the recommendation, to harden the existing core before adding bonus
features. Every core task was re-evaluated in order, and most "Done" tasks turned out to have
untested acceptance criteria or real bugs.

---

## 4. Approving a fix outside the plan

**Context:** During `/validate` on TASK-005 (WebSocket broadcaster), the AI reported: "[FIX NOW]
Any client can crash the backend. `WebSocketBroadcaster` has no `'error'` listener on client
sockets, so one malformed frame becomes an uncaught exception and the process exits." The fix
touched `src/`, which was outside the test-only plan, so it asked first.

**Prompt:** `fix please`

**Outcome:** It added a `socket.on('error', …)` listener that logs a warning, plus a real test: a
malformed frame is sent, that client is pruned, the others still get broadcasts, and the server
stays up. A planted bug (the listener removed) fails the test.

---

## 5. Debugging a local problem

**Prompt:**

```
can you check as to why I am getting this error when running pnp dev on the project?
Error: listen EADDRINUSE: address already in use :::4000 …
```

**Outcome:** The AI found that an orphaned `tsx src/server.ts` from the previous day was still
holding port 4000. The root `dev` script backgrounds both servers with `&`, so closing the terminal
can leave the backend running. It gave me the `kill` command but deliberately didn't kill a process
it hadn't started. It also offered to make the `dev` script clean up its child processes.

---

## 6. Git workflow correction

**Prompt:** `/commit`, after TASK-010

**Response:** It committed TASK-008, 009 and 010 onto a branch named
`chore/task-007-errorhandler-tests`, "keeping the same convention".

**Prompt:** `no, create branch for each task, then commit`, followed by
`do this also for task-008 and task-009 please`

**Outcome:** Each task was redone on its own branch and merged into `main`. From then on, the
workflow was one branch per task.

---

## 7. Whole-project code review

**Prompt:** `/code-review for the whole project please`

**Response (summarised):** A separate `code-reviewer` agent reported three linked findings:

1. Two concurrent creates could get the same `TRD-` id, because it was `count() + 1`. The loser
   got a 500.
2. A concurrent amend and cancel could amend a trade that was already cancelled
   (check-then-act).
3. No test created trades concurrently against real Postgres.

It suggested three options: a DB sequence, retrying on conflict, or mapping `P2002` to 409.

**Prompt:** `fix all three please`

**Outcome:** Accepted, commit `2d00214`:

- a Postgres sequence for `tradeId` (new migration), with any leftover `P2002` mapped to 409
- amend and cancel that write only `WHERE status = 'ACTIVE'`, in a single statement
- real-Postgres tests for concurrent creates, cancels, and amend vs cancel

The later audit-trail task wrapped these writes in a transaction with `SELECT … FOR UPDATE`, so
the audit row's `from` values are exact.

---

## 8. Bonus features

**Prompts:**

```
/evaluate EPIC-BONUS-FEATURES TASK-001   (audit trail)
/evaluate EPIC-BONUS-FEATURES TASK-002   (mock auth)
/evaluate EPIC-BONUS-FEATURES TASK-003   (grid virtualisation)
```

Each was followed by `/plan`, `/apply`, `/validate`, `/commit` and `/create-pr` (`push and open pr
please`).

**Notable responses (summarised):**

- **Audit trail.** `/validate` found that nothing proved the row lock worked: deleting
  `SELECT … FOR UPDATE` still passed all 64 tests. The AI added an 8-way concurrent-amend test
  whose audit rows must form one unbroken `from → to` chain. The test now fails without the lock.
- **Mock auth.** The plan tied the cookie's `Secure` flag to `NODE_ENV`. During `/apply` the AI
  saw that Docker Compose runs `NODE_ENV=production` over plain http, so it deviated and added an
  `AUTH_COOKIE_SECURE` variable. It also found `pino-http` logging raw session cookies and added
  redaction.
- **Virtualisation.** The plan's fixed 37 px row height was wrong in a real browser (rows were
  57 px, which caused scroll jumps), so rows are now measured. The plan also claimed `getItemKey`
  prevented remounts, and mutation testing disproved it, so it was removed. A 2,000-row check gave
  a p95 frame gap of about 26 ms, with about 20–36 rows in the DOM.

**Outcome:** All three were merged via PRs #1 and #2 and the `feat/grid-virtualization` branch.

---

## 9. Documentation

**Prompt:**

```
I think I have already done all tasks here. I want you to
1. Create the readme based on the requirements on the "Readme should explain" section
2. Generate an AI usage report
```

(with the assessment PDF attached)

**Outcome:** The AI:

- extracted the brief's README requirements
- read the ARCH doc, ADRs, task CSVs and retro log
- pulled real prompts and decision-point answers from the ~40 session transcripts
- re-ran the full test suite to get current counts (48 / 223 / 264)

It then wrote `README.md`, `AI_USAGE_REPORT.md` and this file. I reviewed them before submitting.
