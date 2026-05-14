import type { NextRequest } from 'next/server';

import { getServerEnv } from '@/lib/env';

/**
 * Server-observed network/HTTP fingerprint for the current request.
 *
 * Source priority for each field:
 *   IP        : cf-connecting-ip > x-forwarded-for[0] > x-real-ip
 *   geo       : cf-ipcountry / cf-ipcity (Cloudflare) > ipinfo.io > null
 *   asn       : cf-asn / cf-iata (Cloudflare Enterprise) > ipinfo.io > null
 *   isVpn     : ipinfo.io 'privacy.vpn' / 'privacy.proxy' > null
 *   tls (ja3/ja4) : cf-ja3-hash / cf-ja4 (Cloudflare Bot Management) > null
 *
 * Everything degrades gracefully — missing fields stay null. Network calls have a
 * short timeout so a slow ipinfo.io can't stall the whole request.
 */

export interface NetworkProbe {
  ip: string | null;
  ipFamily: 'ipv4' | 'ipv6' | null;
  country: string | null;
  region: string | null;
  city: string | null;
  asn: string | null;
  asOrg: string | null;
  isVpn: boolean | null;
  isProxy: boolean | null;
  isTor: boolean | null;
  isHosting: boolean | null;
  tlsJa3: string | null;
  tlsJa4: string | null;
  serverUserAgent: string | null;
  acceptLanguage: string | null;
  acceptEncoding: string | null;
}

const PRIVATE_RX = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fe80:|fc00:|fd00:)/i;

/**
 * Exported so api-key-login and any other admission endpoint can key its
 * per-IP rate limiter on the same value this module uses.
 *
 * When `TRUSTED_IP_HEADER` is configured (production), that header is the
 * ONLY source of truth — X-Forwarded-For from an attacker cannot spoof an IP.
 * Without it, we fall back to the cf > xff > xri cascade (dev convenience).
 */
export function readClientIp(req: NextRequest): string | null {
  const { TRUSTED_IP_HEADER } = getServerEnv();
  if (TRUSTED_IP_HEADER) {
    const v = req.headers.get(TRUSTED_IP_HEADER);
    return v ? v.trim() : null;
  }

  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return null;
}

function ipFamilyOf(ip: string | null): 'ipv4' | 'ipv6' | null {
  if (!ip) return null;
  return ip.includes(':') ? 'ipv6' : 'ipv4';
}

interface IpInfoResponse {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  org?: string;
  asn?: { asn?: string; name?: string };
  privacy?: { vpn?: boolean; proxy?: boolean; tor?: boolean; hosting?: boolean };
}

/**
 * In-process ipinfo.io cache.
 *
 * We can't use Next's fetch-data-cache here — the route handlers that call
 * this function declare `export const dynamic = 'force-dynamic'`, which
 * silently disables the `next: { revalidate }` hint. A Map keyed by IP with
 * a TTL keeps us from re-billing ipinfo (and re-waiting 2.5 s) on every
 * scan-save for the same client within the window.
 *
 * Negative results are cached too so a bad IP can't loop us through the
 * network timeout path on every request.
 *
 * Scope: per-pod, best-effort. Same constraints as rate-limit.ts.
 */
interface IpinfoCacheEntry {
  value: IpInfoResponse | null;
  expiresAt: number;
}
const ipinfoCache = new Map<string, IpinfoCacheEntry>();
const IPINFO_TTL_MS = 15 * 60 * 1000;
/** Cap the Map so a flood of distinct bad IPs can't balloon memory. */
const IPINFO_CACHE_MAX = 10_000;

async function lookupIpinfo(ip: string, token: string): Promise<IpInfoResponse | null> {
  const now = Date.now();
  const cached = ipinfoCache.get(ip);
  if (cached && cached.expiresAt > now) return cached.value;

  let value: IpInfoResponse | null = null;
  try {
    // Token in Authorization header, not query string — keeps it out of
    // server access logs and proxy/CDN logs. (RFC 6750 §2.3.)
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      // Don't let a slow vendor lookup stall the request.
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) value = (await res.json()) as IpInfoResponse;
  } catch {
    // value stays null — negative-caching path below.
  }

  if (ipinfoCache.size >= IPINFO_CACHE_MAX) {
    // Cheap eviction — drop the first inserted entry. Ordered by insertion
    // in ES2015+ Maps, so this is effectively "oldest first".
    const firstKey = ipinfoCache.keys().next().value;
    if (firstKey !== undefined) ipinfoCache.delete(firstKey);
  }
  ipinfoCache.set(ip, { value, expiresAt: now + IPINFO_TTL_MS });
  return value;
}

export async function probeNetwork(req: NextRequest): Promise<NetworkProbe> {
  const env = getServerEnv();
  const ip = readClientIp(req);
  const isPrivate = ip ? PRIVATE_RX.test(ip) : true;

  // Cloudflare-provided geo headers (free tier exposes country & a few extras
  // through Workers / "Transform Rules"; we treat them as best-effort).
  const cfCountry = req.headers.get('cf-ipcountry');
  const cfCity = req.headers.get('cf-ipcity');
  const cfRegion = req.headers.get('cf-region');
  const cfAsn = req.headers.get('cf-asn');
  const cfTlsJa3 = req.headers.get('cf-ja3-hash');
  const cfTlsJa4 = req.headers.get('cf-ja4');

  const probe: NetworkProbe = {
    ip,
    ipFamily: ipFamilyOf(ip),
    country: cfCountry ?? null,
    region: cfRegion ?? null,
    city: cfCity ?? null,
    asn: cfAsn ?? null,
    asOrg: null,
    isVpn: null,
    isProxy: null,
    isTor: null,
    isHosting: null,
    tlsJa3: cfTlsJa3 ?? null,
    tlsJa4: cfTlsJa4 ?? null,
    serverUserAgent: req.headers.get('user-agent'),
    acceptLanguage: req.headers.get('accept-language'),
    acceptEncoding: req.headers.get('accept-encoding'),
  };

  // Skip the upstream lookup when we don't have a real IP or it's a private one.
  if (!isPrivate && ip && env.IPINFO_TOKEN) {
    const info = await lookupIpinfo(ip, env.IPINFO_TOKEN);
    if (info) {
      probe.country ??= info.country ?? null;
      probe.region ??= info.region ?? null;
      probe.city ??= info.city ?? null;
      probe.asn ??= info.asn?.asn ?? extractAsnFromOrg(info.org) ?? null;
      probe.asOrg = info.asn?.name ?? info.org ?? null;
      probe.isVpn = info.privacy?.vpn ?? null;
      probe.isProxy = info.privacy?.proxy ?? null;
      probe.isTor = info.privacy?.tor ?? null;
      probe.isHosting = info.privacy?.hosting ?? null;
    }
  }

  return probe;
}

/** ipinfo's free tier returns "AS15169 Google LLC" in `org` instead of structured ASN. */
function extractAsnFromOrg(org: string | undefined): string | null {
  if (!org) return null;
  const m = /^(AS\d+)\b/.exec(org);
  return m ? m[1] : null;
}
