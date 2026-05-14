import { createHash } from 'node:crypto';

import { getServerEnv } from '@/lib/env';

/**
 * Privacy-preserving IP hash. Uses a server-side salt so the hash cannot be
 * reverse-engineered from a known-IP rainbow table. Salt is stable per env so
 * we can still count unique IPs across sessions.
 */
export function hashIp(ip: string): string {
  const { IP_HASH_SALT } = getServerEnv();
  return createHash('sha256').update(`${IP_HASH_SALT}::${ip}`).digest('hex').slice(0, 32);
}

/**
 * Generic SHA-256 used for client-supplied fingerprints. Keeps lookups consistent
 * regardless of input length.
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
