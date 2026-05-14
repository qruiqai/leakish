import type {
  AudioFingerprintData,
  BrowserFingerprintData,
  CanvasFingerprintData,
  DetectionResult,
  FontDetectionData,
} from '@/lib/detection-modules';
import { sha256 } from './hash';

/**
 * Five "uniqueness primitives" we care about — each is a distinct attack
 * surface on the fingerprint side. Stored in DetectFingerprintHash so we can
 * answer "how many other scans saw this exact value?".
 */
export type FingerprintKind = 'ua' | 'canvas2d' | 'webgl' | 'audio' | 'fontset';

export interface FingerprintHashes {
  ua: string | null;
  canvas2d: string | null;
  webgl: string | null;
  audio: string | null;
  fontset: string | null;
}

export const EMPTY_HASHES: FingerprintHashes = Object.freeze({
  ua: null,
  canvas2d: null,
  webgl: null,
  audio: null,
  fontset: null,
});

/**
 * Derive the per-kind hash inputs from the per-module results.
 *
 * The hash inputs are deliberately content-only (no timestamps, no salt) so the
 * same machine always produces the same hash — that's what makes uniqueness
 * counting meaningful.
 *
 * Hashing is server-side only; this function is shared between the save-scan
 * endpoint and the uniqueness-lookup endpoint so they always agree.
 */
export function deriveHashes(results: ReadonlyMap<string, DetectionResult>): FingerprintHashes {
  const out: FingerprintHashes = { ...EMPTY_HASHES };

  const browser = results.get('browser-fingerprint') as
    | DetectionResult<BrowserFingerprintData>
    | undefined;
  if (browser?.success && browser.data?.userAgent) {
    out.ua = sha256(browser.data.userAgent);
  }

  const canvas = results.get('canvas-fingerprint') as
    | DetectionResult<CanvasFingerprintData>
    | undefined;
  if (canvas?.success && canvas.data) {
    if (canvas.data.canvas2D) out.canvas2d = sha256(canvas.data.canvas2D);
    if (canvas.data.canvasWebGL) out.webgl = sha256(canvas.data.canvasWebGL);
  }

  const audio = results.get('audio-fingerprint') as
    | DetectionResult<AudioFingerprintData>
    | undefined;
  if (audio?.success && audio.data?.audioContextFingerprint) {
    out.audio = sha256(audio.data.audioContextFingerprint);
  }

  const fonts = results.get('font-detection') as DetectionResult<FontDetectionData> | undefined;
  if (fonts?.success && fonts.data) {
    // Sort the font list so order doesn't change the hash.
    const sorted = [...fonts.data.installedFonts].sort();
    out.fontset = sha256(sorted.join('\n'));
  }

  return out;
}
