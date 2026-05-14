import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { getStripe } from '@/lib/server/stripe';

import { PAID_STATUSES } from './entitlement';
import { syncSubscription } from './sync';

export interface ReconcileSummary {
  scanned: number;
  synced: number;
  deleted: number;
  errors: number;
  errorIds: string[];
}

interface ReconcileOptions {
  /** Cap on rows processed per run. Default 100. */
  limit?: number;
  /** Time anchor — exposed for tests. Defaults to `new Date()`. */
  now?: Date;
}

/**
 * Pull every Subscription whose billing period has expired according to our
 * local clock and re-sync it from Stripe. Backstop for missed
 * `customer.subscription.updated` / `invoice.payment_succeeded` webhooks: if
 * Stripe couldn't deliver the renewal event after its ~3 day retry window,
 * the user would otherwise stay locked at the old period's quota until they
 * triggered another webhook (e.g. by cancelling). This catches the gap.
 *
 * Narrow scope on purpose — we only look at rows whose `currentPeriodEnd` is
 * in the past AND whose `status` is still in `PAID_STATUSES`. Already-canceled
 * subs are someone else's problem (or the next webhook's).
 *
 * Failure mode is per-row: a Stripe 404 on one sub deletes that row and moves
 * on, a transient API error on another logs + counts but doesn't poison the
 * batch.
 */
export async function reconcileExpiredSubscriptions(
  opts: ReconcileOptions = {}
): Promise<ReconcileSummary> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 100;

  const overdue = await prisma.subscription.findMany({
    where: {
      currentPeriodEnd: { lte: now },
      status: { in: Array.from(PAID_STATUSES) },
    },
    select: { userId: true, stripeSubscriptionId: true },
    take: limit,
    orderBy: { currentPeriodEnd: 'asc' },
  });

  const summary: ReconcileSummary = {
    scanned: overdue.length,
    synced: 0,
    deleted: 0,
    errors: 0,
    errorIds: [],
  };

  for (const row of overdue) {
    try {
      const fresh = await getStripe().subscriptions.retrieve(row.stripeSubscriptionId);
      await syncSubscription(fresh.id, row.userId, fresh);
      summary.synced++;
    } catch (err) {
      if (isStripeNotFound(err)) {
        // Stripe has no record of this sub — it was deleted upstream and the
        // `customer.subscription.deleted` webhook never landed. Drop the row
        // so the user falls back to Free entitlement on the next request.
        await prisma.subscription
          .delete({ where: { userId: row.userId } })
          .catch(deleteErr =>
            logger.warn(
              `reconcile: failed to delete orphaned sub ${row.stripeSubscriptionId}:`,
              deleteErr
            )
          );
        summary.deleted++;
        continue;
      }
      summary.errors++;
      summary.errorIds.push(row.stripeSubscriptionId);
      logger.warn(`reconcile: sync failed for ${row.stripeSubscriptionId}:`, err);
    }
  }

  return summary;
}

/** Stripe SDK errors expose `.statusCode`; 404 means the resource is gone. */
function isStripeNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { statusCode?: number }).statusCode === 404;
}
