# ADR-001: Backend Framework & Monorepo Structure

## Status

Accepted

## Context

The brief requires a TypeScript React frontend and a TypeScript backend, delivered as `frontend/`, `backend/`, `database/` folders, runnable via Docker and/or simple setup instructions, within an 8-15 hour budget. Frontend and backend both need the `Trade` domain type and its validation rules — duplicating them invites drift between client and server validation.

## Decision

- Backend framework: **Express**, the first of the brief's "acceptable examples" and the one with the least ceremony for a ~5-endpoint CRUD API.
- Monorepo tooling: **pnpm workspaces** only (`frontend`, `backend`, `shared`), no Nx/Turborepo/Lerna.
- Add a `shared/` workspace for the `Trade` type and Zod validation schemas, imported by both `frontend/` and `backend/`.

## Amendment (2026-09-24)

This ADR originally said **npm workspaces**. The repo has shipped **pnpm workspaces** since the
initial scaffold (`pnpm-workspace.yaml`, `packageManager: pnpm@12.5.1`, and `pnpm/action-setup` in
CI). The workspace layout and the "no Nx/Turborepo/Lerna" decision are unchanged. Only the package
manager differs. Why the switch, and why this line went stale, is in
`knowledge/retros/day0-scaffold.md` (constraints notes and #4).

## Alternatives Considered

- **NestJS**: more structure (DI, decorators, modules) than a 5-endpoint API needs; steeper setup cost for the time budget.
- **Fastify / Hono**: viable, but Express's ubiquity reduces onboarding friction for whoever reviews this.
- **Nx/Turborepo**: build-graph caching and generators are overkill for three small workspaces; pnpm workspaces alone gives shared-package imports without extra tooling to configure or explain.
- **Duplicate types instead of `shared/`**: rejected — the brief explicitly scores "API contracts" and "type safety"; a single shared source is the more defensible design choice.

## Consequences

- `shared/` must be built (or path-mapped) before `backend/`/`frontend/` type-check against it — documented in README build order.
- Deliverable's required top-level `database/` folder holds only the Prisma schema/migrations, not app code — Prisma's client is generated into `backend/node_modules` via a `--schema=../database/schema.prisma` reference, keeping `database/` free of a `package.json` of its own.
