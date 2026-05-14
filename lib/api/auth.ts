import { getServerSession } from 'next-auth';
import { NextResponse, type NextRequest } from 'next/server';

import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages, type Messages } from '@/lib/i18n/messages';
import prisma from '@/lib/prisma';
import { extractApiKey, hashApiKey } from '@/lib/server/api-key';
import { logger } from '@/lib/logger';

export interface AuthedUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export type AuthSource = 'session' | 'api-key';

export type AuthedHandler = (ctx: {
  req: NextRequest;
  user: AuthedUser;
  source: AuthSource;
  m: Messages;
}) => Promise<Response> | Response;

/**
 * Wraps a route handler, requiring authentication.
 *
 * Two auth sources are accepted, tried in this order:
 *
 *   1. **Bearer API key** in the Authorization header (`det_…`):
 *      Looked up by SHA-256 hash; rejected if revoked / expired.
 *      `lastUsedAt` is updated best-effort.
 *
 *   2. **NextAuth session cookie** (the browser flow).
 *
 * Returns a normalized 401 JSON if neither succeeds.
 */
export async function withDetectAuth(req: NextRequest, handler: AuthedHandler): Promise<Response> {
  const m = getMessages(getLocale());

  // Path 1: API key
  const tokenFromBearer = extractApiKey(req);
  if (tokenFromBearer) {
    const user = await authenticateApiKey(tokenFromBearer);
    if (user) return handler({ req, user, source: 'api-key', m });
    return NextResponse.json(
      { error: 'unauthorized', message: m.apiErrors.unauthorizedApiKey },
      { status: 401 }
    );
  }

  // Path 2: NextAuth session cookie
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; email?: string | null } | undefined;

  if (!sessionUser?.id) {
    return NextResponse.json(
      { error: 'unauthorized', message: m.apiErrors.unauthorizedSession },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, email: true, name: true, image: true },
  });

  if (!user || !user.email) {
    return NextResponse.json(
      { error: 'unauthorized', message: m.apiErrors.unauthorizedAccount },
      { status: 401 }
    );
  }

  return handler({
    req,
    user: { ...user, email: user.email },
    source: 'session',
    m,
  });
}

/**
 * Same as withDetectAuth but returns user-or-null instead of erroring,
 * so a route can serve both anonymous and authed flows.
 */
export async function getOptionalUser(): Promise<AuthedUser | null> {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; email?: string | null } | undefined;
  if (!sessionUser?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, email: true, name: true, image: true },
  });
  if (!user?.email) return null;
  return { ...user, email: user.email };
}

/**
 * Resolve a Bearer token to an active user, side-effecting `lastUsedAt`.
 * Returns null if the token isn't recognized, was revoked, or has expired.
 */
async function authenticateApiKey(token: string): Promise<AuthedUser | null> {
  const hash = hashApiKey(token);

  const key = await prisma.apiKey.findUnique({
    where: { hash },
    select: {
      id: true,
      revokedAt: true,
      expiresAt: true,
      user: {
        select: { id: true, email: true, name: true, image: true },
      },
    },
  });

  if (!key) return null;
  if (key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return null;
  if (!key.user.email) return null;

  // Touch lastUsedAt — fire and forget. A failure here shouldn't fail the
  // request; we'll catch up on the next request.
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(err => logger.warn('apiKey.lastUsedAt update failed:', err));

  return { ...key.user, email: key.user.email };
}
