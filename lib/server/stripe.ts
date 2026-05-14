import Stripe from 'stripe';

import { getServerEnv } from '@/lib/env';

let cached: Stripe | null = null;

/**
 * Lazy Stripe client. Throws (with a friendly message) at call sites that
 * require billing when `STRIPE_SECRET_KEY` is missing — unrelated routes are
 * unaffected because we never import this from non-billing code paths.
 */
export function getStripe(): Stripe {
  if (cached) return cached;

  const key = getServerEnv().STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not configured — set it in your environment to enable billing.'
    );
  }

  cached = new Stripe(key, {
    // Pinned: regenerate the SDK type when bumping this. Match what's tested
    // in the dashboard so webhook event shapes stay predictable.
    apiVersion: '2026-04-22.dahlia',
  });
  return cached;
}
