import { logger } from '@/lib/logger';
import type { DetectionModule, DetectionResult } from './types';

/**
 * Server-side complement to the WebRTC module.
 *
 * Whereas WebRTC tells us "what STUN sees about us", this module tells us "what
 * the *server* (and Cloudflare) actually sees on the TCP/TLS layer". Comparing
 * the two surfaces split-tunnel VPN leaks (HTTPS goes through VPN, WebRTC bypasses).
 */

export interface NetworkProbeData {
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

  /// Convenience — the JS-visible UA, captured so the result panel can show
  /// both side-by-side without an extra round trip.
  clientUserAgent: string | null;
  /// The browser's resolved IANA timezone (Asia/Shanghai etc.) — used by the
  /// risk model to detect TZ-vs-IP-region mismatch (a strong VPN signal).
  clientTimezone: string | null;
}

const NETWORK_PROBE_TIMEOUT_MS = 8000;

async function fetchProbe(): Promise<NetworkProbeData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_PROBE_TIMEOUT_MS);

  try {
    const res = await fetch('/api/detect/network', {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!res.ok) {
      // English-only fallback — surfaces in the module's `result.error` if the
      // server is unreachable. The user-facing layer (result-details panels)
      // catches and renders this verbatim. Most 401s actually surface via the
      // API route's localized `unauthorizedSession` message; this is for
      // network-layer / non-JSON failures.
      const message =
        res.status === 401
          ? 'Sign in to run the network egress check'
          : `Server responded with ${res.status}`;
      throw new Error(message);
    }

    const server = (await res.json()) as Omit<
      NetworkProbeData,
      'clientUserAgent' | 'clientTimezone'
    >;

    return {
      ...server,
      clientUserAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      clientTimezone:
        typeof Intl !== 'undefined'
          ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? null)
          : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const networkProbeModule: DetectionModule<NetworkProbeData> = {
  id: 'network-probe',
  name: 'Network egress check',
  description: 'Server-side probe of real egress IP, geo location, ASN, and TLS fingerprint',
  category: 'network',
  icon: 'Globe',
  enabled: true,
  detect: async (): Promise<DetectionResult<NetworkProbeData>> => {
    try {
      const data = await fetchProbe();
      return {
        success: true,
        data,
        detectedAt: new Date(),
        metadata: {
          hasGeo: !!(data.country || data.city),
          hasTls: !!(data.tlsJa3 || data.tlsJa4),
          hasVpnSignal: data.isVpn === true || data.isProxy === true || data.isTor === true,
        },
      };
    } catch (error) {
      logger.warn('Network probe failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network probe failed',
        detectedAt: new Date(),
      };
    }
  },
};
