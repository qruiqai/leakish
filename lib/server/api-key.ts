import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * API key shape:
 *   det_<64 hex chars>
 *
 * - `det_` prefix is grep-able in logs / heuristics.
 * - 32 random bytes = 256 bits of entropy → effectively unguessable.
 * - We store SHA-256 of the full token; the plaintext is shown to the user
 *   exactly once at creation.
 *
 * Why a custom key (not JWT)?
 *   - Revocable instantly (DB lookup) without a key-rotation dance.
 *   - No claims to inspect — the row IS the truth.
 *   - User can have multiple named keys ("macbook-cli", "ci-bot", …) for
 *     least-privilege rotation.
 */

const TOKEN_PREFIX = 'det_';
const RANDOM_BYTES = 32;

export interface NewApiKey {
  /** Plaintext token. Hand to the user, never store. */
  token: string;
  /** SHA-256 hex of the token. Goes in DB.hash. */
  hash: string;
  /** Display-safe prefix, e.g. "det_a1b2...e9f0". Goes in DB.prefix. */
  prefix: string;
}

export function generateApiKey(): NewApiKey {
  const random = randomBytes(RANDOM_BYTES).toString('hex');
  const token = `${TOKEN_PREFIX}${random}`;
  return {
    token,
    hash: hashApiKey(token),
    prefix: `${TOKEN_PREFIX}${random.slice(0, 4)}…${random.slice(-4)}`,
  };
}

export function hashApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Pulls a Bearer token out of an Authorization header. Accepts our own
 * `det_…` keys *only* — anything else is treated as "no API key supplied",
 * letting the caller fall back to session auth.
 */
export function extractApiKey(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (!auth) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  if (!m) return null;
  const token = m[1];
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  return token;
}

/**
 * Constant-time equality check on hash strings, just to be defensive against
 * timing-attack class issues even though our lookup is by indexed equality.
 */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
