import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// .env lives at the repo root, not backend/ — dotenv's default lookup is
// relative to process.cwd() (backend/ when run via `pnpm --filter backend`).
config({ path: '../.env' });

// Prisma 7 moved the CLI's datasource URL here (migrate/generate/studio);
// the runtime PrismaClient gets its connection via the @prisma/adapter-pg
// driver adapter instead — see backend/src/lib/prisma.ts.
export default defineConfig({
  schema: '../database/schema.prisma',
  migrations: {
    path: '../database/migrations',
    seed: 'tsx src/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
