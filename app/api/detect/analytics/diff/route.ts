import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { withDetectAuth } from '@/lib/api/auth';
import prisma from '@/lib/prisma';
import { sha256 } from '@/lib/server/hash';
import { analyticsLimiter } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RequestSchema = z.object({
  aId: z.string().min(1),
  bId: z.string().min(1),
});

/**
 * Fields compared at the scalar level. We deliberately leave out high-noise
 * fields (createdAt, idempotencyKey, score) — they always differ but tell us
 * nothing about fingerprint identity.
 */
const SCALAR_DIFF_FIELDS = [
  'name',
  'level',
  'ipPublic',
  'ipCountry',
  'ipAsn',
  'ipIsVpn',
  'tlsJa3',
  'tlsJa4',
  'serverUserAgent',
  'acceptLanguage',
  'acceptEncoding',
  'webrtcPublicIp',
  'webrtcIpMismatch',
  'clientUserAgent',
  'platform',
  'language',
  'languageCount',
  'timezoneName',
  'timezoneOffsetMin',
  'screenWidth',
  'screenHeight',
  'screenColorDepth',
  'hardwareConcurrency',
  'deviceMemoryGb',
  'pluginCount',
  'cookieEnabled',
  'doNotTrack',
  'webglVendor',
  'webglRenderer',
  'fontTotalCount',
  'fontUniqueCount',
  'dohSupport',
  'dnssecSupport',
  'resolverLocation',
  'cdpDetected',
  'webdriverFlag',
  'isChromium',
  'uaHash',
  'canvas2dHash',
  'webglHash',
  'audioHash',
  'fontsetHash',
] as const;

type DiffRow = {
  name: string;
  a: unknown;
  b: unknown;
  same: boolean;
};

function jaccardSimilarity(a: string | null, b: string | null): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const setA = new Set(a.split('\n').filter(Boolean));
  const setB = new Set(b.split('\n').filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  let inter = 0;
  setA.forEach(item => {
    if (setB.has(item)) inter += 1;
  });
  const union = setA.size + setB.size - inter;
  return union === 0 ? 1 : inter / union;
}

/**
 * POST /api/detect/analytics/diff
 *
 * Body: { aId, bId } — two scan IDs owned by the caller.
 * Returns a field-level diff, raw fingerprint comparison summary, and a
 * 0–100 overall similarity score.
 */
export async function POST(req: NextRequest) {
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
    const { aId, bId } = parsed.data;
    if (aId === bId) {
      return NextResponse.json(
        { error: 'invalid_payload', message: m.apiErrors.analyticsSameScan },
        { status: 400 }
      );
    }

    const scans = await prisma.detectScan.findMany({
      where: { userId: user.id, id: { in: [aId, bId] } },
    });
    if (scans.length !== 2) {
      return NextResponse.json(
        { error: 'not_found', message: m.apiErrors.scanNotFound },
        { status: 404 }
      );
    }
    const a = scans.find(s => s.id === aId)!;
    const b = scans.find(s => s.id === bId)!;

    const fields: DiffRow[] = SCALAR_DIFF_FIELDS.map(name => {
      const av = (a as unknown as Record<string, unknown>)[name];
      const bv = (b as unknown as Record<string, unknown>)[name];
      return { name, a: av, b: bv, same: av === bv };
    });

    const canvasSame =
      !!a.rawCanvas2dDataUrl &&
      !!b.rawCanvas2dDataUrl &&
      sha256(a.rawCanvas2dDataUrl) === sha256(b.rawCanvas2dDataUrl);
    const webglSame =
      !!a.rawWebglDataUrl &&
      !!b.rawWebglDataUrl &&
      sha256(a.rawWebglDataUrl) === sha256(b.rawWebglDataUrl);
    const audioSame =
      !!a.rawAudioFp && !!b.rawAudioFp && sha256(a.rawAudioFp) === sha256(b.rawAudioFp);
    const fontListJaccard = jaccardSimilarity(a.rawFontListSorted, b.rawFontListSorted);

    // Overall similarity: average of scalar-same ratio and the raw blob signals.
    const sameCount = fields.filter(f => f.same).length;
    const scalarRatio = fields.length > 0 ? sameCount / fields.length : 0;
    const blobSignals = [canvasSame ? 1 : 0, webglSame ? 1 : 0, audioSame ? 1 : 0, fontListJaccard];
    const blobAvg = blobSignals.reduce((s, v) => s + v, 0) / blobSignals.length;
    const similarityScore = Math.round(((scalarRatio + blobAvg) / 2) * 100);

    return NextResponse.json({
      aId,
      bId,
      fields,
      rawBlobDiff: { canvasSame, webglSame, audioSame, fontListJaccard },
      similarityScore,
    });
  });
}
