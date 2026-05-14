import { NextResponse, type NextRequest } from 'next/server';

import { withDetectAuth } from '@/lib/api/auth';
import prisma from '@/lib/prisma';
import { computeUserAnalytics, toScanSummary, type AnalyticsScan } from '@/lib/server/analytics';
import { analyticsLimiter } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/detect/analytics
 *
 * Returns aggregated statistics over the authenticated user's saved scans:
 * field distributions, per-kind hash repetition, timeline, and outlier scans.
 *
 * Raw fingerprint blobs are NEVER fetched here — the payload would balloon to
 * megabytes for no analytical benefit. Use /diff for raw comparison.
 */
export async function GET(req: NextRequest) {
  return withDetectAuth(req, async ({ user, m }) => {
    const limit = analyticsLimiter.consume(`analytics:${user.id}`);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: 'rate_limited',
          message: m.apiErrors.rateLimitAnalytics(limit.retryAfterSec),
        },
        { status: 429, headers: { 'retry-after': String(limit.retryAfterSec) } }
      );
    }

    const rows = await prisma.detectScan.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        score: true,
        level: true,
        ipPublic: true,
        ipCountry: true,
        ipAsn: true,
        webrtcIpMismatch: true,
        platform: true,
        language: true,
        timezoneName: true,
        screenWidth: true,
        screenHeight: true,
        webglRenderer: true,
        fontTotalCount: true,
        uaHash: true,
        canvas2dHash: true,
        webglHash: true,
        audioHash: true,
        fontsetHash: true,
      },
    });

    const scans: AnalyticsScan[] = rows;

    const analytics = computeUserAnalytics(scans);
    const scanSummaries = scans.map(toScanSummary);

    return NextResponse.json({ analytics, scanSummaries });
  });
}
