import { randomBytes } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getServerEnv } from '@/lib/env';
import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages } from '@/lib/i18n/messages';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { hashApiKey } from '@/lib/server/api-key';
import { apiKeyLoginLimiter } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Extract the best-available client IP for rate-limiting. Browser-origin
 * requests arrive with cf-connecting-ip (behind Cloudflare) or x-forwarded-for
 * (behind other proxies). CLI curl / direct access falls back to 'unknown',
 * which buckets all such callers together — acceptable for an admission
 * rate-limit since shared quota is still a limit.
 */
function clientIpFor(req: NextRequest): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = req.headers.get('x-forwarded-for');
  const first = xff?.split(',')[0]?.trim();
  if (first) return first;
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

/**
 * NextAuth's database-session strategy stores the cookie value verbatim in
 * `Session.sessionToken`. So to "log in" via API key we just:
 *
 *   1. validate the `det_…` token against the ApiKey table,
 *   2. mint a random session token and INSERT a Session row pointing at the
 *      key's owner,
 *   3. set the same cookie NextAuth would set after a normal sign-in.
 *
 * From the browser's POV this is indistinguishable from a Google / magic-link
 * login — useSession() picks it up on the next /api/auth/session round-trip.
 *
 * We deliberately do NOT go through a NextAuth CredentialsProvider because v4
 * Credentials only supports JWT sessions; we'd have to switch the whole app
 * off database sessions to use it.
 */

/** Mirror NextAuth v4's default session.maxAge (30 days). */
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// Zod's min() needs a string at schema-definition time, so we keep an English
// placeholder here that gets translated below if validation fails.
const BodySchema = z.object({
  apiKey: z.string().trim().min(1, 'apiKey cannot be empty'),
});

export async function POST(req: NextRequest) {
  const m = getMessages(getLocale());

  // Origin check — block cross-origin browser callers whose Origin header
  // doesn't match NEXTAUTH_URL. CLI tools typically send no Origin header so
  // they're unaffected. If NEXTAUTH_URL isn't set (should only happen in dev),
  // skip the check.
  const origin = req.headers.get('origin');
  const allowedOrigin = getServerEnv().NEXTAUTH_URL;
  if (origin && allowedOrigin && origin !== allowedOrigin) {
    return NextResponse.json(
      { error: 'forbidden', message: m.apiErrors.csrfBlocked },
      { status: 403 }
    );
  }

  // Brute-force / enumeration guard. Per-IP to prevent a single attacker from
  // hammering the endpoint regardless of how many tokens they test.
  const limit = apiKeyLoginLimiter.consume(`login:${clientIpFor(req)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: m.apiErrors.rateLimitApiKeyLogin(limit.retryAfterSec),
      },
      {
        status: 429,
        headers: { 'retry-after': String(limit.retryAfterSec) },
      }
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: m.apiErrors.invalidJson },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', message: m.apiErrors.apiKeyRequiredField },
      { status: 400 }
    );
  }

  const token = parsed.data.apiKey.trim();
  if (!token.startsWith('det_')) {
    return NextResponse.json(
      { error: 'unauthorized', message: m.apiErrors.apiKeyBadFormat },
      { status: 401 }
    );
  }

  const hash = hashApiKey(token);

  const key = await prisma.apiKey.findUnique({
    where: { hash },
    select: {
      id: true,
      revokedAt: true,
      expiresAt: true,
      userId: true,
      user: { select: { id: true, email: true } },
    },
  });

  // Single 401 message regardless of which check failed — don't leak whether
  // the prefix exists vs. whether it's expired/revoked.
  const invalid =
    !key ||
    !!key.revokedAt ||
    (key.expiresAt && key.expiresAt.getTime() <= Date.now()) ||
    !key.user.email;

  if (invalid || !key) {
    return NextResponse.json(
      { error: 'unauthorized', message: m.apiErrors.unauthorizedApiKey },
      { status: 401 }
    );
  }

  // Best-effort lastUsedAt update — don't block login on it.
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(err => logger.warn('apiKey.lastUsedAt update failed:', err));

  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  try {
    await prisma.session.create({
      data: {
        sessionToken,
        userId: key.userId,
        expires,
      },
    });
  } catch (err) {
    logger.error('api-key-login: session.create failed', err);
    return NextResponse.json(
      { error: 'session_create_failed', message: m.apiErrors.sessionCreateFailed },
      { status: 500 }
    );
  }

  // Mirror NextAuth v4's defaultCookies(useSecureCookies) logic.
  const useSecureCookies =
    process.env.NEXTAUTH_URL?.startsWith('https://') === true || req.nextUrl.protocol === 'https:';
  const cookieName = useSecureCookies
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: cookieName,
    value: sessionToken,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: useSecureCookies,
    expires,
  });

  return res;
}
