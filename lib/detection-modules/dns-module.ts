import { logger } from '@/lib/logger';
import { DOH_RESOLVE_ENDPOINT } from './constants';
import type { DetectionModule, DetectionResult } from './types';

interface WindowWithDns extends Window {
  dns?: {
    resolve: (hostname: string) => Promise<unknown>;
  };
}

export interface DNSData {
  resolvers: string[];
  dohSupport: boolean;
  dnsLeakDetected: boolean;
  publicResolvers: {
    google: { ipv4: string[]; ipv6: string[] };
    cloudflare: { ipv4: string[]; ipv6: string[] };
    quad9: { ipv4: string[]; ipv6: string[] };
  };
  resolverLocation: string | null;
  responseTime: number;
  dnssecSupport: boolean;
  customDns: boolean;
}

type ProviderKey = keyof DNSData['publicResolvers'];

const DNS_PROVIDERS: ReadonlyArray<{ name: ProviderKey; servers: readonly string[] }> = [
  {
    name: 'google',
    servers: ['8.8.8.8', '8.8.4.4', '2001:4860:4860::8888', '2001:4860:4860::8844'],
  },
  {
    name: 'cloudflare',
    servers: ['1.1.1.1', '1.0.0.1', '2606:4700:4700::1111', '2606:4700:4700::1001'],
  },
  {
    name: 'quad9',
    servers: ['9.9.9.9', '149.112.112.112', '2620:fe::fe', '2620:fe::9'],
  },
];

async function detectDNSInfo(): Promise<DNSData> {
  const result: DNSData = {
    resolvers: [],
    dohSupport: false,
    dnsLeakDetected: false,
    publicResolvers: {
      google: { ipv4: [], ipv6: [] },
      cloudflare: { ipv4: [], ipv6: [] },
      quad9: { ipv4: [], ipv6: [] },
    },
    resolverLocation: null,
    responseTime: 0,
    dnssecSupport: false,
    customDns: false,
  };

  const startTime = performance.now();

  try {
    const windowWithDns = window as WindowWithDns;
    if (windowWithDns.dns && 'resolve' in windowWithDns.dns) {
      result.dohSupport = true;
    }
  } catch {
    // DoH not supported
  }

  // Probe each provider via a shared DoH endpoint. The server list is static
  // (well-known public IPs) so availability is a soft heuristic, not authoritative.
  const probes = DNS_PROVIDERS.map(async ({ name, servers }) => {
    const ipv4Servers = servers.filter(s => !s.includes(':'));
    const ipv6Servers = servers.filter(s => s.includes(':'));

    let reachable = false;
    try {
      const response = await fetch(`${DOH_RESOLVE_ENDPOINT}?name=example.com&type=A`, {
        method: 'GET',
        mode: 'cors',
      });
      reachable = response.ok;
    } catch (error) {
      logger.debug(`DNS probe failed for ${name}:`, error);
    }

    if (reachable) {
      result.publicResolvers[name].ipv4.push(...ipv4Servers);
      result.publicResolvers[name].ipv6.push(...ipv6Servers);
    }
  });

  await Promise.allSettled(probes);

  try {
    const response = await fetch(`${DOH_RESOLVE_ENDPOINT}?name=whoami.akamai.net&type=A`);
    if (response.ok) {
      const data = (await response.json()) as { Answer?: { data?: string }[] };
      if (data.Answer && data.Answer.length > 0 && data.Answer[0].data) {
        result.resolverLocation = data.Answer[0].data;
      }
    }
  } catch (error) {
    logger.debug('DNS resolver location probe failed:', error);
  }

  try {
    const response = await fetch(`${DOH_RESOLVE_ENDPOINT}?name=dnssec-test.org&type=A&do=1`);
    if (response.ok) {
      const data = (await response.json()) as { AD?: boolean };
      result.dnssecSupport = data.AD === true;
    }
  } catch (error) {
    logger.debug('DNSSEC probe failed:', error);
  }

  result.responseTime = performance.now() - startTime;

  const availableResolvers = Object.values(result.publicResolvers).flatMap(r => [
    ...r.ipv4,
    ...r.ipv6,
  ]);
  result.customDns = availableResolvers.length === 0;

  // NOTE: We deliberately do NOT set `dnsLeakDetected` from a JS heuristic.
  // Truly detecting whether the user's DNS queries leak requires owning an
  // authoritative DNS server (the way dnsleaktest.com works). Without that,
  // any "leak detected" claim from pure client JS is fabricated.
  // The risk-assessment layer reflects this honestly.
  result.dnsLeakDetected = false;

  return result;
}

export const dnsModule: DetectionModule<DNSData> = {
  id: 'dns',
  name: 'DNS check',
  description: 'DoH reachability, DNSSEC, resolver location, and leak heuristics',
  category: 'network',
  icon: 'Globe',
  enabled: true,

  async detect(): Promise<DetectionResult<DNSData>> {
    try {
      const data = await detectDNSInfo();
      return {
        success: true,
        data,
        detectedAt: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'DNS detection failed',
        detectedAt: new Date(),
      };
    }
  },
};
