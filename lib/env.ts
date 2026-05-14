import { z } from 'zod';

/**
 * Server-side environment variables.
 * Validated lazily on first call so build steps that don't need the env can pass.
 *
 * Set SKIP_ENV_VALIDATION=1 during `next build` if you intentionally want
 * to defer validation to runtime.
 */
const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // NextAuth. 32 chars = the `openssl rand -base64 32` recommendation.
  // (Old deployments with 16-char secrets must rotate — see env.example.)
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 chars'),
  NEXTAUTH_URL: z.string().url().optional(),

  // Google OAuth (required because we only ship Google for now)
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),

  // Server-side IP-hash salt (used to anonymize stored client IPs)
  IP_HASH_SALT: z.string().min(16, 'IP_HASH_SALT must be at least 16 chars'),

  // Optional: ipinfo.io token for ASN / VPN detection. App degrades gracefully without it.
  IPINFO_TOKEN: z.string().optional(),

  // Which request header is trusted for client IP. Set to the edge proxy's
  // canonical client-IP header (e.g. 'cf-connecting-ip' for Cloudflare).
  // When set, all other IP headers are ignored — an attacker-supplied
  // X-Forwarded-For cannot spoof a client IP.
  // Unset in dev ⇒ falls back to the cf>xff>xri cascade in readClientIp.
  TRUSTED_IP_HEADER: z.string().optional(),

  // ---- Email login (magic link) ----
  // All optional. If MAILGUN_API_KEY + MAILGUN_DOMAIN + EMAIL_FROM are set, magic
  // links are sent via Mailgun. Otherwise:
  //   - dev: the link is logged to the server console (so local dev still works)
  //   - prod: requesting a magic link returns an error (we refuse to silently no-op)
  MAILGUN_API_KEY: z.string().optional(),
  MAILGUN_DOMAIN: z.string().optional(),
  /** Single header value, e.g. `"Leakish <noreply@leakish.com>"`. */
  EMAIL_FROM: z.string().optional(),
  /** Mailgun region: `us` (default) or `eu`. */
  MAILGUN_REGION: z.enum(['us', 'eu']).optional(),

  // ---- Stripe (subscriptions) ----
  // All optional at parse time so dev / unrelated routes don't break when unset.
  // Routes that need Stripe (checkout / portal / webhook) enforce presence at use site.
  // Missing Stripe price IDs cause the corresponding plan/interval to be hidden
  // from the pricing UI rather than throwing.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER_MONTHLY: z.string().optional(),
  STRIPE_PRICE_STARTER_YEARLY: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PRO_YEARLY: z.string().optional(),

  // Public base URL used to construct Stripe Checkout success/cancel URLs.
  // Falls back to NEXTAUTH_URL when unset.
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  if (process.env.SKIP_ENV_VALIDATION === '1' || process.env.SKIP_ENV_VALIDATION === 'true') {
    // Build-time bypass; cast through unknown so downstream call sites compile.
    cachedEnv = process.env as unknown as ServerEnv;
    return cachedEnv;
  }

  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
