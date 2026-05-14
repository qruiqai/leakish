import { NextResponse, type NextRequest } from 'next/server';

import { withDetectAuth } from '@/lib/api/auth';
import { probeNetwork } from '@/lib/server/network-probe';
import { networkProbeLimiter } from '@/lib/server/rate-limit';

// Always run dynamically — every request observes a different client IP / UA.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return withDetectAuth(req, async ({ user, m }) => {
    const limit = networkProbeLimiter.consume(`network:${user.id}`);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: 'rate_limited',
          message: m.apiErrors.rateLimitNetwork(limit.retryAfterSec),
        },
        {
          status: 429,
          headers: { 'retry-after': String(limit.retryAfterSec) },
        }
      );
    }

    const probe = await probeNetwork(req);
    return NextResponse.json(probe, {
      headers: {
        'cache-control': 'no-store',
      },
    });
  });
}
