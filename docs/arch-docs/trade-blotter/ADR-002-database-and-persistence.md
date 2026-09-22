# ADR-002: Database & ORM Choice

## Status

Accepted

## Context

The brief allows any database technology and says Docker is "optional but preferred." It also requires realistic seeded data (100-1,000 trades) generated on startup if none exists, plus migrations, and asks reviewers be able to run the app on Windows, Linux, or Mac without OS-specific setup.

## Decision

- Database: **PostgreSQL 16**, run via `docker-compose.yml`.
- ORM: **Prisma**, schema and migrations living in `database/schema.prisma` / `database/migrations/`.
- No SQLite fallback mode — a single provider avoids dual-schema maintenance and dev/prod drift, and Docker makes the Postgres path zero-install on every OS anyway.

## Alternatives Considered

- **SQLite (no Docker)**: simplest possible local setup, but the brief prefers Docker, and a reviewer running the zero-Docker path would exercise a different persistence layer than the Docker path — two code paths to keep correct for one test.
- **MongoDB**: the trade model is fully relational (fixed schema, indexed lookups by symbol/trader/status) with no need for schema flexibility; Postgres is the better fit and keeps Prisma's relational tooling (typed client, migrations) simple.
- **TypeORM / Drizzle instead of Prisma**: Prisma's migration CLI, typed client, and built-in `db seed` hook most directly match the brief's "migrations + startup seed" requirements with the least custom glue code.

## Consequences

- Local run without Docker requires a manually-provisioned Postgres instance (documented as a fallback in README, but the primary documented path is `docker compose up`).
- Seed script must be idempotent (check row count before generating) so repeated `docker compose up` runs don't duplicate data.
