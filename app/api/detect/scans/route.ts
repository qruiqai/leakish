import { NextResponse, type NextRequest } from 'next/server';

import { withDetectAuth } from '@/lib/api/auth';
import { SaveScanRequestSchema } from '@/lib/api/scan-payload';
import { consumeScanQuota, refundScanQuota } from '@/lib/billing/entitlement';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { sha256 } from '@/lib/server/hash';
import { probeNetwork } from '@/lib/server/network-probe';
import { saveScanLimiter } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Hard cap on a client-supplied Idempotency-Key value. Plenty for UUID/ULID. */
const IDEMPOTENCY_KEY_MAX_LEN = 128;

/** Save the current scan. Returns `{ id }` on success. */
export async function POST(req: NextRequest) {
  return withDetectAuth(req, async ({ user, m }) => {
    // Idempotency: if the client retries with the same `Idempotency-Key`
    // header, we short-circuit to the existing row instead of creating a
    // duplicate. Quietly ignore oversized or empty header values.
    const rawKey = req.headers.get('idempotency-key')?.trim() ?? '';
    const idempotencyKey = rawKey && rawKey.length <= IDEMPOTENCY_KEY_MAX_LEN ? rawKey : null;
    if (idempotencyKey) {
      const existing = await prisma.detectScan.findUnique({
        where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
        select: { id: true },
      });
      if (existing) {
        // 200 (not 201) to signal "resolved to existing resource".
        return NextResponse.json({ id: existing.id, idempotent: true }, { status: 200 });
      }
    }

    // Per-user rate limit (10 saves / hour). Returns 429 with Retry-After
    // when exceeded so the UI can show a sensible error.
    const limit = saveScanLimiter.consume(`save:${user.id}`);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: 'rate_limited',
          message: m.apiErrors.rateLimitSave(limit.retryAfterSec),
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

    const parsed = SaveScanRequestSchema.safeParse(body);
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

    const { assessment, fingerprints, moduleSnapshot, name } = parsed.data;

    // Billing quota. Atomic for paid users (reserves a slot); read-only for
    // free users. On reject the client gets the upgrade URL plus reset time.
    // Deliberately ordered AFTER body parse + Zod validation: a paid user
    // sending malformed JSON or an invalid payload must not burn a slot.
    // Rate-limit stays in front because abusive bad-payload spam should still
    // be throttled.
    const quota = await consumeScanQuota(user.id);
    if (!quota.ok) {
      return NextResponse.json(
        {
          error: 'quota_exceeded',
          message: m.apiErrors.quotaExceeded(quota.entitlement.plan, quota.entitlement.scansLimit),
          plan: quota.entitlement.plan,
          limit: quota.entitlement.scansLimit,
          scansUsed: quota.entitlement.scansUsed,
          upgradeUrl: '/pricing',
          resetAt: quota.entitlement.periodEnd.toISOString(),
        },
        { status: 402 }
      );
    }
    const entitlement = quota.entitlement;

    // Re-probe network on the server side. The client could have lied about
    // its assessment but it can't lie about its real IP / TLS / headers.
    const probe = await probeNetwork(req);

    const fontListSorted = fingerprints.fontList?.length
      ? [...fingerprints.fontList].sort().join('\n')
      : null;

    const uaHash = fingerprints.userAgent ? sha256(fingerprints.userAgent) : null;
    const canvas2dHash = fingerprints.canvas2dDataUrl ? sha256(fingerprints.canvas2dDataUrl) : null;
    const webglHash = fingerprints.webglDataUrl ? sha256(fingerprints.webglDataUrl) : null;
    const audioHash = fingerprints.audioFingerprint ? sha256(fingerprints.audioFingerprint) : null;
    const fontsetHash = fontListSorted ? sha256(fontListSorted) : null;

    // Split-tunnel precomputation: when both server IP and WebRTC-leaked
    // public IP are known AND differ, flag it for cheap column-level filtering
    // in analytics. Unknown on either side → null (distinguishable from false).
    const webrtcIpMismatch =
      probe.ip && moduleSnapshot.webrtcPublicIp ? probe.ip !== moduleSnapshot.webrtcPublicIp : null;

    try {
      const scan = await prisma.detectScan.create({
        data: {
          userId: user.id,
          idempotencyKey,
          name: name ?? null,
          score: assessment.score,
          level: assessment.level,

          // Server-observed network
          ipPublic: probe.ip,
          ipFamily: probe.ipFamily,
          ipCountry: probe.country,
          ipRegion: probe.region,
          ipCity: probe.city,
          ipAsn: probe.asn,
          ipAsOrg: probe.asOrg,
          ipIsVpn: probe.isVpn,
          ipIsProxy: probe.isProxy,
          ipIsTor: probe.isTor,
          ipIsHosting: probe.isHosting,

          // TLS / HTTP
          tlsJa3: probe.tlsJa3,
          tlsJa4: probe.tlsJa4,
          serverUserAgent: probe.serverUserAgent,
          acceptLanguage: probe.acceptLanguage,
          acceptEncoding: probe.acceptEncoding,

          // Client WebRTC
          webrtcPublicIp: moduleSnapshot.webrtcPublicIp ?? null,
          webrtcLocalIpCount: moduleSnapshot.webrtcLocalIpCount ?? null,
          webrtcIpv6Count: moduleSnapshot.webrtcIpv6Count ?? null,
          webrtcHasMdns: moduleSnapshot.webrtcHasMdns ?? null,
          webrtcIpMismatch,

          // Browser fingerprint
          clientUserAgent: fingerprints.userAgent ?? null,
          platform: moduleSnapshot.platform ?? null,
          language: moduleSnapshot.language ?? null,
          languageCount: moduleSnapshot.languageCount ?? null,
          timezoneName: moduleSnapshot.timezoneName ?? null,
          timezoneOffsetMin: moduleSnapshot.timezoneOffsetMin ?? null,
          screenWidth: moduleSnapshot.screenWidth ?? null,
          screenHeight: moduleSnapshot.screenHeight ?? null,
          screenColorDepth: moduleSnapshot.screenColorDepth ?? null,
          hardwareConcurrency: moduleSnapshot.hardwareConcurrency ?? null,
          deviceMemoryGb: moduleSnapshot.deviceMemoryGb ?? null,
          pluginCount: moduleSnapshot.pluginCount ?? null,
          cookieEnabled: moduleSnapshot.cookieEnabled ?? null,
          doNotTrack: moduleSnapshot.doNotTrack ?? null,
          onlineStatus: moduleSnapshot.onlineStatus ?? null,

          // Canvas / WebGL
          webglVendor: moduleSnapshot.webglVendor ?? null,
          webglRenderer: moduleSnapshot.webglRenderer ?? null,

          // Fonts
          fontTotalCount: moduleSnapshot.fontTotalCount ?? null,
          fontUniqueCount: moduleSnapshot.fontUniqueCount ?? null,

          // DNS
          dohSupport: moduleSnapshot.dohSupport ?? null,
          dnssecSupport: moduleSnapshot.dnssecSupport ?? null,
          resolverLocation: moduleSnapshot.resolverLocation ?? null,

          // CDP / automation
          cdpDetected: moduleSnapshot.cdpDetected ?? null,
          cdpConfidence: moduleSnapshot.cdpConfidence ?? null,
          webdriverFlag: moduleSnapshot.webdriverFlag ?? null,
          isChromium: moduleSnapshot.isChromium ?? null,

          // Fingerprint hashes (uniqueness join key)
          uaHash,
          canvas2dHash,
          webglHash,
          audioHash,
          fontsetHash,

          // Raw fingerprint blobs (Tier 2 — kept for offline comparison)
          rawUserAgent: fingerprints.userAgent ?? null,
          rawCanvas2dDataUrl: fingerprints.canvas2dDataUrl ?? null,
          rawWebglDataUrl: fingerprints.webglDataUrl ?? null,
          rawAudioFp: fingerprints.audioFingerprint ?? null,
          rawFontListSorted: fontListSorted,

          payload: { assessment },
          hashes: {
            create: [
              uaHash && { kind: 'ua', hash: uaHash },
              canvas2dHash && { kind: 'canvas2d', hash: canvas2dHash },
              webglHash && { kind: 'webgl', hash: webglHash },
              audioHash && { kind: 'audio', hash: audioHash },
              fontsetHash && { kind: 'fontset', hash: fontsetHash },
            ].filter(Boolean) as Array<{ kind: string; hash: string }>,
          },
        },
        select: { id: true },
      });

      // Per-user retention cap, driven by plan. We delete the oldest rows
      // above `entitlement.retainCap` so a user can't pile up unbounded data.
      // Failures here are non-fatal — the user already got their scan saved;
      // the next insert will retry.
      pruneOldScansFor(user.id, entitlement.retainCap).catch(err =>
        logger.warn(`pruneOldScans for ${user.id} failed:`, err)
      );

      return NextResponse.json({ id: scan.id }, { status: 201 });
    } catch (error) {
      // Handle a concurrent-insert race on the idempotency key. If two
      // retries raced, the loser sees Prisma P2002 — look up the winner's
      // row and return that. If the P2002 was for a different constraint,
      // the findUnique returns nothing and we fall through to the 500 path.
      if (idempotencyKey && isPrismaKnownError(error, 'P2002')) {
        const existing = await prisma.detectScan.findUnique({
          where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
          select: { id: true },
        });
        if (existing) {
          // Idempotent hit: we already counted this save on a prior request.
          // Refund the prededucted slot to avoid double-charging the user.
          if (entitlement.isPaid) {
            refundScanQuota(user.id).catch(err =>
              logger.warn(`quota refund (idempotent) failed for ${user.id}:`, err)
            );
          }
          return NextResponse.json({ id: existing.id, idempotent: true }, { status: 200 });
        }
      }
      // Real write failure — refund the reserved paid slot so the user can
      // retry without losing quota.
      if (entitlement.isPaid) {
        refundScanQuota(user.id).catch(err =>
          logger.warn(`quota refund (error) failed for ${user.id}:`, err)
        );
      }
      logger.warn('saveScan failed:', error);
      return NextResponse.json(
        { error: 'persistence_failed', message: m.apiErrors.persistenceFailedSave },
        { status: 500 }
      );
    }
  });
}

/**
 * List the current user's scans. Newest first.
 *
 * Cursor-based pagination on `createdAt` DESC (and id as tiebreaker):
 *   - `?limit=50` (default, max 100)
 *   - `?before=<scanId>` returns rows strictly older than that scan.
 *
 * Response includes `nextCursor` — the id of the last row in the page, or
 * null when the page is the final one.
 */
export async function GET(req: NextRequest) {
  return withDetectAuth(req, async ({ user }) => {
    const limit = clampInt(req.nextUrl.searchParams.get('limit'), 50, 100);
    const before = req.nextUrl.searchParams.get('before');
    // Exact-match name filter for duplicate-name pre-check. MySQL's default
    // collation (utf8mb4_0900_ai_ci) is case-insensitive, so "Test" matches
    // "test". Trimmed + capped at the same 80-char limit as save.
    const nameRaw = req.nextUrl.searchParams.get('name');
    const nameFilter = nameRaw ? nameRaw.trim().slice(0, 80) : null;

    // Translate `before` into a (createdAt, id) cursor so results are
    // stable under ties in createdAt.
    let cursorFilter: { OR: Array<Record<string, unknown>> } | undefined;
    if (before) {
      const anchor = await prisma.detectScan.findFirst({
        where: { id: before, userId: user.id },
        select: { id: true, createdAt: true },
      });
      if (anchor) {
        cursorFilter = {
          OR: [
            { createdAt: { lt: anchor.createdAt } },
            { createdAt: anchor.createdAt, id: { lt: anchor.id } },
          ],
        };
      }
      // If `before` doesn't resolve (bad id / not the user's), we silently
      // fall through and return the newest page — same as no cursor.
    }

    const rows = await prisma.detectScan.findMany({
      where: {
        userId: user.id,
        ...(cursorFilter ?? {}),
        ...(nameFilter ? { name: nameFilter } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        name: true,
        createdAt: true,
        score: true,
        level: true,
        ipPublic: true,
        ipCountry: true,
        ipRegion: true,
        ipCity: true,
        ipAsn: true,
        ipAsOrg: true,
        ipIsVpn: true,
        cdpDetected: true,
        webdriverFlag: true,
        webrtcIpMismatch: true,
      },
    });

    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
    return NextResponse.json({ scans: rows, nextCursor });
  });
}

function isPrismaKnownError(err: unknown, code: string): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === code;
}

function clampInt(raw: string | null, fallback: number, max: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

/**
 * Trim a user's scan history to the most recent `retainCap` rows. The cap is
 * supplied by the entitlement (20 / 100 / 500 for Free / Starter / Pro).
 * Cascade delete on DetectFingerprintHash takes care of dependent rows.
 *
 * Race-safe: rather than SELECT-ids-then-DELETE-not-in-set (which races with
 * concurrent inserts — a scan saved between the two queries would be absent
 * from the survivor set and get deleted), we compute a boundary timestamp
 * from the (retainCap+1)-th newest row and delete strictly older rows. Rows
 * tied with the boundary on createdAt temporarily stay; the next prune
 * catches them.
 */
async function pruneOldScansFor(userId: string, retainCap: number): Promise<void> {
  const [boundary] = await prisma.detectScan.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: retainCap,
    take: 1,
    select: { createdAt: true },
  });
  if (!boundary) return;

  await prisma.detectScan.deleteMany({
    where: { userId, createdAt: { lt: boundary.createdAt } },
  });
}
