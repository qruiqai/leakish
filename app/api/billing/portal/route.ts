import { NextResponse, type NextRequest } from 'next/server';

import { withDetectAuth } from '@/lib/api/auth';
import { getAppUrl } from '@/lib/billing/app-url';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { getStripe } from '@/lib/server/stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return withDetectAuth(req, async ({ user, source, m }) => {
    if (source !== 'session') {
      return NextResponse.json(
        {
          error: 'api_key_cannot_subscribe',
          message: m.apiErrors.billingApiKeyCannotSubscribe,
        },
        { status: 403 }
      );
    }

    const userRow = await prisma.user.findUnique({
      where: { id: user.id },
      select: { stripeCustomerId: true },
    });
    if (!userRow?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'not_subscribed', message: m.apiErrors.billingNotSubscribed },
        { status: 400 }
      );
    }

    const appUrl = getAppUrl();
    if (!appUrl) {
      return NextResponse.json(
        { error: 'not_configured', message: m.apiErrors.billingNotConfigured },
        { status: 500 }
      );
    }

    try {
      const stripe = getStripe();
      const session = await stripe.billingPortal.sessions.create({
        customer: userRow.stripeCustomerId,
        return_url: `${appUrl}/account/billing`,
      });
      return NextResponse.json({ url: session.url });
    } catch (error) {
      logger.warn('billing portal failed:', error);
      return NextResponse.json(
        { error: 'portal_failed', message: m.apiErrors.billingPortalFailed },
        { status: 500 }
      );
    }
  });
}
