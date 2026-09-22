import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.ts';
import { env } from '../config/env.js';

// Prisma 7 requires a driver adapter for the runtime client (schema.prisma no
// longer carries a datasource url). Prisma pools connections itself via the
// adapter's pg Pool; there is no separate pooler service in this architecture
// (ADR-002 is self-hosted Postgres, not a serverless provider).
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
