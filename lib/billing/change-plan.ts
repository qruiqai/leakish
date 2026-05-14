import type Stripe from 'stripe';

import { logger } from '@/lib/logger';
import { getStripe } from '@/lib/server/stripe';

import { getPlanByPriceId, priceIdFor, type Interval, type PaidPlanId } from './plans';
import { syncSubscription } from './sync';

const TIER: Record<string, number> = { free: 0, starter: 1, pro: 2 };

export type ChangeMode = 'upgrade-immediate' | 'downgrade-scheduled' | 'noop';

export interface ChangeRequest {
  currentPlan: PaidPlanId;
  currentInterval: Interval;
  targetPlan: PaidPlanId;
  targetInterval: Interval;
}

export interface ChangeResult {
  mode: ChangeMode;
  /** Set only when `mode === 'downgrade-scheduled'`. */
  effectiveAt?: Date;
}

/**
 * Decide whether a (plan, interval) move is an upgrade or a downgrade.
 *
 * Rules:
 *   - Different plan tier (starter ↔ pro) → compare tier rank.
 *   - Same plan, same interval → noop.
 *   - Same plan, monthly → yearly = upgrade (longer commitment, charge today's
 *     unused portion, lock in the yearly price).
 *   - Same plan, yearly → monthly = downgrade (release the yearly commitment
 *     at the period boundary).
 */
export function classify(req: ChangeRequest): ChangeMode {
  const curTier = TIER[req.currentPlan];
  const newTier = TIER[req.targetPlan];
  if (curTier !== newTier) return newTier > curTier ? 'upgrade-immediate' : 'downgrade-scheduled';
  if (req.currentInterval === req.targetInterval) return 'noop';
  return req.targetInterval === 'year' ? 'upgrade-immediate' : 'downgrade-scheduled';
}

function scheduleIdOf(sub: Stripe.Subscription): string | null {
  if (!sub.schedule) return null;
  return typeof sub.schedule === 'string' ? sub.schedule : sub.schedule.id;
}

/**
 * Apply a plan change against Stripe. The local Subscription row is NOT
 * mutated here — that happens via the `customer.subscription.updated` webhook
 * Stripe fires (both for immediate changes and when a scheduled phase
 * transitions at period end).
 *
 * - Upgrade: `subscriptions.update` with `proration_behavior: 'always_invoice'`
 *   so the prorated delta gets billed to the saved payment method now.
 *   Any pending downgrade schedule is released first.
 * - Downgrade: wraps the subscription in a SubscriptionSchedule with two
 *   phases (current plan through period end, then new plan). The user keeps
 *   their paid features for the rest of the current cycle.
 */
export async function applyChange(opts: {
  /**
   * The local User id — needed so we can sync the upgraded subscription back
   * into the `Subscription` row synchronously and dodge the webhook race.
   */
  userId: string;
  stripeSubscriptionId: string;
  currentPlan: PaidPlanId;
  currentInterval: Interval;
  targetPlan: PaidPlanId;
  targetInterval: Interval;
}): Promise<ChangeResult> {
  const mode = classify(opts);
  if (mode === 'noop') return { mode };

  const newPriceId = priceIdFor(opts.targetPlan, opts.targetInterval);
  if (!newPriceId) {
    throw new Error(`No price configured for ${opts.targetPlan}/${opts.targetInterval}`);
  }

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(opts.stripeSubscriptionId);
  const item = sub.items.data[0];
  if (!item) throw new Error(`subscription ${sub.id} has no items`);

  if (mode === 'upgrade-immediate') {
    // If a pending downgrade schedule exists, drop it so the upgrade applies
    // cleanly. If release fails (race / already released), continue anyway.
    const scheduleId = scheduleIdOf(sub);
    if (scheduleId) {
      await stripe.subscriptionSchedules.release(scheduleId).catch(err =>
        logger.warn(`release pending schedule ${scheduleId} failed:`, err)
      );
    }

    const updated = await stripe.subscriptions.update(opts.stripeSubscriptionId, {
      items: [{ id: item.id, price: newPriceId }],
      proration_behavior: 'always_invoice',
    });

    // The `customer.subscription.updated` webhook will land for this change
    // too, but it's racy with the client's `router.refresh()` — if the user
    // hits /account/billing before the webhook is processed, they'd see the
    // old plan. Sync inline so the SSR right after this request returns
    // already-updated data. syncSubscription is idempotent, so the webhook
    // arriving later is a no-op (same period start → no usage reset).
    await syncSubscription(updated.id, opts.userId, updated).catch(err =>
      logger.warn(`inline sync after upgrade failed for ${updated.id}:`, err)
    );

    return { mode };
  }

  // mode === 'downgrade-scheduled'
  // Wrap the subscription in a schedule (or reuse an existing one) and define
  // two phases: stay-on-current until period end, then switch to new price.
  let scheduleId = scheduleIdOf(sub);
  if (!scheduleId) {
    const created = await stripe.subscriptionSchedules.create({
      from_subscription: opts.stripeSubscriptionId,
    });
    scheduleId = created.id;
  }

  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const phase0 = schedule.phases[0];
  if (!phase0) throw new Error(`schedule ${scheduleId} has no phases`);

  const periodEnd = item.current_period_end;

  await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: 'release',
    phases: [
      {
        // Phase 1: current price, runs through the rest of the paid period.
        items: [{ price: item.price.id, quantity: 1 }],
        start_date: phase0.start_date,
        end_date: periodEnd,
      },
      {
        // Phase 2: new (downgraded) price, runs for one billing cycle of the
        // target interval, then `end_behavior: 'release'` lets the subscription
        // continue naturally on this price.
        items: [{ price: newPriceId, quantity: 1 }],
        duration: { interval: opts.targetInterval, interval_count: 1 },
      },
    ],
  });

  return { mode, effectiveAt: new Date(periodEnd * 1000) };
}

/**
 * Release the subscription's pending schedule, if any. The subscription
 * continues unchanged on its current price. Returns true if a schedule was
 * released, false if nothing was pending.
 */
export async function cancelPendingChange(stripeSubscriptionId: string): Promise<boolean> {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const scheduleId = scheduleIdOf(sub);
  if (!scheduleId) return false;
  await stripe.subscriptionSchedules.release(scheduleId);
  return true;
}

export interface PendingChange {
  effectiveAt: Date;
  plan: PaidPlanId;
  interval: Interval;
}

/**
 * Inspect the subscription's schedule (if any) and surface the next phase as
 * a `{ effectiveAt, plan, interval }` triple suited for UI banners.
 * Returns null when no schedule exists or its next phase isn't one of our
 * known prices.
 */
export async function getPendingChange(stripeSubscriptionId: string): Promise<PendingChange | null> {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const scheduleId = scheduleIdOf(sub);
  if (!scheduleId) return null;

  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const nowSec = Math.floor(Date.now() / 1000);
  const upcoming = schedule.phases.find(p => p.start_date > nowSec);
  if (!upcoming || upcoming.items.length === 0) return null;

  const priceRef = upcoming.items[0].price;
  const priceId = typeof priceRef === 'string' ? priceRef : priceRef.id;
  // getPlanByPriceId returns null for unknown / unconfigured prices; its
  // success type already excludes Free, so plan is always 'starter' | 'pro'.
  const info = getPlanByPriceId(priceId);
  if (!info) return null;

  return {
    effectiveAt: new Date(upcoming.start_date * 1000),
    plan: info.plan,
    interval: info.interval,
  };
}
