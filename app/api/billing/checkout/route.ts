import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { withDetectAuth } from '@/lib/api/auth';
import { getAppUrl } from '@/lib/billing/app-url';
import { PAID_STATUSES } from '@/lib/billing/entitlement';
import { priceIdFor } from '@/lib/billing/plans';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { getStripe } from '@/lib/server/stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  plan: z.enum(['starter', 'pro']),
  interval: z.enum(['month', 'year']),
});

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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'invalid_json', message: m.apiErrors.invalidJson },
        { status: 400 }
      );
    }

    const parsed = BodySchema.safeParse(body);
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

    const { plan, interval } = parsed.data;
    const price = priceIdFor(plan, interval);
    if (!price) {
      return NextResponse.json(
        { error: 'plan_invalid', message: m.apiErrors.billingPlanInvalid },
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

    // Defense in depth: an already-paid user must never re-enter Checkout —
    // that would mint a second parallel Stripe Subscription, billing them
    // twice. The pricing UI routes these clicks to the Customer Portal, but
    // a stale tab / direct API call could still land here. Refuse with a
    // 409 the client can recognize and bounce to portal.
    const existing = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (existing && PAID_STATUSES.has(existing.status)) {
      return NextResponse.json(
        {
          error: 'already_subscribed',
          message: m.apiErrors.billingAlreadySubscribed,
          switchInPortal: true,
        },
        { status: 409 }
      );
    }

    try {
      const stripe = getStripe();

      // Reuse or create a Stripe customer. Storing customerId on User lets the
      // portal session and future checkouts find the same customer record.
      const userRow = await prisma.user.findUnique({
        where: { id: user.id },
        select: { stripeCustomerId: true },
      });

      let customerId = userRow?.stripeCustomerId ?? null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId: customerId },
        });
      }

      // Intentionally omit `payment_method_types` — Stripe selects eligible
      // recurring-capable methods dynamically from currency, customer country,
      // and Dashboard settings. Hardcoding it suppresses methods that would
      // otherwise improve conversion (SEPA, Bacs, iDEAL, etc.).
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${appUrl}/account/billing?checkout=success`,
        cancel_url: `${appUrl}/pricing?checkout=cancel`,
        client_reference_id: user.id,
        subscription_data: { metadata: { userId: user.id } },
      });

      if (!session.url) {
        throw new Error('Stripe Checkout session created without a redirect URL');
      }

      return NextResponse.json({ url: session.url });
    } catch (error) {
      logger.warn('billing checkout failed:', error);
      return NextResponse.json(
        { error: 'checkout_failed', message: m.apiErrors.billingCheckoutFailed },
        { status: 500 }
      );
    }
  });
}
