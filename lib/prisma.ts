import { PrismaClient } from '.prisma/detect-client';
import { getServerEnv } from '@/lib/env';

/**
 * Detect-app Prisma singleton.
 *
 * Note the import path: `.prisma/detect-client` — we generate to a scoped output
 * (see `prisma/schema.prisma`) so detect's client never collides with manager's.
 *
 * The `global` cache prevents exhausting MySQL connections during HMR.
 */

const globalForPrisma = global as unknown as { detectPrisma: PrismaClient };

const NODE_ENV = getServerEnv().NODE_ENV;

export const prisma =
  globalForPrisma.detectPrisma ||
  new PrismaClient({
    log: NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (NODE_ENV !== 'production') globalForPrisma.detectPrisma = prisma;

export default prisma;
