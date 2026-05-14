import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { withDetectAuth } from '@/lib/api/auth';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { generateApiKey } from '@/lib/server/api-key';
import { keyCreateLimiter } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Per-user cap on total active (non-revoked) keys. Hard ceiling. */
const MAX_KEYS_PER_USER = 20;

// Zod min/max messages are English placeholders — the route translates the
// "请求字段不符合预期" wrapper, and the underlying zod issue strings are not
// surfaced to users directly.
const CreateBodySchema = z.object({
  name: z.string().trim().min(1, 'name cannot be empty').max(60, 'name too long (max 60)'),
  /** Optional ISO timestamp; null/omitted = never expires. */
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .transform(v => (v ? new Date(v) : null)),
});

/**
 * Create a new API key.
 *
 * Returns the plaintext token in the `token` field. This is the only chance
 * to read it — subsequent GETs return only metadata + the friendly prefix.
 *
 * Note: we deliberately reject Bearer auth here (you can't create new keys
 * using an existing key). This avoids privilege escalation patterns where a
 * compromised key can mint more keys for the same user.
 */
export async function POST(req: NextRequest) {
  return withDetectAuth(req, async ({ user, source, m }) => {
    if (source !== 'session') {
      return NextResponse.json(
        {
          error: 'forbidden',
          message: m.apiErrors.keyCreateApiKeyModeBlocked,
        },
        { status: 403 }
      );
    }

    // Throttle churn — revoke+re-create loops. Hard cap of 20 keys already
    // exists; this prevents rapid cycling through the cap.
    const limit = keyCreateLimiter.consume(`keycreate:${user.id}`);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: 'rate_limited',
          message: m.apiErrors.rateLimitNewKey(limit.retryAfterSec),
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

    const parsed = CreateBodySchema.safeParse(body);
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

    // Cap check on active keys.
    const activeCount = await prisma.apiKey.count({
      where: { userId: user.id, revokedAt: null },
    });
    if (activeCount >= MAX_KEYS_PER_USER) {
      return NextResponse.json(
        {
          error: 'limit_reached',
          message: m.apiErrors.keyMaxReached(MAX_KEYS_PER_USER),
        },
        { status: 409 }
      );
    }

    const { token, hash, prefix } = generateApiKey();

    try {
      const row = await prisma.apiKey.create({
        data: {
          userId: user.id,
          name: parsed.data.name,
          expiresAt: parsed.data.expiresAt,
          hash,
          prefix,
        },
        select: {
          id: true,
          name: true,
          prefix: true,
          createdAt: true,
          expiresAt: true,
        },
      });

      return NextResponse.json(
        {
          ...row,
          /** Plaintext — show ONCE on the client. */
          token,
        },
        { status: 201 }
      );
    } catch (err) {
      logger.warn('apiKey.create failed:', err);
      return NextResponse.json(
        { error: 'persistence_failed', message: m.apiErrors.persistenceFailedCreate },
        { status: 500 }
      );
    }
  });
}

/**
 * List the current user's API keys (active first, then revoked).
 * Never returns plaintext or hash.
 */
export async function GET(req: NextRequest) {
  return withDetectAuth(req, async ({ user }) => {
    const rows = await prisma.apiKey.findMany({
      where: { userId: user.id },
      orderBy: [{ revokedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    return NextResponse.json({ keys: rows });
  });
}
