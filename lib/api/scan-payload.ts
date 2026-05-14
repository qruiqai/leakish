import { z } from 'zod';

/**
 * Body shape accepted by `POST /api/detect/scans`.
 *
 * The client computes its own `assessment` (it already has it for the Overview
 * panel), so we just persist what was shown — full read-only replay later.
 *
 * Raw fingerprint inputs come along separately so the server can hash them
 * (it would be unsafe to trust client-supplied hashes for uniqueness counting).
 */

const RiskLevelEnum = z.enum(['safe', 'warning', 'critical', 'unknown']);

const RiskSignalSchema = z.object({
  id: z.string().min(1).max(64),
  level: z.enum(['safe', 'warning', 'critical']),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  moduleId: z.string().min(1).max(64),
  value: z.string().max(200).optional(),
});

const ModuleAssessmentSchema = z.object({
  moduleId: z.string().min(1).max(64),
  level: RiskLevelEnum,
  signals: z.array(RiskSignalSchema).max(40),
  summary: z.string().max(300),
});

const OverallAssessmentSchema = z.object({
  score: z.number().int().min(0).max(100),
  level: RiskLevelEnum,
  counts: z.object({
    critical: z.number().int().min(0).max(100),
    warning: z.number().int().min(0).max(100),
    safe: z.number().int().min(0).max(100),
  }),
  untestedModuleIds: z.array(z.string()).max(20),
  perModule: z.array(ModuleAssessmentSchema).max(20),
});

/**
 * Shared between POST /api/detect/scans (save) and POST /api/detect/uniqueness
 * (fingerprint-match counting) so size limits always agree.
 */
export const FingerprintsSchema = z.object({
  userAgent: z.string().max(2000).optional(),
  canvas2dDataUrl: z.string().max(50_000).optional(),
  webglDataUrl: z.string().max(50_000).optional(),
  audioFingerprint: z.string().max(2000).optional(),
  fontList: z.array(z.string().max(100)).max(200).optional(),
});

/**
 * Client-side module outputs extracted for normalized column storage.
 *
 * This is the "Tier 1" data used by analytics queries — everything here is
 * mirrored into its own DetectScan column so cross-record comparisons don't
 * require JSON parsing the `payload` blob. All fields are optional so older
 * clients and partial scans still save cleanly.
 *
 * Size caps are loose (this is an internal tool); they exist only to bound
 * pathological payloads.
 */
export const ModuleSnapshotSchema = z
  .object({
    // WebRTC
    webrtcPublicIp: z.string().max(64).optional(),
    webrtcLocalIpCount: z.number().int().min(0).max(100).optional(),
    webrtcIpv6Count: z.number().int().min(0).max(100).optional(),
    webrtcHasMdns: z.boolean().optional(),

    // Browser fingerprint
    platform: z.string().max(64).optional(),
    language: z.string().max(32).optional(),
    languageCount: z.number().int().min(0).max(100).optional(),
    timezoneName: z.string().max(64).optional(),
    timezoneOffsetMin: z.number().int().min(-720).max(720).optional(),
    screenWidth: z.number().int().min(0).max(32_768).optional(),
    screenHeight: z.number().int().min(0).max(32_768).optional(),
    screenColorDepth: z.number().int().min(0).max(64).optional(),
    hardwareConcurrency: z.number().int().min(0).max(1024).optional(),
    deviceMemoryGb: z.number().int().min(0).max(1024).optional(),
    pluginCount: z.number().int().min(0).max(1024).optional(),
    cookieEnabled: z.boolean().optional(),
    doNotTrack: z.string().max(32).optional(),
    onlineStatus: z.boolean().optional(),

    // Canvas / WebGL
    webglVendor: z.string().max(256).optional(),
    webglRenderer: z.string().max(512).optional(),

    // Font
    fontTotalCount: z.number().int().min(0).max(5000).optional(),
    fontUniqueCount: z.number().int().min(0).max(5000).optional(),

    // DNS
    dohSupport: z.boolean().optional(),
    dnssecSupport: z.boolean().optional(),
    resolverLocation: z.string().max(128).optional(),

    // CDP / automation
    cdpDetected: z.boolean().optional(),
    cdpConfidence: z.number().min(0).max(1).optional(),
    webdriverFlag: z.boolean().optional(),
    isChromium: z.boolean().optional(),
  })
  .default({});

/// User-supplied label stored with a saved scan. Required from the UI (the
/// whole point is to let later uniqueness reports reference *which* run the
/// duplicate came from), but the schema keeps it optional so old idempotent
/// replays without `name` still resolve cleanly.
export const ScanNameSchema = z
  .string()
  .trim()
  // Zod messages are English placeholders — the API route wraps the response
  // with a localized "invalid_payload" message; the underlying zod issue text
  // is not surfaced to end users.
  .min(1, { message: 'scan name is required' })
  .max(80, { message: 'scan name must be 80 characters or fewer' });

export const SaveScanRequestSchema = z.object({
  assessment: OverallAssessmentSchema,
  fingerprints: FingerprintsSchema.default({}),
  moduleSnapshot: ModuleSnapshotSchema,
  name: ScanNameSchema.optional(),
});

export type SaveScanRequest = z.infer<typeof SaveScanRequestSchema>;
export type StoredAssessment = z.infer<typeof OverallAssessmentSchema>;
export type ModuleSnapshot = z.infer<typeof ModuleSnapshotSchema>;
