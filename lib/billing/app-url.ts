import { getServerEnv } from '@/lib/env';

/**
 * Pick a base URL to anchor Stripe success/cancel redirects to. We prefer the
 * explicit `NEXT_PUBLIC_APP_URL` but fall back to `NEXTAUTH_URL` (already set
 * in every environment) so we don't require a brand new secret.
 *
 * Returns null when nothing is configured — call sites should refuse to
 * generate links in that case rather than silently redirect to localhost.
 */
export function getAppUrl(): string | null {
  const env = getServerEnv();
  const url = env.NEXT_PUBLIC_APP_URL ?? env.NEXTAUTH_URL ?? null;
  return url ? url.replace(/\/+$/, '') : null;
}
