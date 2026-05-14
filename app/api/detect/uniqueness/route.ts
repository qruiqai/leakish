import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { withDetectAuth } from '@/lib/api/auth';
import { FingerprintsSchema } from '@/lib/api/scan-payload';
import prisma from '@/lib/prisma';
import { sha256 } from '@/lib/server/hash';
import { uniquenessLimiter } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Uniqueness lookup: how many scans in our database share the same hash for
 * a given fingerprint kind.
 *
 * Body shape (POST so we don't put long fingerprints in URL):
 *   { fingerprints: { userAgent?, canvas2dDataUrl?, webglDataUrl?, audioFingerprint?, fontList? } }
 *
 * Response:
 *   {
 *     totalScans: number,
 *     matches:    { ua, canvas2d, webgl, audio, fontset }           // each: number | null
 *     ownMatches: { ua, canvas2d, webgl, audio, fontset }           // each: ScanRef[]
 *   }
 *
 * `matches.X` is the anonymous global count across all users (null = we
 * didn't have enough input to hash). `ownMatches.X` is the list of the
 * current user's saved scans that collide on that hash — this is what
 * the UI uses to say "与『昨天的 Chrome』重复". Cross-user matches stay
 * in the count only; other users' names/ids are never returned.
 */

const RequestSchema = z.object({
  fingerprints: FingerprintsSchema,
});

type Kind = 'ua' | 'canvas2d' | 'webgl' | 'audio' | 'fontset';

interface OwnMatch {
  id: string;
  name: string | null;
  createdAt: string;
}

/// How many of the user's own colliding scans we return per kind. Saved
/// history is already capped (MAX_SCANS_PER_USER = 200) so this is just a
/// response-size guard for the common case.
const OWN_MATCH_LIMIT = 20;

export async function POST(req: NextRequest) {
  return withDetectAuth(req, async ({ user, m }) => {
    const limit = uniquenessLimiter.consume(`uniq:${user.id}`);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: 'rate_limited',
          message: m.apiErrors.rateLimitUniqueness(limit.retryAfterSec),
        },
        {
          status: 429,
          headers: { 'retry-after': String(limit.retryAfterSec) },
        }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'invalid_json', message: m.apiErrors.invalidJson },
        { status: 400 }
      );
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'invalid_payload',
          message: m.apiErrors.invalidPayload,
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const fp = parsed.data.fingerprints;
    const lookups: Array<[Kind, string | null]> = [
      ['ua', fp.userAgent ? sha256(fp.userAgent) : null],
      ['canvas2d', fp.canvas2dDataUrl ? sha256(fp.canvas2dDataUrl) : null],
      ['webgl', fp.webglDataUrl ? sha256(fp.webglDataUrl) : null],
      ['audio', fp.audioFingerprint ? sha256(fp.audioFingerprint) : null],
      ['fontset', fp.fontList?.length ? sha256([...fp.fontList].sort().join('\n')) : null],
    ];

    // totalScans + per-hash matches are queried together so the denominator
    // and numerators come from the same DB snapshot — caching totalScans
    // separately produced "matches > totalScans" (>100 %) during ramp-up.
    const [totalScans, ...results] = await Promise.all([
      prisma.detectScan.count(),
      ...lookups.map(([kind, hash]) => {
        if (!hash) return Promise.resolve({ count: null, own: [] as OwnMatch[] });
        return Promise.all([
          prisma.detectFingerprintHash.count({ where: { kind, hash } }),
          prisma.detectFingerprintHash.findMany({
            where: { kind, hash, scan: { userId: user.id } },
            orderBy: { scan: { createdAt: 'desc' } },
            take: OWN_MATCH_LIMIT,
            select: {
              scan: { select: { id: true, name: true, createdAt: true } },
            },
          }),
        ]).then(([count, rows]) => ({
          count,
          own: rows.map(r => ({
            id: r.scan.id,
            name: r.scan.name,
            createdAt: r.scan.createdAt.toISOString(),
          })),
        }));
      }),
    ]);

    const matches = Object.fromEntries(
      lookups.map(([kind], i) => [kind, results[i].count])
    ) as Record<Kind, number | null>;
    const ownMatches = Object.fromEntries(
      lookups.map(([kind], i) => [kind, results[i].own])
    ) as Record<Kind, OwnMatch[]>;

    return NextResponse.json({ totalScans, matches, ownMatches });
  });
}
