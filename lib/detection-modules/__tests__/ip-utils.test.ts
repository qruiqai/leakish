import {
  classifyIP,
  classifyIPv6,
  extractIPv6FromCandidate,
  extractMDNSHost,
  isCGNAT,
  isPrivateIP,
  isPublicIP,
  isReservedIPv4,
  isValidIPv6,
} from '../ip-utils';

describe('isPrivateIP', () => {
  const privates = [
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '127.0.0.1',
    '169.254.1.2',
  ];

  it.each(privates)('recognises %s as private', ip => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  const nonPrivates = ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '169.253.0.1'];
  it.each(nonPrivates)('recognises %s as NOT private', ip => {
    expect(isPrivateIP(ip)).toBe(false);
  });

  it('rejects invalid IPs', () => {
    expect(isPrivateIP('not.an.ip.at-all')).toBe(false);
    expect(isPrivateIP('999.999.999.999')).toBe(false);
    expect(isPrivateIP('')).toBe(false);
  });
});

describe('isPublicIP', () => {
  it('returns true for valid public IPv4', () => {
    expect(isPublicIP('8.8.8.8')).toBe(true);
    expect(isPublicIP('1.1.1.1')).toBe(true);
  });

  it('returns false for private and invalid IPs', () => {
    expect(isPublicIP('10.0.0.1')).toBe(false);
    expect(isPublicIP('192.168.0.1')).toBe(false);
    expect(isPublicIP('999.0.0.1')).toBe(false);
    expect(isPublicIP('abc')).toBe(false);
  });

  it('rejects CGNAT and reserved ranges', () => {
    expect(isPublicIP('100.64.0.1')).toBe(false);
    expect(isPublicIP('100.127.255.254')).toBe(false);
    expect(isPublicIP('224.0.0.1')).toBe(false);
    expect(isPublicIP('239.255.255.255')).toBe(false);
    expect(isPublicIP('240.0.0.1')).toBe(false);
    expect(isPublicIP('255.255.255.255')).toBe(false);
  });

  it('accepts edge IPs just outside CGNAT', () => {
    expect(isPublicIP('100.63.255.255')).toBe(true);
    expect(isPublicIP('100.128.0.1')).toBe(true);
  });
});

describe('isCGNAT', () => {
  it('recognises 100.64.0.0/10', () => {
    expect(isCGNAT('100.64.0.0')).toBe(true);
    expect(isCGNAT('100.127.255.255')).toBe(true);
    expect(isCGNAT('100.63.255.255')).toBe(false);
    expect(isCGNAT('100.128.0.0')).toBe(false);
  });
});

describe('isReservedIPv4', () => {
  it('recognises multicast + reserved ranges', () => {
    expect(isReservedIPv4('224.0.0.1')).toBe(true);
    expect(isReservedIPv4('240.0.0.1')).toBe(true);
    expect(isReservedIPv4('255.255.255.255')).toBe(true);
    expect(isReservedIPv4('223.255.255.255')).toBe(false);
  });
});

describe('classifyIP', () => {
  it('classifies correctly', () => {
    expect(classifyIP('10.0.0.1')).toBe('local');
    expect(classifyIP('100.64.1.1')).toBe('local');
    expect(classifyIP('8.8.8.8')).toBe('public');
    expect(classifyIP('224.0.0.1')).toBe('reserved');
    expect(classifyIP('not-an-ip')).toBe('invalid');
  });
});

describe('isValidIPv6', () => {
  const valid = [
    '::',
    '::1',
    'fe80::1',
    'fe80::1234:5678:90ab:cdef',
    '2001:db8::1',
    '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    '::ffff:1.2.3.4',
    '2001:db8::1%eth0',
  ];
  it.each(valid)('accepts %s', ip => {
    expect(isValidIPv6(ip)).toBe(true);
  });

  const invalid = [
    '',
    '1.2.3.4',
    'abc',
    '1:2:3:4:5:6:7', // too few
    '1:2:3:4:5:6:7:8:9', // too many
    '1::2::3', // multiple ::
    'gggg::1', // non-hex
    '12345::1', // group too long
    'candidate:1', // not an address
  ];
  it.each(invalid)('rejects %s', ip => {
    expect(isValidIPv6(ip)).toBe(false);
  });
});

describe('classifyIPv6', () => {
  it('classifies known scopes', () => {
    expect(classifyIPv6('::')).toBe('unspecified');
    expect(classifyIPv6('::1')).toBe('loopback');
    expect(classifyIPv6('fe80::1')).toBe('link-local');
    expect(classifyIPv6('febf::1')).toBe('link-local');
    expect(classifyIPv6('fc00::1')).toBe('ula');
    expect(classifyIPv6('fd00::1')).toBe('ula');
    expect(classifyIPv6('ff02::1')).toBe('multicast');
    expect(classifyIPv6('2001:db8::1')).toBe('documentation');
    expect(classifyIPv6('2001:4860:4860::8888')).toBe('global');
    expect(classifyIPv6('not-an-ip')).toBe('invalid');
  });
});

describe('extractIPv6FromCandidate', () => {
  it('pulls a link-local address from a candidate line', () => {
    const line = 'candidate:4 1 udp 2113937151 fe80::1234:5678:90ab:cdef 12345 typ host';
    const out = extractIPv6FromCandidate(line);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ address: 'fe80::1234:5678:90ab:cdef', scope: 'link-local' });
  });

  it('returns nothing when the candidate has no IPv6 token', () => {
    const line = 'candidate:1 1 udp 2113937151 192.168.1.42 57342 typ host';
    expect(extractIPv6FromCandidate(line)).toEqual([]);
  });

  it('ignores SDP tokens with colons that are not addresses', () => {
    // The `candidate:1` prefix contains a colon but must not be extracted.
    const line = 'candidate:1 1 udp 1 2001:4860:4860::8888 57342 typ host';
    const out = extractIPv6FromCandidate(line);
    expect(out).toHaveLength(1);
    expect(out[0].scope).toBe('global');
  });
});

describe('extractMDNSHost', () => {
  it('returns the mDNS hostname when present', () => {
    const candidate =
      'candidate:1 1 udp 2113937151 abcd1234-abcd-1234-abcd-1234abcd5678.local 57342 typ host';
    expect(extractMDNSHost(candidate)).toBe('abcd1234-abcd-1234-abcd-1234abcd5678.local');
  });

  it('returns null when no .local host is present', () => {
    expect(extractMDNSHost('candidate:1 1 udp 1 192.168.0.1 57342 typ host')).toBeNull();
  });
});
