/**
 * @jest-environment node
 */
import { computeUserAnalytics, toScanSummary, type AnalyticsScan } from '../analytics';

function makeScan(overrides: Partial<AnalyticsScan>): AnalyticsScan {
  return {
    id: 'scan-default',
    name: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    score: 80,
    level: 'safe',
    ipPublic: null,
    ipCountry: null,
    ipAsn: null,
    webrtcIpMismatch: null,
    platform: null,
    language: null,
    timezoneName: null,
    screenWidth: null,
    screenHeight: null,
    webglRenderer: null,
    fontTotalCount: null,
    uaHash: null,
    canvas2dHash: null,
    webglHash: null,
    audioHash: null,
    fontsetHash: null,
    ...overrides,
  };
}

describe('computeUserAnalytics', () => {
  it('returns empty distribution when given no scans', () => {
    const result = computeUserAnalytics([]);
    expect(result.totalScans).toBe(0);
    expect(result.timeline).toEqual([]);
    expect(result.outliers).toEqual([]);
    // All distribution arrays start empty.
    Object.values(result.distribution).forEach(buckets => expect(buckets).toEqual([]));
  });

  it('bucketizes timezoneName and sorts by count desc', () => {
    const scans = [
      makeScan({ id: 's1', timezoneName: 'Asia/Shanghai' }),
      makeScan({ id: 's2', timezoneName: 'Asia/Shanghai' }),
      makeScan({ id: 's3', timezoneName: 'America/New_York' }),
    ];
    const result = computeUserAnalytics(scans);
    const tz = result.distribution.timezoneName;
    expect(tz[0].value).toBe('Asia/Shanghai');
    expect(tz[0].count).toBe(2);
    expect(tz[0].scanIds.sort()).toEqual(['s1', 's2']);
    expect(tz[1].value).toBe('America/New_York');
    expect(tz[1].count).toBe(1);
  });

  it('joins screenWidth+screenHeight into a single bucket key', () => {
    const scans = [
      makeScan({ id: 's1', screenWidth: 1920, screenHeight: 1080 }),
      makeScan({ id: 's2', screenWidth: 1920, screenHeight: 1080 }),
      makeScan({ id: 's3', screenWidth: 1366, screenHeight: 768 }),
    ];
    const result = computeUserAnalytics(scans);
    const sizes = result.distribution.screenSize;
    expect(sizes.find(b => b.value === '1920x1080')?.count).toBe(2);
    expect(sizes.find(b => b.value === '1366x768')?.count).toBe(1);
  });

  it('only includes hash groups with count >= 2 in ownHashRepetition', () => {
    const scans = [
      makeScan({ id: 's1', canvas2dHash: 'hashA' }),
      makeScan({ id: 's2', canvas2dHash: 'hashA' }),
      makeScan({ id: 's3', canvas2dHash: 'hashB' }),
    ];
    const result = computeUserAnalytics(scans);
    expect(result.ownHashRepetition.canvas2d).toHaveLength(1);
    expect(result.ownHashRepetition.canvas2d[0].hash).toBe('hashA');
    expect(result.ownHashRepetition.canvas2d[0].count).toBe(2);
  });

  it('flags outliers when a scan is a minority on enough fields', () => {
    // 4 scans share canvas2dHash=alpha, audioHash=alpha, timezoneName=Asia/Shanghai,
    // platform=Win32, language=zh-CN, screen=1920x1080, webglRenderer=foo, ipAsn=AS1, webglHash=alpha, fontsetHash=alpha.
    // 1 outlier scan differs on every field.
    const majority = (i: number) =>
      makeScan({
        id: `maj-${i}`,
        timezoneName: 'Asia/Shanghai',
        platform: 'Win32',
        language: 'zh-CN',
        screenWidth: 1920,
        screenHeight: 1080,
        webglRenderer: 'foo',
        ipAsn: 'AS1',
        canvas2dHash: 'alpha',
        webglHash: 'alpha',
        audioHash: 'alpha',
        fontsetHash: 'alpha',
      });
    const outlier = makeScan({
      id: 'out-1',
      name: 'misfit',
      timezoneName: 'America/New_York',
      platform: 'MacIntel',
      language: 'en-US',
      screenWidth: 1366,
      screenHeight: 768,
      webglRenderer: 'bar',
      ipAsn: 'AS2',
      canvas2dHash: 'omega',
      webglHash: 'omega',
      audioHash: 'omega',
      fontsetHash: 'omega',
    });

    // 9 majority scans + 1 outlier so the outlier's value occurs at 10% (< 20% threshold).
    const scans = [
      majority(1),
      majority(2),
      majority(3),
      majority(4),
      majority(5),
      majority(6),
      majority(7),
      majority(8),
      majority(9),
      outlier,
    ];
    const result = computeUserAnalytics(scans);

    expect(result.outliers.length).toBeGreaterThanOrEqual(1);
    const found = result.outliers.find(o => o.id === 'out-1');
    expect(found).toBeDefined();
    expect(found!.outlierScore).toBeGreaterThanOrEqual(0.9);
    // Every reason mentions a field name.
    expect(found!.reasons.length).toBeGreaterThan(0);
    expect(found!.reasons[0]).toMatch(/=/);
  });

  it('does not flag outliers when there are fewer than 3 scans', () => {
    const scans = [
      makeScan({ id: 's1', timezoneName: 'A', platform: 'Win32' }),
      makeScan({ id: 's2', timezoneName: 'B', platform: 'MacIntel' }),
    ];
    expect(computeUserAnalytics(scans).outliers).toEqual([]);
  });

  it('builds the timeline in chronological order', () => {
    const scans = [
      makeScan({ id: 's1', createdAt: new Date('2026-03-01T00:00:00Z') }),
      makeScan({ id: 's2', createdAt: new Date('2026-02-01T00:00:00Z') }),
      makeScan({ id: 's3', createdAt: new Date('2026-04-01T00:00:00Z') }),
    ];
    const result = computeUserAnalytics(scans);
    expect(result.timeline.map(p => p.id)).toEqual(['s2', 's1', 's3']);
  });
});

describe('toScanSummary', () => {
  it('builds a compact scan summary preserving hash fields', () => {
    const scan = makeScan({
      id: 'abc',
      name: 'win-firefox',
      score: 72,
      level: 'warning',
      ipCountry: 'US',
      screenWidth: 1280,
      screenHeight: 800,
      uaHash: 'ua-hash',
      canvas2dHash: 'c2d',
    });
    const summary = toScanSummary(scan);
    expect(summary.id).toBe('abc');
    expect(summary.name).toBe('win-firefox');
    expect(summary.screenSize).toBe('1280x800');
    expect(summary.hashes.ua).toBe('ua-hash');
    expect(summary.hashes.canvas2d).toBe('c2d');
    expect(summary.hashes.webgl).toBeNull();
  });

  it('omits screenSize when either dimension is missing', () => {
    const summary = toScanSummary(makeScan({ screenWidth: null, screenHeight: 1080 }));
    expect(summary.screenSize).toBeNull();
  });
});
