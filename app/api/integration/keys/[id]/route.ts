import { NextResponse, type NextRequest } from 'next/server';

import { withDetectAuth } from '@/lib/api/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Params {
  params: { id: string };
}

/**
 * Revoke a key. Idempotent — revoking an already-revoked key is a no-op success.
 *
 * Forbidden via API-key auth: a compromised key shouldn't be able to revoke
 * the OTHER keys to lock the user out (or to mask its own theft by deleting
 * audit history).
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  return withDetectAuth(req, async ({ user, source, m }) => {
    if (source !== 'session') {
      return NextResponse.json(
        {
          error: 'forbidden',
          message: m.apiErrors.keyRevokeApiKeyModeBlocked,
        },
        { status: 403 }
      );
    }

    const result = await prisma.apiKey.updateMany({
      where: { id: params.id, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      // Either doesn't exist, doesn't belong to this user, or was already revoked.
      // We don't distinguish in the response — same shape either way.
      const exists = await prisma.apiKey.findFirst({
        where: { id: params.id, userId: user.id },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json(
          { error: 'not_found', message: m.apiErrors.keyNotFound },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ revoked: true });
  });
}
