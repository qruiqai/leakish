/**
 * Statistical analytics over a single user's saved DetectScan history.
 *
 * Pure function over a list of scan rows — no DB access here so it stays
 * cheap to unit-test. The route handler is responsible for fetching scans
 * with the right `select`.
 *
 * All sizes are bounded: MAX_SCANS_PER_USER = 200, so every loop is O(N²)
 * worst-case in scan count without concern. We never read `raw*` blobs here
 * (they're large and pointless for aggregate stats).
 */

export type AnalyticsScan = {
  id: string;
  name: string | null;
  createdAt: Date;
  score: number;
  level: string;

  // Network
  ipPublic: string | null;
  ipCountry: string | null;
  ipAsn: string | null;
  webrtcIpMismatch: boolean | null;

  // Browser fingerprint
  platform: string | null;
  language: string | null;
  timezoneName: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  webglRenderer: string | null;
  fontTotalCount: number | null;

  // Fingerprint hashes (the actual uniqueness join keys)
  uaHash: string | null;
  canvas2dHash: string | null;
  webglHash: string | null;
  audioHash: string | null;
  fontsetHash: string | null;
};

export type Bucket = {
  value: string;
  count: number;
  pct: number;
  scanIds: string[];
};

export type HashGroup = {
  hash: string;
  count: number;
  scanIds: string[];
};

export type TimelinePoint = {
  id: string;
  createdAt: string;
  ipPublic: string | null;
  ipAsn: string | null;
  level: string;
  webrtcIpMismatch: boolean | null;
};

export type OutlierScan = {
  id: string;
  name: string | null;
  createdAt: string;
  outlierScore: number;
  reasons: string[];
};

export type DistributionFieldKey =
  | 'timezoneName'
  | 'platform'
  | 'language'
  | 'screenSize'
  | 'webglRenderer'
  | 'ipCountry'
  | 'ipAsn'
  | 'fontTotalCount';

export type HashKind = 'ua' | 'canvas2d' | 'webgl' | 'audio' | 'fontset';

export type UserAnalytics = {
  totalScans: number;
  distribution: Record<DistributionFieldKey, Bucket[]>;
  ownHashRepetition: Record<HashKind, HashGroup[]>;
  timeline: TimelinePoint[];
  outliers: OutlierScan[];
};

const NULL_VALUE = '(unknown)';

const HASH_FIELD_BY_KIND: Record<
  HashKind,
  keyof Pick<AnalyticsScan, 'uaHash' | 'canvas2dHash' | 'webglHash' | 'audioHash' | 'fontsetHash'>
> = {
  ua: 'uaHash',
  canvas2d: 'canvas2dHash',
  webgl: 'webglHash',
  audio: 'audioHash',
  fontset: 'fontsetHash',
};

function valueFor(scan: AnalyticsScan, key: DistributionFieldKey): string {
  switch (key) {
    case 'timezoneName':
      return scan.timezoneName ?? NULL_VALUE;
    case 'platform':
      return scan.platform ?? NULL_VALUE;
    case 'language':
      return scan.language ?? NULL_VALUE;
    case 'screenSize':
      return scan.screenWidth && scan.screenHeight
        ? `${scan.screenWidth}x${scan.screenHeight}`
        : NULL_VALUE;
    case 'webglRenderer':
      return scan.webglRenderer ?? NULL_VALUE;
    case 'ipCountry':
      return scan.ipCountry ?? NULL_VALUE;
    case 'ipAsn':
      return scan.ipAsn ?? NULL_VALUE;
    case 'fontTotalCount':
      return scan.fontTotalCount === null ? NULL_VALUE : String(scan.fontTotalCount);
  }
}

function bucketize(scans: AnalyticsScan[], key: DistributionFieldKey): Bucket[] {
  const map = new Map<string, string[]>();
  for (const scan of scans) {
    const value = valueFor(scan, key);
    const ids = map.get(value);
    if (ids) ids.push(scan.id);
    else map.set(value, [scan.id]);
  }
  const total = scans.length;
  return Array.from(map.entries())
    .map(([value, scanIds]) => ({
      value,
      count: scanIds.length,
      pct: total > 0 ? scanIds.length / total : 0,
      scanIds,
    }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function hashRepetition(scans: AnalyticsScan[], kind: HashKind): HashGroup[] {
  const field = HASH_FIELD_BY_KIND[kind];
  const map = new Map<string, string[]>();
  for (const scan of scans) {
    const hash = scan[field];
    if (!hash) continue;
    const ids = map.get(hash);
    if (ids) ids.push(scan.id);
    else map.set(hash, [scan.id]);
  }
  return Array.from(map.entries())
    .filter(([, ids]) => ids.length >= 2)
    .map(([hash, scanIds]) => ({ hash, count: scanIds.length, scanIds }))
    .sort((a, b) => b.count - a.count);
}

const DISTRIBUTION_KEYS: DistributionFieldKey[] = [
  'timezoneName',
  'platform',
  'language',
  'screenSize',
  'webglRenderer',
  'ipCountry',
  'ipAsn',
  'fontTotalCount',
];

const HASH_KINDS: HashKind[] = ['ua', 'canvas2d', 'webgl', 'audio', 'fontset'];

/**
 * Fields used for outlier scoring. Each contributes equally; a scan is a
 * "minority" on a field when its value occurs in < 20% of scans.
 *
 * Includes hash fields because uniqueness on canvas/audio is exactly the
 * signal a fingerprint-browser operator wants to verify across accounts.
 */
const OUTLIER_FIELDS: Array<DistributionFieldKey | HashKind> = [
  'timezoneName',
  'platform',
  'language',
  'screenSize',
  'webglRenderer',
  'ipAsn',
  'canvas2d',
  'webgl',
  'audio',
  'fontset',
];

const MINORITY_THRESHOLD = 0.2;
const OUTLIER_THRESHOLD = 0.3;

function valueForOutlierField(
  scan: AnalyticsScan,
  field: DistributionFieldKey | HashKind
): string | null {
  if (field in HASH_FIELD_BY_KIND) {
    const dbField = HASH_FIELD_BY_KIND[field as HashKind];
    return scan[dbField];
  }
  const v = valueFor(scan, field as DistributionFieldKey);
  return v === NULL_VALUE ? null : v;
}

function computeOutliers(scans: AnalyticsScan[]): OutlierScan[] {
  if (scans.length < 3) return [];

  // Precompute value frequency per outlier field.
  const freq: Map<DistributionFieldKey | HashKind, Map<string, number>> = new Map();
  for (const field of OUTLIER_FIELDS) {
    const m = new Map<string, number>();
    for (const scan of scans) {
      const v = valueForOutlierField(scan, field);
      if (v === null) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    freq.set(field, m);
  }

  const total = scans.length;
  const outliers: OutlierScan[] = [];

  for (const scan of scans) {
    const reasons: string[] = [];
    let denominator = 0;
    let minorityHits = 0;

    for (const field of OUTLIER_FIELDS) {
      const v = valueForOutlierField(scan, field);
      if (v === null) continue;
      denominator += 1;
      const count = freq.get(field)!.get(v) ?? 0;
      const pct = count / total;
      if (pct < MINORITY_THRESHOLD) {
        minorityHits += 1;
        const pctStr = (pct * 100).toFixed(0);
        const shortValue = v.length > 24 ? `${v.slice(0, 16)}…${v.slice(-4)}` : v;
        reasons.push(`${field}=${shortValue} (${pctStr}%)`);
      }
    }

    if (denominator === 0) continue;
    const outlierScore = minorityHits / denominator;
    if (outlierScore >= OUTLIER_THRESHOLD) {
      outliers.push({
        id: scan.id,
        name: scan.name,
        createdAt: scan.createdAt.toISOString(),
        outlierScore,
        reasons,
      });
    }
  }

  return outliers.sort((a, b) => b.outlierScore - a.outlierScore);
}

export function computeUserAnalytics(scans: AnalyticsScan[]): UserAnalytics {
  const distribution = Object.fromEntries(
    DISTRIBUTION_KEYS.map(k => [k, bucketize(scans, k)])
  ) as Record<DistributionFieldKey, Bucket[]>;

  const ownHashRepetition = Object.fromEntries(
    HASH_KINDS.map(k => [k, hashRepetition(scans, k)])
  ) as Record<HashKind, HashGroup[]>;

  const timeline: TimelinePoint[] = [...scans]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(scan => ({
      id: scan.id,
      createdAt: scan.createdAt.toISOString(),
      ipPublic: scan.ipPublic,
      ipAsn: scan.ipAsn,
      level: scan.level,
      webrtcIpMismatch: scan.webrtcIpMismatch,
    }));

  const outliers = computeOutliers(scans);

  return {
    totalScans: scans.length,
    distribution,
    ownHashRepetition,
    timeline,
    outliers,
  };
}

/** Compact summary consumed by the analytics dashboard (scan-compare + outlier list). */
export type ScanSummary = {
  id: string;
  name: string | null;
  createdAt: string;
  score: number;
  level: string;
  ipCountry: string | null;
  ipAsn: string | null;
  platform: string | null;
  language: string | null;
  timezoneName: string | null;
  screenSize: string | null;
  webglRenderer: string | null;
  fontTotalCount: number | null;
  webrtcIpMismatch: boolean | null;
  hashes: {
    ua: string | null;
    canvas2d: string | null;
    webgl: string | null;
    audio: string | null;
    fontset: string | null;
  };
};

export function toScanSummary(scan: AnalyticsScan): ScanSummary {
  return {
    id: scan.id,
    name: scan.name,
    createdAt: scan.createdAt.toISOString(),
    score: scan.score,
    level: scan.level,
    ipCountry: scan.ipCountry,
    ipAsn: scan.ipAsn,
    platform: scan.platform,
    language: scan.language,
    timezoneName: scan.timezoneName,
    screenSize:
      scan.screenWidth && scan.screenHeight ? `${scan.screenWidth}x${scan.screenHeight}` : null,
    webglRenderer: scan.webglRenderer,
    fontTotalCount: scan.fontTotalCount,
    webrtcIpMismatch: scan.webrtcIpMismatch,
    hashes: {
      ua: scan.uaHash,
      canvas2d: scan.canvas2dHash,
      webgl: scan.webglHash,
      audio: scan.audioHash,
      fontset: scan.fontsetHash,
    },
  };
}
