import './lib/loadEnv.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { seedIfEmpty } from './seedTrades.js';

seedIfEmpty(prisma)
  .catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
