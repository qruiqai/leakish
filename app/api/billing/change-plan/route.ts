import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { withDetectAuth } from '@/lib/api/auth';
import { applyChange, cancelPendingChange } from '@/lib/billing/change-plan';
import { PAID_STATUSES } from '@/lib/billing/entitlement';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  plan: z.enum(['starter', 'pro']),
  interval: z.enum(['month', 'year']),
});

/**
 * Mutate an existing subscription's plan.
 *
 * - Upgrade → immediate, charges the prorated delta now via
 *   `subscriptions.update + proration_behavior: 'always_invoice'`.
 * - Downgrade → wraps the subscription in a SubscriptionSchedule so the
 *   change applies at `current_period_end`. The user keeps their paid
 *   features for the rest of the cycle.
 *
 * The local Subscription row is updated by the `customer.subscription.updated`
 * webhook Stripe fires — both for immediate upgrades and when a scheduled
 * downgrade phase advances at period end.
 */
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
    const { plan: targetPlan, interval: targetInterval } = parsed.data;

    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    if (!sub || !PAID_STATUSES.has(sub.status)) {
      return NextResponse.json(
        { error: 'not_subscribed', message: m.apiErrors.billingNotSubscribed },
        { status: 400 }
      );
    }

    try {
      const result = await applyChange({
        userId: user.id,
        stripeSubscriptionId: sub.stripeSubscriptionId,
        currentPlan: sub.plan === 'pro' ? 'pro' : 'starter',
        currentInterval: sub.interval === 'year' ? 'year' : 'month',
        targetPlan,
        targetInterval,
      });
      return NextResponse.json({
        mode: result.mode,
        effectiveAt: result.effectiveAt?.toISOString() ?? null,
      });
    } catch (err) {
      logger.warn('billing change-plan failed:', err);
      return NextResponse.json(
        { error: 'change_failed', message: m.apiErrors.billingChangeFailed },
        { status: 500 }
      );
    }
  });
}

/**
 * Cancel a pending downgrade (releases the SubscriptionSchedule wrapping
 * the user's current sub). Idempotent — returns `{ released: false }` if no
 * change was pending.
 */
export async function DELETE(req: NextRequest) {
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

    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    if (!sub || !PAID_STATUSES.has(sub.status)) {
      return NextResponse.json(
        { error: 'not_subscribed', message: m.apiErrors.billingNotSubscribed },
        { status: 400 }
      );
    }

    try {
      const released = await cancelPendingChange(sub.stripeSubscriptionId);
      return NextResponse.json({ released });
    } catch (err) {
      logger.warn('billing cancel pending change failed:', err);
      return NextResponse.json(
        { error: 'change_failed', message: m.apiErrors.billingChangeFailed },
        { status: 500 }
      );
    }
  });
}
