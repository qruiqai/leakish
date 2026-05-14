const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
export const IPV4_EXTRACT_REGEX = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g;

function isValidIPv4(ip: string): boolean {
  if (!IPV4_REGEX.test(ip)) return false;
  const parts = ip.split('.').map(Number);
  return parts.every(p => p >= 0 && p <= 255);
}

export function isPrivateIP(ip: string): boolean {
  if (!isValidIPv4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

// RFC 6598 Carrier-Grade NAT space — not directly routable on the public Internet,
// should not be reported as a public leak.
export function isCGNAT(ip: string): boolean {
  if (!isValidIPv4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

// 224.0.0.0/4 multicast + 240.0.0.0/4 reserved/broadcast.
export function isReservedIPv4(ip: string): boolean {
  if (!isValidIPv4(ip)) return false;
  const [a] = ip.split('.').map(Number);
  return a >= 224;
}

export function isPublicIP(ip: string): boolean {
  return isValidIPv4(ip) && !isPrivateIP(ip) && !isCGNAT(ip) && !isReservedIPv4(ip);
}

export type IPClass = 'local' | 'public' | 'reserved' | 'invalid';

export function classifyIP(ip: string): IPClass {
  if (!isValidIPv4(ip)) return 'invalid';
  if (isPrivateIP(ip) || isCGNAT(ip)) return 'local';
  if (isReservedIPv4(ip)) return 'reserved';
  return 'public';
}

export function extractMDNSHost(candidate: string): string | null {
  const match = candidate.match(/([a-f0-9-]+\.local)/i);
  return match ? match[1] : null;
}

export function isValidIPv6(input: string): boolean {
  if (!input) return false;
  const ip = input.split('%')[0];
  if (!ip.includes(':')) return false;

  const doubleColonMatches = ip.match(/::/g);
  if (doubleColonMatches && doubleColonMatches.length > 1) return false;
  const hasDouble = !!doubleColonMatches;

  let hexPart = ip;
  let embeddedV4Groups = 0;
  const lastColon = ip.lastIndexOf(':');
  const tail = ip.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!isValidIPv4(tail)) return false;
    hexPart = ip.slice(0, lastColon);
    embeddedV4Groups = 2;
  }

  const parts = hexPart.split(':');
  let nonEmpty = 0;
  for (const p of parts) {
    if (p === '') continue;
    if (!/^[0-9a-f]{1,4}$/i.test(p)) return false;
    nonEmpty++;
  }

  const total = nonEmpty + embeddedV4Groups;
  if (hasDouble) return total <= 7;
  return total === 8 && parts.every(p => p !== '');
}

export type IPv6Scope =
  | 'global'
  | 'link-local'
  | 'ula'
  | 'loopback'
  | 'unspecified'
  | 'multicast'
  | 'documentation'
  | 'invalid';

export function classifyIPv6(input: string): IPv6Scope {
  if (!isValidIPv6(input)) return 'invalid';
  const lower = input.toLowerCase().split('%')[0];
  if (lower === '::') return 'unspecified';
  if (lower === '::1') return 'loopback';

  const groups = lower.split(':');
  const firstGroup = groups.find(g => g !== '') ?? '';
  if (/^fe[89ab]/.test(firstGroup)) return 'link-local';
  if (/^f[cd]/.test(firstGroup)) return 'ula';
  if (/^ff/.test(firstGroup)) return 'multicast';
  if (firstGroup === '2001' && groups[1] === 'db8') return 'documentation';
  return 'global';
}

// Parse an ICE candidate line and return any IPv6 addresses it contains,
// with scope classification. Whitespace-tokenised to avoid matching SDP junk.
export function extractIPv6FromCandidate(
  candidate: string
): Array<{ address: string; scope: IPv6Scope }> {
  const out: Array<{ address: string; scope: IPv6Scope }> = [];
  for (const token of candidate.split(/\s+/)) {
    if (!token.includes(':')) continue;
    if (!isValidIPv6(token)) continue;
    const address = token.toLowerCase();
    out.push({ address, scope: classifyIPv6(address) });
  }
  return out;
}
