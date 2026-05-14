/**
 * CLI entrypoint for the subscription reconcile cron.
 *
 * Deployment: shipped in the same container image as the Next.js server; a
 * separate k8s CronJob (see `k8s/dev/cron-reconcile-subscriptions.yaml`) runs
 * `yarn reconcile-subscriptions` on a schedule.
 *
 * Local / ops one-off: `yarn reconcile-subscriptions` with a populated
 * `.env.local`.
 */
import prisma from '@/lib/prisma';
import { reconcileExpiredSubscriptions } from '@/lib/billing/reconcile';
import { logger } from '@/lib/logger';

async function main(): Promise<number> {
  const startedAt = Date.now();
  const limitRaw = process.env.RECONCILE_LIMIT;
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  try {
    const summary = await reconcileExpiredSubscriptions(
      limit && Number.isFinite(limit) && limit > 0 ? { limit } : {}
    );
    const elapsedMs = Date.now() - startedAt;
    // One structured line for easy `kubectl logs ... | jq` filtering.
    console.log(
      JSON.stringify({
        job: 'reconcile-subscriptions',
        elapsedMs,
        ...summary,
      })
    );
    return 0;
  } catch (err) {
    logger.warn('reconcile-subscriptions crashed:', err);
    return 1;
  }
}

main()
  .then(code => prisma.$disconnect().finally(() => process.exit(code)))
  .catch(err => {
    logger.warn('reconcile-subscriptions top-level error:', err);
    prisma.$disconnect().finally(() => process.exit(1));
  });
