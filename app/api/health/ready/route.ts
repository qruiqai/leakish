import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Readiness probe. Distinct from /api/health (liveness).
 *
 * Returns 200 only when we can talk to the database. A stalled Prisma
 * connection pool, DB outage, or misconfigured DATABASE_URL will surface as
 * 503 here and Kubernetes will pull the pod out of the service rotation
 * (without killing it, since liveness still passes).
 *
 * Keep the DB check cheap — a SELECT 1 round-trip is enough.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    logger.warn('readiness probe: DB check failed', err);
    return NextResponse.json(
      { status: 'unready', service: 'detect', reason: 'db_unreachable' },
      { status: 503, headers: { 'cache-control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { status: 'ready', service: 'detect', timestamp: new Date().toISOString() },
    { headers: { 'cache-control': 'no-store' } }
  );
}
