# AI Usage Report

This project was built with heavy AI assistance. I made the design and scope decisions, set the
rules the AI had to follow, and reviewed every change before it was committed. Most code, tests and
docs were written by the AI inside a fixed plan-and-verify loop. This report covers:

- what tools I used and how
- which decisions the AI shaped
- where I accepted or overrode it

A representative sample of real prompts is in [`PROMPT_LOG.md`](PROMPT_LOG.md).

---

## 1. Tools used

| Tool                                                             | What it was used for                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Claude Code (desktop app)**                                    | The main tool, used for all coding, testing, reviewing, git and PR work. There were about 40 sessions between 22 and 24 September 2026, usually one fresh session per task.                                              |
| **Models: Claude Opus 5.5 and Claude Sonnet 5**                  | Opus for planning, architecture-sensitive tasks and reviews. Sonnet for the more routine tasks. I raised the reasoning effort for harder tasks (e.g. `xhigh` for the grid-sorting task) and lowered it for simpler ones. |
| **Custom slash commands** (`.claude/commands/`)                  | A fixed workflow: `/scaffold`, `/dev-tasks-planner`, then `/evaluate` → `/plan` → `/apply` → `/validate` for each task (bundled as `/epav`), and finally `/commit` and `/create-pr`. See §2.                             |
| **Review subagents** (`.claude/agents/`)                         | A `code-reviewer` agent for `/code-review` over the branch or the whole project. Used 12 times.                                                                                                                          |
| **`nexus` MCP server** (my own tooling)                          | `ingest_architecture_doc` turned `ARCH.md` into `knowledge/rules/arch-summary.md`. `generate_project_rules` produced `AGENTS.md` and the coding standards. `resolve_package_versions` looked up exact package versions.  |
| **graphify skill**                                               | Builds a knowledge graph of the repo. Each `/evaluate` and `/validate` used it to check the blast radius and confirm a change crossed no unplanned module boundary.                                                      |
| **Headless Chrome, driven over the DevTools Protocol by the AI** | `/validate` checked the UI in a real browser: sorting across 500 rows, toasts, dialogs and focus, virtualised scrolling with 2,000 rows. It stubbed POST and PATCH requests so the dev database was never written to.    |

## 2. How AI was used: the workflow

I didn't prompt the AI ad hoc. I gave it a repeatable process with written rules, so each step's
output could be checked before the next step started.

1. **Architecture first.**
   - `docs/arch-docs/trade-blotter/ARCH.md` and ADR-001…004 set the stack, data model, API, error
     envelope and real-time design, before any code existed.
   - `ARCH.md` §13 has explicit notes on how the AI tooling should adapt to a single-sitting
     take-home.
2. **Project rules.**
   - `AGENTS.md` and `knowledge/rules/coding-standards.md` hold the non-negotiables:
     - validate only at the API boundary
     - no raw SQL
     - one error envelope
     - `pino`, never `console.log`
     - exact dependency pins
     - `shared/` is the single source of truth
     - WebSocket events reconcile into the Query cache and never trigger a refetch
   - Every session loads these automatically, so each new session starts with the same
     constraints.
3. **Scaffold** (`/scaffold` → `/plan` → `/apply` → `/validate`). This produced the monorepo,
   tooling, Dockerfiles, CI and the first working vertical slice.
4. **Task breakdown** (`/dev-tasks-planner`). The ARCH doc became 20 core tasks and 3 bonus tasks,
   in `docs/dev-tasks/trade-blotter/*.csv`, each with a user story and acceptance criteria.
5. **One cycle per task, in a fresh session:**
   - **`/evaluate`**: read the task, the ARCH doc, the retro log and the graph. Report the gaps
     between the acceptance criteria and the code.
   - **`/plan`**: write a file-by-file plan with its blast radius. **I approved or corrected it
     before any code was written.**
   - **`/apply`**: implement the plan. Every test file is mutation-checked: a bug is planted on
     purpose and the test must catch it.
   - **`/validate`**: run lint, typecheck, test and build, then check behaviour against the running
     app (curl, real WebSocket clients, headless Chrome). Tag each finding as `FIX NOW` or
     `BACKLOG`.
   - **`/commit`**: conventional commits, one logical change each, on a feature branch.
6. **Shared memory between sessions.**
   - Every finding goes into `knowledge/retros/day0-scaffold.md`, which has 190 numbered entries.
   - Every reusable test technique goes into `knowledge/patterns/` (19 files).
   - Later sessions read both, so lessons carried forward. For example, a jsdom quirk found in
     TASK-014 was already known when the virtualisation task needed it.
7. **Independent review.** `/code-review` ran with a separate reviewer agent over the branch and
   then over the whole project, before the bonus work began.

## 3. Examples of prompts

Most prompts were short, because the slash commands carry the detailed instructions. The important
input was my answers at the decision points. Full examples are in `PROMPT_LOG.md`.

- `/dev-tasks-planner trade-blotter based on docs/arch-docs/trade-blotter/`
- `/evaluate EPIC-CORE-BLOTTER TASK-012`, then `/plan`, `/apply`, `/validate`, `/commit`
- `sorry, but let's change npm to pnpm for faster and smaller profile`
- `/code-review for the whole project please`, then `fix all three please`
- `no, create branch for each task, then commit`
- A scaffold decision point, where I chose **"Combined pass"**: wire real Prisma CRUD and real
  WebSocket broadcasting now, instead of a mock-data-only Day-0 scaffold.

## 4. Key decisions influenced by AI

| Decision                                                                          | How AI influenced it                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`shared/` package for types, Zod schemas and WS events**                        | Proposed in the architecture phase, because the brief scores "API contracts" and "type safety". It became the backbone: forms and routes validate against the same schema.                                                                                                                                                         |
| **Raw `ws` over Socket.IO or SSE**                                                | The AI weighed all three. SSE was a close second. `ws` won because it keeps the option of two-way messaging at almost no extra cost. See ADR-003.                                                                                                                                                                                  |
| **Write WebSocket events into the TanStack Query cache, never refetch**           | This was in the AI's architecture draft. The later hardening of this hook was also AI-found. The original only updated the _active_ filter's cache entry, so other cached filter views went stale. It could also create a one-row list for a query that was still loading. Both are fixed and tested (TASK-012).                   |
| **Postgres sequence for trade ids, plus row-locked amend and cancel**             | The AI flagged the `count() + 1` id race and the check-then-act cancel race during TASK-004 and TASK-006. `/code-review` raised them again as the top issue. I chose to fix them. The AI then showed its own lock test didn't prove anything (deleting the lock still passed), and added an 8-way concurrent-amend test that does. |
| **Schema limits that match the database**                                         | The AI noticed "positive" wasn't enough: quantity is int32 and price is `DECIMAL(12,4)`. Oversized values caused 500s, and 5-decimal prices were silently rounded. The shared schema now enforces both limits in the form and the API.                                                                                             |
| **Forms use `noValidate`**                                                        | In a real browser, the AI found that Chrome's own `step` validation blocked the submit before Zod ran. The user saw a different message from the one the server would return.                                                                                                                                                      |
| **Measured row heights in the virtualised grid**                                  | The plan used a fixed 37 px row estimate. The real-browser check found rows were 57 px (cells wrap), which caused scroll jumps. The AI switched to measured rows and re-tested with 2,000 trades.                                                                                                                                  |
| **`AUTH_COOKIE_SECURE` separate from `NODE_ENV`**                                 | The plan tied the cookie's `Secure` flag to `NODE_ENV=production`. During implementation the AI noticed that Docker Compose runs _production over plain http_, where Safari would drop a `Secure` cookie. It changed course and recorded the deviation.                                                                            |
| **Seed extracted into a testable module; `.dockerignore`; Prisma generate in CI** | These are AI-found infrastructure bugs. The seed ran at import time and couldn't be tested. Host `node_modules` and `.env` were being copied into images. CI would have failed on its first run, because the Prisma client was never generated.                                                                                    |

## 5. Where I accepted or rejected AI suggestions

### Overridden or redirected by me

- **npm → pnpm.** The first scaffold plan used npm workspaces, per the original ADR-001. I stopped
  it mid-apply and switched to pnpm.
  - _Side effect:_ ADR-001 still said "npm" for a day. `/dev-tasks-planner` later caught the stale
    line, and it was corrected with a dated amendment.
  - _Lesson:_ when I redirect the AI mid-task, I also need to ask it to update the docs.
- **Mock-only Day-0 scaffold.** The `/scaffold` command normally builds a mock-data shell first.
  I chose a combined pass with real persistence and real WebSockets from the start, because this is
  a one-person take-home with no Day-1 handoff.
- **Auth scope.** The scaffold offered mock-auth scaffolding up front. I deferred it and added it
  later as bonus TASK-002, so the core scope stayed focused.
- **Git workflow.** The AI committed several tasks onto one branch that was named after an earlier
  task. I had it redo them as one branch per task, then merge.
- **Which TASK-001.** Both CSVs had a TASK-001. The AI recommended starting on the bonus Audit
  Trail task, since the core one was already marked Done. I chose the core task instead, to
  harden what was there before adding features. That set the pattern for the whole project:
  evaluate and test-harden every "Done" core task before starting any bonus work.
- **Graph rebuild.** I kept the existing, richer knowledge graph (772 nodes) instead of letting the
  AI overwrite it with a coarser fresh extraction (505 nodes).

### Accepted after review

- **Fix-now items raised by `/validate`.** I approved each one:
  - One malformed WebSocket frame could crash the whole backend. There was no `'error'` listener
    on client sockets. A test now proves the server survives.
  - The concurrency fixes from `/code-review`.
  - The missing lock test for the audit trail.
- **Behaviour changes beyond the acceptance criteria.** Each was flagged in the plan, and I
  approved them:
  - Prices show 2–4 decimal places instead of cutting to 2, so an amend from 10.1234 to 10.1249 no
    longer looks like a no-op.
  - Sorting is a single column with two states. The old version cleared the sort on the second
    click.
  - A failed save keeps the modal open with the user's input.

### AI suggestions rejected or corrected, by the AI or by me, through testing

- **"`getItemKey` prevents remounts on prepend"** was a claim in the virtualisation plan. Mutation
  testing showed that removing it changed nothing (React keys already come from `row.id`), so it
  was deleted rather than kept as cargo cult.
- **Test counts in the task CSVs** were sometimes inflated. Early on, a stale `dist/` made 8 tests
  count as 16. Real counts were always taken from the actual test run.
- **"CI is already running on every push"** was in a task row, but the repo had no remote at the
  time. The AI caught its own unverified claim and corrected the row.

### Deliberately left for a human decision

The AI flagged these but didn't change them, because each one changes an approved spec or a policy.
They are logged in the retro.

- Whether `413 Payload Too Large` should be added to the error contract.
- Whether prices should use a fixed 4 decimal places.
- Whether lint warnings should fail CI.
- Whether an empty `PATCH` body should be rejected.

## 6. What I learned about working this way

- **Written rules beat long prompts.** `AGENTS.md`, the coding standards and the retro log meant
  one-line prompts gave consistent results across about 40 fresh sessions.
- **The plan gate matters most.** Reviewing a file-by-file plan took minutes, and it is where most
  of my corrections happened.
- **Make the AI prove its tests.** Mutation-checking caught weak tests again and again: a lock test
  that passed without the lock, a `/health` check that matched `/healthz`, a row-id test that
  couldn't fail. Plain green checks would have hidden them.
- **Check in the real runtime.** Several real bugs only appeared outside jsdom: row heights, native
  form validation blocking Zod, and repeated "connection lost" toasts on every retry. The AI found
  them by driving a real browser and real sockets.
- **AI keeps notes well, but they go stale when I redirect it.** The pnpm/ADR mismatch showed that
  a mid-task change of direction has to be carried into the docs on purpose.
