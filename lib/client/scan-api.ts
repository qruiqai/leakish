'use client';

import type {
  AudioFingerprintData,
  BrowserFingerprintData,
  CanvasFingerprintData,
  CDPDetectionData,
  DetectionResult,
  DNSData,
  FontDetectionData,
  WebRTCData,
} from '@/lib/detection-modules';
import type { ModuleSnapshot } from '@/lib/api/scan-payload';
import type { OverallAssessment } from '@/lib/risk';

export interface ScanListItem {
  id: string;
  name: string | null;
  createdAt: string;
  score: number;
  level: string;
  ipPublic: string | null;
  ipCountry: string | null;
  ipRegion: string | null;
  ipCity: string | null;
  ipAsn: string | null;
  ipAsOrg: string | null;
  ipIsVpn: boolean | null;
  cdpDetected: boolean | null;
  webdriverFlag: boolean | null;
  webrtcIpMismatch: boolean | null;
}

export interface ScanDetail extends ScanListItem {
  // Server-observed network
  ipFamily: string | null;
  ipHostname: string | null;
  ipIsProxy: boolean | null;
  ipIsTor: boolean | null;
  ipIsHosting: boolean | null;
  tlsJa3: string | null;
  tlsJa4: string | null;
  serverUserAgent: string | null;
  acceptLanguage: string | null;
  acceptEncoding: string | null;

  // Client WebRTC
  webrtcPublicIp: string | null;
  webrtcLocalIpCount: number | null;
  webrtcIpv6Count: number | null;
  webrtcHasMdns: boolean | null;

  // Browser fingerprint
  clientUserAgent: string | null;
  platform: string | null;
  language: string | null;
  languageCount: number | null;
  timezoneName: string | null;
  timezoneOffsetMin: number | null;
  screenWidth: number | null;
  screenHeight: number | null;
  screenColorDepth: number | null;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  pluginCount: number | null;
  cookieEnabled: boolean | null;
  doNotTrack: string | null;
  onlineStatus: boolean | null;

  // Canvas / WebGL
  webglVendor: string | null;
  webglRenderer: string | null;

  // Fonts
  fontTotalCount: number | null;
  fontUniqueCount: number | null;

  // DNS
  dohSupport: boolean | null;
  dnssecSupport: boolean | null;
  resolverLocation: string | null;

  // CDP
  cdpConfidence: number | null;
  isChromium: boolean | null;

  // Raw fingerprint blobs (nullable; may be omitted for older rows)
  rawUserAgent: string | null;
  rawCanvas2dDataUrl: string | null;
  rawWebglDataUrl: string | null;
  rawAudioFp: string | null;
  rawFontListSorted: string | null;

  payload: { assessment: OverallAssessment };
}

/**
 * Pluck the raw fingerprint values from the in-memory results map. These are
 * uploaded to the server only when the user explicitly saves the scan or
 * requests a uniqueness lookup.
 */
export function extractFingerprintInputs(results: ReadonlyMap<string, DetectionResult>) {
  const browser = results.get('browser-fingerprint') as
    | DetectionResult<BrowserFingerprintData>
    | undefined;
  const canvas = results.get('canvas-fingerprint') as
    | DetectionResult<CanvasFingerprintData>
    | undefined;
  const audio = results.get('audio-fingerprint') as
    | DetectionResult<AudioFingerprintData>
    | undefined;
  const fonts = results.get('font-detection') as DetectionResult<FontDetectionData> | undefined;

  return {
    userAgent: browser?.success ? browser.data?.userAgent : undefined,
    canvas2dDataUrl: canvas?.success ? canvas.data?.canvas2D : undefined,
    webglDataUrl: canvas?.success ? (canvas.data?.canvasWebGL ?? undefined) : undefined,
    audioFingerprint: audio?.success ? audio.data?.audioContextFingerprint : undefined,
    fontList: fonts?.success ? fonts.data?.installedFonts : undefined,
  };
}

/**
 * Flatten structured module outputs into the normalized column shape expected
 * by the save endpoint. Mirrors scan-payload.ts `ModuleSnapshotSchema` — any
 * field that can't be derived stays undefined and the server stores null.
 *
 * Designed to be no-throw: a module that failed or hasn't run is silently
 * skipped. Callers should pass the full results map.
 */
export function extractModuleSnapshot(
  results: ReadonlyMap<string, DetectionResult>
): ModuleSnapshot {
  const snap: ModuleSnapshot = {};

  const webrtc = results.get('webrtc') as DetectionResult<WebRTCData> | undefined;
  if (webrtc?.success && webrtc.data) {
    const d = webrtc.data;
    snap.webrtcPublicIp = d.publicIPs[0] ?? undefined;
    snap.webrtcLocalIpCount = d.localIPs.length;
    snap.webrtcIpv6Count = d.ipv6Addresses.length;
    snap.webrtcHasMdns = (d.debug?.mDNSCandidates?.length ?? 0) > 0;
  }

  const browser = results.get('browser-fingerprint') as
    | DetectionResult<BrowserFingerprintData>
    | undefined;
  if (browser?.success && browser.data) {
    const d = browser.data;
    snap.platform = d.platform || undefined;
    snap.language = d.language || undefined;
    snap.languageCount = d.languages.length;
    snap.timezoneName = d.timezone.name || undefined;
    snap.timezoneOffsetMin = d.timezone.offset;
    snap.screenWidth = d.screenResolution.width;
    snap.screenHeight = d.screenResolution.height;
    snap.screenColorDepth = d.screenResolution.colorDepth;
    snap.hardwareConcurrency = d.hardwareConcurrency;
    // deviceMemory is Number|undefined; round to int for the column.
    if (typeof d.deviceMemory === 'number') {
      snap.deviceMemoryGb = Math.round(d.deviceMemory);
    }
    snap.pluginCount = d.plugins.length;
    snap.cookieEnabled = d.cookieEnabled;
    snap.doNotTrack = d.doNotTrack ?? undefined;
    snap.onlineStatus = d.onlineStatus;
  }

  const canvas = results.get('canvas-fingerprint') as
    | DetectionResult<CanvasFingerprintData>
    | undefined;
  if (canvas?.success && canvas.data) {
    snap.webglVendor = canvas.data.webglVendor ?? undefined;
    snap.webglRenderer = canvas.data.webglRenderer ?? undefined;
  }

  const fonts = results.get('font-detection') as DetectionResult<FontDetectionData> | undefined;
  if (fonts?.success && fonts.data) {
    snap.fontTotalCount = fonts.data.totalFonts;
    snap.fontUniqueCount = fonts.data.uniqueFonts.length;
  }

  const dns = results.get('dns') as DetectionResult<DNSData> | undefined;
  if (dns?.success && dns.data) {
    snap.dohSupport = dns.data.dohSupport;
    snap.dnssecSupport = dns.data.dnssecSupport;
    snap.resolverLocation = dns.data.resolverLocation ?? undefined;
  }

  const cdp = results.get('cdp-detection') as DetectionResult<CDPDetectionData> | undefined;
  if (cdp?.success && cdp.data) {
    snap.cdpDetected = cdp.data.detected;
    snap.cdpConfidence = cdp.data.confidence;
    snap.webdriverFlag = cdp.data.webdriverFlag ?? undefined;
    snap.isChromium = cdp.data.isChromium;
  }

  return snap;
}

export interface SaveScanOptions {
  /**
   * Client-supplied `Idempotency-Key` header. Two saves from the same user
   * with the same key resolve to the same row — safe for network retries.
   * Use `crypto.randomUUID()` for a fresh key per logical save operation.
   */
  idempotencyKey?: string;
}

export async function saveScan(
  assessment: OverallAssessment,
  fingerprints: ReturnType<typeof extractFingerprintInputs>,
  moduleSnapshot: ModuleSnapshot,
  name: string,
  opts?: SaveScanOptions
): Promise<{ id: string; idempotent?: boolean }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts?.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
  const res = await fetch('/api/detect/scans', {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ assessment, fingerprints, moduleSnapshot, name }),
  });
  // Status-code fallback strings — English-only. Whenever the API returns a
  // message field (covered by the apiErrors i18n surface), that takes priority;
  // these strings only surface when the response has no JSON body.
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message ?? `Save failed (${res.status})`);
  }
  return (await res.json()) as { id: string; idempotent?: boolean };
}

export async function listScans(): Promise<ScanListItem[]> {
  const res = await fetch('/api/detect/scans', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to load scan list (${res.status})`);
  const json = (await res.json()) as { scans: ScanListItem[] };
  return json.scans;
}

/**
 * Lookup the current user's saved scans with an exact name match (case-
 * insensitive — driven by the DB collation). Used by the save dialog to warn
 * before persisting a second row under the same label.
 */
export async function findScansByName(name: string): Promise<ScanListItem[]> {
  const res = await fetch(
    `/api/detect/scans?name=${encodeURIComponent(name)}&limit=5`,
    { credentials: 'include', cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Failed to check scan name (${res.status})`);
  const json = (await res.json()) as { scans: ScanListItem[] };
  return json.scans;
}

export async function getScan(id: string): Promise<ScanDetail> {
  const res = await fetch(`/api/detect/scans/${encodeURIComponent(id)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message ?? `Failed to load scan (${res.status})`);
  }
  return (await res.json()) as ScanDetail;
}

export type UniquenessKind = 'ua' | 'canvas2d' | 'webgl' | 'audio' | 'fontset';

export interface UniquenessOwnMatch {
  id: string;
  name: string | null;
  createdAt: string;
}

export interface UniquenessResponse {
  totalScans: number;
  matches: Record<UniquenessKind, number | null>;
  /**
   * Per-kind list of the *current user's* saved scans whose hash matches — so
   * the overview can say "与『昨天的 Chrome』重复" instead of just "2 次".
   * We only return the user's own rows: cross-user matches stay anonymous.
   */
  ownMatches: Record<UniquenessKind, UniquenessOwnMatch[]>;
}

export async function lookupUniqueness(
  fingerprints: ReturnType<typeof extractFingerprintInputs>
): Promise<UniquenessResponse> {
  const res = await fetch('/api/detect/uniqueness', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fingerprints }),
  });
  if (!res.ok) throw new Error(`Uniqueness lookup failed (${res.status})`);
  return (await res.json()) as UniquenessResponse;
}
