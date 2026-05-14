import { getServerEnv } from '@/lib/env';

export type PlanId = 'free' | 'starter' | 'pro';
export type PaidPlanId = Exclude<PlanId, 'free'>;
export type Interval = 'month' | 'year';

export interface PlanDef {
  id: PlanId;
  /** Stable copy key, paired with i18n at the call site. */
  displayKey: string;
  /** Listed monthly price in USD (display only). Undefined for Free. */
  monthlyUsd?: number;
  /** Listed yearly price in USD (display only). Undefined for Free. */
  yearlyUsd?: number;
  /** Successful `POST /api/detect/scans` calls allowed per billing period. */
  scanQuota: number;
  /** Hard cap on retained DetectScan rows per user. */
  retainCap: number;
  /** Feature i18n keys, rendered as bullets on the pricing card. */
  features: string[];
}

export const PLAN_DEFS: Record<PlanId, PlanDef> = {
  free: {
    id: 'free',
    displayKey: 'free',
    scanQuota: 3,
    retainCap: 20,
    features: ['savesPerCycle', 'retainHistory'],
  },
  starter: {
    id: 'starter',
    displayKey: 'starter',
    monthlyUsd: 9.9,
    yearlyUsd: 95,
    scanQuota: 10,
    retainCap: 100,
    features: ['savesPerCycle', 'retainHistory', 'analytics', 'apiAccess'],
  },
  pro: {
    id: 'pro',
    displayKey: 'pro',
    monthlyUsd: 99,
    yearlyUsd: 950,
    scanQuota: 200,
    retainCap: 500,
    features: ['savesPerCycle', 'retainHistory', 'analytics', 'apiAccess', 'prioritySupport'],
  },
};

/** Order plans are listed in pricing UI. */
export const PLAN_ORDER: PlanId[] = ['free', 'starter', 'pro'];

/**
 * Resolve a Stripe Price ID to the matching plan + interval. Returns null when
 * the price isn't one we know about (e.g. test prices, legacy SKUs).
 */
export function getPlanByPriceId(priceId: string): { plan: PaidPlanId; interval: Interval } | null {
  if (!priceId) return null;
  const env = getServerEnv();
  if (priceId === env.STRIPE_PRICE_STARTER_MONTHLY) return { plan: 'starter', interval: 'month' };
  if (priceId === env.STRIPE_PRICE_STARTER_YEARLY) return { plan: 'starter', interval: 'year' };
  if (priceId === env.STRIPE_PRICE_PRO_MONTHLY) return { plan: 'pro', interval: 'month' };
  if (priceId === env.STRIPE_PRICE_PRO_YEARLY) return { plan: 'pro', interval: 'year' };
  return null;
}

/**
 * Look up the Stripe Price ID for a (paid plan, interval) pair. Returns undefined
 * when the corresponding env var isn't configured — callers should treat that
 * combination as unavailable and hide it from the UI.
 */
export function priceIdFor(plan: PaidPlanId, interval: Interval): string | undefined {
  const env = getServerEnv();
  if (plan === 'starter') {
    return interval === 'month'
      ? env.STRIPE_PRICE_STARTER_MONTHLY
      : env.STRIPE_PRICE_STARTER_YEARLY;
  }
  return interval === 'month' ? env.STRIPE_PRICE_PRO_MONTHLY : env.STRIPE_PRICE_PRO_YEARLY;
}

/**
 * Map a Stripe price recurring.interval to our narrowed type. Stripe also has
 * `week` / `day` which we never use — fold them to `month` defensively.
 */
export function normalizeInterval(stripeInterval: string | null | undefined): Interval {
  return stripeInterval === 'year' ? 'year' : 'month';
}
