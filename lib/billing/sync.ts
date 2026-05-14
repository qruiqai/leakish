import type Stripe from 'stripe';

import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { getStripe } from '@/lib/server/stripe';

import { getPlanByPriceId, normalizeInterval } from './plans';

/**
 * Resolve a Stripe subscription back to our local User row. Prefer the
 * `metadata.userId` we wrote at checkout creation; fall back to looking the
 * stripeCustomerId up on User. This covers the case where the webhook
 * arrives before our checkout-time DB write commits.
 */
export async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const metaUserId = sub.metadata?.userId;
  if (metaUserId) {
    const exists = await prisma.user.findUnique({
      where: { id: metaUserId },
      select: { id: true },
    });
    if (exists) return exists.id;
  }
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const byCustomer = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return byCustomer?.id ?? null;
}

/**
 * Upsert a local Subscription row from a Stripe Subscription object, resetting
 * `usageScansThisPeriod` only when `currentPeriodStart` actually advances.
 *
 * Shared between the webhook (event-driven) and the reconcile cron (poll-driven
 * catch-up). Both paths share the same idempotent semantics:
 * - Same period start → no usage reset (cancel toggle / status flip safe).
 * - New period start → exactly one reset, no matter how many calls arrive.
 */
export async function syncSubscription(
  stripeSubscriptionId: string,
  userId: string,
  preloaded?: Stripe.Subscription
): Promise<void> {
  const sub = preloaded ?? (await getStripe().subscriptions.retrieve(stripeSubscriptionId));
  const item = sub.items.data[0];
  if (!item) {
    logger.warn(`subscription ${sub.id} has no items, skipping sync`);
    return;
  }
  const priceId = item.price.id;
  const planInfo = getPlanByPriceId(priceId);
  if (!planInfo) {
    logger.warn(`subscription ${sub.id} references unknown priceId ${priceId}`);
    return;
  }
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  // current_period_* moved to SubscriptionItem in the 2026-04-22.dahlia API
  // (each item has its own billing cycle). With our single-item subscriptions
  // they're all in lockstep, so reading off `item` is correct.
  const newPeriodStart = new Date(item.current_period_start * 1000);
  const newPeriodEnd = new Date(item.current_period_end * 1000);

  const existing = await prisma.subscription.findUnique({
    where: { userId },
    select: { currentPeriodStart: true },
  });

  // Only reset the usage counter when the billing period actually moves
  // forward. A `customer.subscription.updated` for unrelated changes
  // (cancel_at_period_end toggle, status flip) must not zero usage out.
  const periodAdvanced =
    !existing || existing.currentPeriodStart.getTime() !== newPeriodStart.getTime();

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      plan: planInfo.plan,
      interval: normalizeInterval(item.price.recurring?.interval ?? null),
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodStart: newPeriodStart,
      currentPeriodEnd: newPeriodEnd,
      usageScansThisPeriod: 0,
    },
    update: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      plan: planInfo.plan,
      interval: normalizeInterval(item.price.recurring?.interval ?? null),
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodStart: newPeriodStart,
      currentPeriodEnd: newPeriodEnd,
      ...(periodAdvanced ? { usageScansThisPeriod: 0 } : {}),
    },
  });
}
