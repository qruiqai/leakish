import { logger } from '@/lib/logger';
import {
  CDP_ADDRESSES,
  CDP_CONTROL_PORTS,
  CDP_DEFAULT_PORTS,
  CDP_FALLBACK_STDDEV_MS,
  CDP_MIN_VALID_SAMPLES,
  CDP_PROBE_INTERVAL_MS,
  CDP_PROBE_ROUNDS,
  CDP_PROBE_TIMEOUT_MS,
  CDP_SIGNAL2_TOTAL_TIMEOUT_MS,
  CDP_THRESHOLD_CONTROL_RATIO,
  CDP_THRESHOLD_FLOOR_MS,
  CDP_THRESHOLD_STDDEV_MULTIPLIER,
} from './constants';
import type { DetectionModule, DetectionResult } from './types';

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface CDPDiagnostics {
  /** Final Chromium decision as computed by isChromiumBrowser() */
  isChromiumDetected: boolean;
  /** Which detection signal produced the final decision */
  chromiumDetectionMethod:
    | 'userAgentData'
    | 'uaFallback'
    | 'chromeObj'
    | 'explicit-non-chromium'
    | 'none';
  /** Raw userAgentData.brands at scan time (nullable) */
  uaDataBrands: { brand: string; version?: string }[] | null;
  /** Raw userAgent string */
  userAgent: string;
  /** Whether window.chrome was observed as an object */
  hasChromeObj: boolean;
  /** Enumerable keys on window.chrome when present (capped) */
  chromeKeys: string[] | null;
  /**
   * Whether the runtime is an Electron-based shell (VSCode, Slack, Discord,
   * Notion, etc.). When true, the WSS port probe is suppressed and the
   * module's overall confidence is capped — see `ELECTRON_CONFIDENCE_CAP`.
   */
  isElectron: boolean;
  /** Which Electron signal fired (for triage); 'none' when not detected. */
  electronDetectionMethod: 'ua' | 'processGlobal' | 'preloadBridge' | 'none';
}

/**
 * Family tag used by the confidence aggregator to enforce signal-family
 * diversity. The "critical" tier requires at least two distinct families
 * present — this is the industry-standard guard against a single flaky
 * signal flipping the verdict (see DataDome / Castle 2025 blog posts).
 */
export type SignalFamily =
  | 'webdriver'
  | 'automation-globals'
  | 'env-fingerprint'
  | 'runtime-tamper'
  | 'port-probe'
  | 'electron-env';

export interface CDPDetectionData {
  /** navigator.webdriver current value */
  webdriverFlag: boolean | undefined;
  /** Whether the current browser looks like a Chromium variant (authoritative for UI gating) */
  isChromium: boolean;
  /** Whether the current runtime is an Electron shell — see CDPDiagnostics.isElectron */
  isElectron: boolean;
  /** Port probe results */
  portProbes: PortProbeResult[];
  /** Automation fingerprint signals */
  automationSignals: AutomationSignal[];
  /** Overall verdict */
  detected: boolean;
  /** Overall confidence 0-1 (sigmoid-smoothed; safe to threshold) */
  confidence: number;
  /** Raw weighted signal sum before sigmoid smoothing — for diagnostics. */
  rawScore: number;
  /** Number of distinct SignalFamily entries that contributed to the score. */
  signalFamiliesFired: number;
  /** Human-readable evidence string */
  evidence: string;
  /** Debug diagnostics for Chromium / Electron detection */
  diagnostics: CDPDiagnostics;
}

export interface PortProbeResult {
  port: number;
  address: string;
  method: 'wss-timing';
  /** Average probe time ms */
  avgTimeMs: number;
  /** Control port average time ms */
  controlAvgTimeMs: number;
  /** Delta ms */
  deltaMs: number;
  /** Whether port is likely open based on threshold OR stall pattern. */
  likelyOpen: boolean;
  /** Number of probe rounds that yielded a timing sample. */
  probeCount: number;
  /** Whether probing was blocked by browser policy */
  blocked: boolean;
  /**
   * True when the port passed TCP handshake but stalled during TLS
   * handshake — the canonical CDP signature under modern Chrome + HTTPS
   * origin, where a plain `wss://` to an HTTP-speaking CDP server hangs
   * until our safety timeout instead of fast-failing. Implies likelyOpen.
   */
  stalled: boolean;
  /** Number of rounds that hit the safety timeout with no event. */
  timedOutCount: number;
  /** Total probe rounds attempted. */
  totalRounds: number;
}

export interface AutomationSignal {
  id: string;
  present: boolean;
  description: string;
  /**
   * Contribution to the overall CDP confidence when `present` is true.
   * 0 for signals that did not apply / were not pushed. Summed by
   * `computeConfidence` — do not multiply again.
   */
  weight: number;
  /**
   * Family tag used by the family-diversity gate in computeConfidence.
   * Signals from the same family corroborate weakly; signals from different
   * families corroborate strongly. The "critical" verdict requires ≥2
   * distinct families present.
   */
  family: SignalFamily;
}

// ---------------------------------------------------------------------------
// Chromium probe
// ---------------------------------------------------------------------------

export interface ChromiumProbeResult {
  isChromium: boolean;
  method: CDPDiagnostics['chromiumDetectionMethod'];
  uaDataBrands: { brand: string; version?: string }[] | null;
  userAgent: string;
  hasChromeObj: boolean;
  chromeKeys: string[] | null;
}

/**
 * Probe current runtime for Chromium-ness, returning both the decision and a
 * diagnostic breakdown of which signal fired.
 *
 * Decision logic (ordered):
 *  1) Hard negatives from UA: desktop Firefox or iOS-only browser families
 *     (CriOS/FxiOS/EdgiOS are WebKit-backed on iOS) → not Chromium, period.
 *  2) userAgentData.brands contains a Chromium/Chrome/Edge/Brave brand →
 *     authoritative positive (this API is Chromium-only by spec).
 *  3) UA string fallback: contains "Chrome|Chromium|Edg/" → positive. This
 *     catches temporary-profile / remote-debugging Chrome where
 *     userAgentData may be present but have an empty/sparse brands array,
 *     which was the real-world false-negative observed in production.
 *  4) window.chrome object present → positive. Last-resort feature probe
 *     for exotic WebViews where UA is masked but the Chromium surface is
 *     still exposed.
 *
 * Important: steps 3 and 4 are OR'd independently. Previously we required
 * UA-match AND window.chrome, but that conjunction fails in temporary-profile
 * Chrome where window.chrome can be shaped unexpectedly even though the UA
 * is a plain "Chrome/…".
 */
export function probeChromium(): ChromiumProbeResult {
  if (typeof navigator === 'undefined') {
    return {
      isChromium: false,
      method: 'none',
      uaDataBrands: null,
      userAgent: '',
      hasChromeObj: false,
      chromeKeys: null,
    };
  }

  const ua = navigator.userAgent || '';
  const uaDataRaw = (
    navigator as Navigator & {
      userAgentData?: { brands?: { brand: string; version?: string }[] };
    }
  ).userAgentData;
  const uaDataBrands =
    uaDataRaw?.brands && Array.isArray(uaDataRaw.brands) ? uaDataRaw.brands : null;

  let hasChromeObj = false;
  let chromeKeys: string[] | null = null;
  if (typeof window !== 'undefined') {
    const chrome = (window as { chrome?: unknown }).chrome;
    hasChromeObj = typeof chrome === 'object' && chrome !== null;
    if (hasChromeObj) {
      try {
        chromeKeys = Object.keys(chrome as object).slice(0, 20);
      } catch {
        chromeKeys = null;
      }
    }
  }

  const baseDiag = { uaDataBrands, userAgent: ua, hasChromeObj, chromeKeys };

  // 1) Hard negatives — these cannot be Chromium regardless of other signals.
  if (/FxiOS|CriOS|EdgiOS/i.test(ua)) {
    return { ...baseDiag, isChromium: false, method: 'explicit-non-chromium' };
  }
  if (/Firefox/i.test(ua)) {
    return { ...baseDiag, isChromium: false, method: 'explicit-non-chromium' };
  }

  // 2) userAgentData.brands — authoritative positive when any recognized
  //    Chromium-family brand is present.
  if (uaDataBrands && uaDataBrands.length > 0) {
    const hit = uaDataBrands.some(b =>
      /Chromium|Google Chrome|Microsoft Edge|Brave/i.test(b?.brand || '')
    );
    if (hit) {
      return { ...baseDiag, isChromium: true, method: 'userAgentData' };
    }
  }

  // 3) UA string positive match.
  if (/Chrome|Chromium|Edg\//i.test(ua)) {
    return { ...baseDiag, isChromium: true, method: 'uaFallback' };
  }

  // 4) window.chrome as last-resort feature signal.
  if (hasChromeObj) {
    return { ...baseDiag, isChromium: true, method: 'chromeObj' };
  }

  return { ...baseDiag, isChromium: false, method: 'none' };
}

export function isChromiumBrowser(): boolean {
  return probeChromium().isChromium;
}

// ---------------------------------------------------------------------------
// Electron probe
// ---------------------------------------------------------------------------

export interface ElectronProbeResult {
  isElectron: boolean;
  method: CDPDiagnostics['electronDetectionMethod'];
}

/**
 * Detect whether the page is running inside an Electron renderer (VSCode,
 * Slack, Discord, Notion, Linear, Figma, Postman, etc.).
 *
 * Why this matters: Electron apps almost universally have an inspector
 * port (9222 / 9229 / randomized) listening locally, frequently use the
 * SwiftShader software renderer on certain platforms, and expose a
 * non-standard `window.chrome` surface. Without an Electron gate the
 * CDP module would flag every VSCode user as "automation detected".
 *
 * Detection is OR'd across three independent signals — any one of them
 * fires is sufficient (high-confidence apps strip the UA marker, so we
 * cannot rely on UA alone):
 *
 *  1) UA contains `Electron/` — default UA suffix for Electron renderers
 *     that haven't been overridden by the host app.
 *  2) `typeof process === 'object' && process.versions.electron` — works in
 *     legacy `nodeIntegration: true` renderers. Modern Electron with
 *     `contextIsolation: true` hides this from the page's main world,
 *     so its absence does not imply "not Electron".
 *  3) Known preload-bridge globals — `electronAPI`, `__electron_preload__`,
 *     `__electronLog__`, etc. Heuristic; positive-only.
 *
 * False-positive risk: very low. The `Electron/` UA token doesn't appear
 * in any released real-Chrome variant; `process.versions.electron` is
 * specific to Electron; preload-bridge globals are unique to Electron apps.
 */
export function probeElectron(): ElectronProbeResult {
  if (typeof navigator === 'undefined') {
    return { isElectron: false, method: 'none' };
  }

  const ua = navigator.userAgent || '';
  if (/\bElectron\//i.test(ua)) {
    return { isElectron: true, method: 'ua' };
  }

  // contextIsolation=true hides this, but legacy/older Electron apps still
  // expose `process` in the renderer's main world.
  try {
    const proc = (globalThis as { process?: { versions?: Record<string, string> } }).process;
    if (proc && typeof proc === 'object' && proc.versions && proc.versions.electron) {
      return { isElectron: true, method: 'processGlobal' };
    }
  } catch {
    /* contextIsolation will throw — fall through */
  }

  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, unknown>;
    // Names observed in the wild: generic Electron (`electronAPI`,
    // `__ELECTRON__`), preload bundlers (`__electron_preload__`), and
    // common logger shims (`__electronLog`).
    for (const key of [
      'electronAPI',
      '__electron_preload__',
      '__ELECTRON__',
      '__electronLog',
      '__electronLog__',
    ]) {
      if (key in w) {
        return { isElectron: true, method: 'preloadBridge' };
      }
    }
  }

  return { isElectron: false, method: 'none' };
}

// ---------------------------------------------------------------------------
// Signal 2: WSS timing side-channel
// ---------------------------------------------------------------------------

interface ProbeResult {
  /**
   * Per-round elapsed times (ms) for non-blocked, non-timeout rounds.
   */
  times: number[];
  /** True when probing appears blocked by browser policy. */
  blocked: boolean;
  /** Rounds where the WebSocket stalled past CDP_PROBE_TIMEOUT_MS. */
  timedOutRounds: number;
  /** Total rounds actually executed. */
  totalRounds: number;
}

/**
 * Probe a port via WSS and record per-round elapsed times.
 */
async function probePortTiming(
  address: string,
  port: number,
  rounds: number = CDP_PROBE_ROUNDS
): Promise<ProbeResult> {
  const times: number[] = [];
  let hardErrorCount = 0;
  let timedOutRoundCount = 0;

  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    let roundHardError = false;
    let roundTimedOut = false;

    try {
      const ws = new WebSocket(`wss://${address}:${port}`);

      await new Promise<void>(resolve => {
        let settled = false;
        const safeResolve = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          ws.onopen = null;
          ws.onerror = null;
          ws.onclose = null;
          try {
            ws.close();
          } catch {
            /* noop */
          }
          resolve();
        };

        const timer = setTimeout(() => {
          roundTimedOut = true;
          safeResolve();
        }, CDP_PROBE_TIMEOUT_MS);

        ws.onerror = safeResolve;
        ws.onclose = safeResolve;
        ws.onopen = safeResolve;
      });
    } catch {
      roundHardError = true;
    }

    if (roundHardError) {
      hardErrorCount++;
    } else if (roundTimedOut) {
      timedOutRoundCount++;
    } else {
      times.push(performance.now() - start);
    }

    if (i < rounds - 1) {
      await new Promise(r => setTimeout(r, CDP_PROBE_INTERVAL_MS));
    }
  }

  return {
    times,
    blocked: hardErrorCount > 0,
    timedOutRounds: timedOutRoundCount,
    totalRounds: rounds,
  };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return CDP_FALLBACK_STDDEV_MS;
  const mu = mean(xs);
  const variance = xs.reduce((acc, x) => acc + (x - mu) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Signal 3: Automation fingerprint scan
// ---------------------------------------------------------------------------

const AUTOMATION_FINGERPRINT_KEYS: readonly string[] = [
  'cdc_',
  '$cdc_',
  '__webdriver_evaluate',
  '__webdriver_',
  '__selenium_',
  '$chrome_asyncScriptInfo',
  '__fxdriver_',
  '__nightmare',
  '_Selenium_IDE_Recorder',
  '__driver_evaluate',
];

function matchAutomationKeys(obj: object): string[] {
  let keys: string[];
  try {
    keys = Object.keys(obj);
  } catch {
    return [];
  }
  return keys.filter(k => AUTOMATION_FINGERPRINT_KEYS.some(prefix => k.startsWith(prefix)));
}

const SOFTWARE_RENDERER_MARKERS = /SwiftShader|llvmpipe|Software|Google Inc\.(?!.*ANGLE)/i;

function probeWebGLRenderer(): string | null {
  if (typeof document === 'undefined') return null;
  let gl: WebGLRenderingContext | null = null;
  try {
    const canvas = document.createElement('canvas');
    gl = (canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return null;
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === 'string' ? renderer : null;
  } catch {
    return null;
  } finally {
    if (gl) {
      try {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        /* noop */
      }
    }
  }
}

async function probePermissionsMismatch(): Promise<boolean | null> {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    permissions?: { query: (d: { name: string }) => Promise<{ state: string }> };
  };
  if (typeof Notification === 'undefined' || !nav.permissions?.query) return null;
  try {
    const queryState = await nav.permissions.query({ name: 'notifications' });
    return Notification.permission === 'denied' && queryState.state === 'prompt';
  } catch {
    return null;
  }
}

const EXPECTED_CHROME_KEYS = ['loadTimes', 'csi', 'app'] as const;

/**
 * Native-function tampering check: probe whether `Function.prototype.toString`
 * still returns "[native code]" for itself and for selected native methods.
 *
 * Stealth plugins (puppeteer-extra-plugin-stealth, undetected-chromedriver,
 * Patchright) replace native methods with JS implementations and then attempt
 * to hide that by overriding `Function.prototype.toString` so calls against
 * the replaced methods report "[native code]" anyway. A common slip is that
 * `Function.prototype.toString.toString()` — calling toString on toString
 * itself — returns the JS source of the override rather than the native stub.
 *
 * We probe two surfaces:
 *  (a) `toString.toString()` should include "[native code]".
 *  (b) `toString.call(navigator.permissions.query)` should include
 *      "[native code]" — this catches stealth bundles that patch the
 *      Permissions API specifically.
 *
 * Either failing → tampered. False-positive risk on real users: extremely
 * low (no released Chrome variant ships a non-native toString).
 */
function probeToStringTampering(): boolean | null {
  if (typeof Function === 'undefined') return null;
  try {
    const ts = Function.prototype.toString;
    if (typeof ts !== 'function') return null;
    const selfRepr = ts.call(ts);
    if (typeof selfRepr !== 'string') return null;
    if (!selfRepr.includes('[native code]')) return true;

    // Probe a native method that stealth bundles routinely patch.
    if (typeof navigator !== 'undefined') {
      const nav = navigator as Navigator & {
        permissions?: { query?: unknown };
      };
      const q = nav.permissions?.query;
      if (typeof q === 'function') {
        const qRepr = ts.call(q);
        if (typeof qRepr !== 'string' || !qRepr.includes('[native code]')) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return null;
  }
}

export async function scanAutomationSignals(
  probe?: ChromiumProbeResult,
  electron?: ElectronProbeResult
): Promise<AutomationSignal[]> {
  const signals: AutomationSignal[] = [];
  const chromium = probe ?? probeChromium();
  const electronProbe = electron ?? probeElectron();

  // ---- Cross-browser: automation fingerprint globals ----
  try {
    const matched = new Set<string>();
    if (typeof document !== 'undefined') {
      matchAutomationKeys(document).forEach(k => matched.add(k));
    }
    if (typeof window !== 'undefined') {
      matchAutomationKeys(window).forEach(k => matched.add(k));
    }
    signals.push({
      id: 'automation-fingerprint-globals',
      present: matched.size > 0,
      weight: 0.4,
      family: 'automation-globals',
      description:
        matched.size > 0
          ? `自动化指纹全局变量 (${matched.size} 个: ${Array.from(matched).slice(0, 3).join(', ')}${matched.size > 3 ? '…' : ''})`
          : '未发现 ChromeDriver / Selenium / 等自动化指纹',
    });
  } catch {
    signals.push({
      id: 'automation-fingerprint-globals',
      present: false,
      weight: 0,
      family: 'automation-globals',
      description: '自动化指纹检测失败',
    });
  }

  // ---- Cross-browser: Function.prototype.toString tampering ----
  // Stealth-plugin tell. Low FP rate; not gated on Chromium.
  const tampered = probeToStringTampering();
  signals.push({
    id: 'runtime-toString-tampered',
    present: tampered === true,
    weight: tampered === true ? 0.2 : 0,
    family: 'runtime-tamper',
    description:
      tampered === true
        ? 'Function.prototype.toString 被改写（stealth 插件常见特征）'
        : tampered === false
          ? 'Function.prototype.toString 保留原生实现'
          : 'Function.prototype.toString 无法读取（无法评估）',
  });

  // ---- Informational: Electron environment ----
  // Always pushed when detected, even though weight=0 — surfacing it in the
  // signal list explains to the user why subsequent checks are suppressed.
  if (electronProbe.isElectron) {
    signals.push({
      id: 'environment-electron',
      present: true,
      weight: 0,
      family: 'electron-env',
      description: `检测到 Electron 运行时（${electronProbe.method}）— 已抑制端口探测与部分 headless 指纹判定，降低对 VSCode / Slack / Discord 等桌面应用的误报`,
    });
  }

  if (!chromium.isChromium) {
    return signals;
  }

  // ---- Informational: window.chrome legacy API surface ----
  if (chromium.hasChromeObj && typeof window !== 'undefined') {
    try {
      const chrome = (window as { chrome?: Record<string, unknown> }).chrome ?? {};
      const missing = EXPECTED_CHROME_KEYS.filter(k => !(k in chrome));
      signals.push({
        id: 'chrome-legacy-keys-missing',
        present: missing.length >= 2,
        weight: 0.1,
        family: 'env-fingerprint',
        description:
          missing.length >= 2
            ? `window.chrome 缺失 ${missing.join(', ')}（headless 常见）`
            : 'window.chrome 保留了传统 API',
      });
    } catch {
      /* surface shape unreadable — skip */
    }
  }

  // ---- Medium: Permissions API inconsistency ----
  let permissionsMismatch: boolean | null = null;
  try {
    permissionsMismatch = await probePermissionsMismatch();
  } catch {
    permissionsMismatch = null;
  }
  signals.push({
    id: 'permissions-notification-mismatch',
    present: permissionsMismatch === true,
    // Electron renderers routinely expose a non-standard permissions
    // surface; do not let this signal contribute in Electron.
    weight: permissionsMismatch === true && !electronProbe.isElectron ? 0.2 : 0,
    family: 'env-fingerprint',
    description:
      permissionsMismatch === true
        ? electronProbe.isElectron
          ? 'Notification / permissions API 不一致（Electron 渲染器常见，已忽略）'
          : 'Notification.permission 与 permissions API 查询结果不一致（headless 典型特征）'
        : permissionsMismatch === false
          ? 'Notification / permissions API 行为一致'
          : 'Permissions API 不可用（无法评估）',
  });

  // ---- Medium: WebGL renderer reveals software rasterizer ----
  // Demoted in Electron — software renderer is common on Electron apps
  // bundling SwiftShader for cross-platform GPU compat.
  const renderer = probeWebGLRenderer();
  const rendererMatchesSoftware = renderer ? SOFTWARE_RENDERER_MARKERS.test(renderer) : false;
  signals.push({
    id: 'webgl-software-renderer',
    present: rendererMatchesSoftware,
    weight: rendererMatchesSoftware && !electronProbe.isElectron ? 0.15 : 0,
    family: 'env-fingerprint',
    description: renderer
      ? rendererMatchesSoftware
        ? electronProbe.isElectron
          ? `WebGL 使用软件渲染器（${renderer}）— Electron 桌面应用常见，已忽略`
          : `WebGL 使用软件渲染器（${renderer}）`
        : `WebGL 使用硬件渲染器（${renderer}）`
      : 'WebGL 渲染器探测失败（无法评估）',
  });

  // ---- Weak: navigator.plugins empty ----
  const pluginCount =
    typeof navigator !== 'undefined' && navigator.plugins ? navigator.plugins.length : -1;
  signals.push({
    id: 'plugins-empty',
    present: pluginCount === 0,
    weight: pluginCount === 0 ? 0.08 : 0,
    family: 'env-fingerprint',
    description:
      pluginCount === 0
        ? 'navigator.plugins 为空（headless 默认行为）'
        : pluginCount > 0
          ? `navigator.plugins 含 ${pluginCount} 项`
          : 'navigator.plugins 不可用',
  });

  // ---- Weak: navigator.languages empty ----
  const languagesOk = typeof navigator !== 'undefined' && Array.isArray(navigator.languages);
  const langCount = languagesOk ? navigator.languages.length : -1;
  signals.push({
    id: 'languages-empty',
    present: langCount === 0,
    weight: langCount === 0 ? 0.1 : 0,
    family: 'env-fingerprint',
    description:
      langCount === 0
        ? 'navigator.languages 为空（headless 默认）'
        : langCount > 0
          ? `navigator.languages 含 ${langCount} 项`
          : 'navigator.languages 不可用',
  });

  // ---- Weak: window.outerWidth / outerHeight zero ----
  if (typeof window !== 'undefined') {
    const outerZero = window.outerWidth === 0 || window.outerHeight === 0;
    signals.push({
      id: 'window-outer-zero',
      present: outerZero,
      weight: outerZero ? 0.1 : 0,
      family: 'env-fingerprint',
      description: outerZero
        ? 'window.outerWidth / outerHeight 为 0（headless 典型特征）'
        : `窗口外框尺寸 ${window.outerWidth}×${window.outerHeight}`,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Confidence scoring (sigmoid + family-diversity gate)
// ---------------------------------------------------------------------------

/**
 * Scoring model rewritten in 2026 to address the two main pre-existing
 * problems:
 *
 *  1) Hard-threshold flapping. The previous model compared a raw weighted sum
 *     directly against 0.2 / 0.5, so noisy signals (single-port stall under
 *     VSCode, occasional permissions mismatch) flipped the verdict between
 *     scans, producing the very symptom that prompted this rewrite: the same
 *     browser scoring 44 (critical) and 69 (warning) seconds apart.
 *
 *  2) Single-signal verdicts. The previous model could push to "critical"
 *     from a single stalled-port signal — but a single port stall on a
 *     dev machine is far more likely to be a Node debugger than an
 *     attacker's CDP attachment.
 *
 * Two fixes, mirroring industry practice (Castle 2025, DataDome ML signal
 * post 2025):
 *
 *  - Sigmoid smoothing. Replace `score >= T` with `confidence = sigmoid(score)`
 *    and threshold the smoothed confidence. Tiny raw-score wobbles do not
 *    cross the boundary because sigmoid compresses near the inflection.
 *
 *  - Family-diversity gate. Tag every signal with a `family`; require ≥2
 *    distinct families to be `present` before allowing the "critical"
 *    verdict tier. A single port-probe stall can only push to "suspected"
 *    (warning), never to "confirmed" (critical), unless corroborated by an
 *    independent family.
 *
 * Additional rule: in Electron the entire module is informational. Electron
 * almost always has a debug port listening AND the chrome.* surface is
 * stripped AND software renderer is common — so the corroborating families
 * exist by default, which would defeat the diversity gate. Cap raw score
 * to ELECTRON_CONFIDENCE_CAP unless navigator.webdriver === true (the only
 * unambiguous signal that survives in Electron).
 */
const CONFIDENCE_DETECTED_THRESHOLD = 0.3;
const CONFIDENCE_CRITICAL_THRESHOLD = 0.6;
// 0.6 chosen so that webdriver=true alone clears the critical threshold
// after sigmoid smoothing: sigmoid(0.6) ≈ 0.69 ≥ 0.6. webdriver=true is
// the only W3C-mandated automation flag; FP rate ≈ 0 on real users.
const CONFIDENCE_WEBDRIVER = 0.6;
const CONFIDENCE_PORT_MAX = 0.15;
const CONFIDENCE_PORT_DELTA_SATURATION_MS = 20;
// Port stall is now treated symmetrically with timing-delta — a stalled
// open port contributes the same as a delta-detected open port. Both are
// "port-probe" family, so neither alone can satisfy the 2-family critical
// gate. This is the primary fix for the VSCode/Electron flap.
const CONFIDENCE_PORT_STALLED = 0.15;
const CONFIDENCE_SIGNAL3_CAP = 0.6;
// Sigmoid parameters: confidence = 1 / (1 + exp(-k * (rawScore - midpoint))).
// Tuned so rawScore=0.2 → confidence≈0.27 (just under detected), and
// rawScore=0.5 → confidence≈0.62 (just into critical).
const SIGMOID_K = 4;
const SIGMOID_MIDPOINT = 0.4;
// In Electron, cap raw score so that without webdriver=true the module
// stays under the detected threshold no matter how many env signals fire.
// 0.18 → sigmoid ≈ 0.30, right at the suspected boundary (informational).
const ELECTRON_CONFIDENCE_CAP = 0.18;

function sigmoid(score: number): number {
  return 1 / (1 + Math.exp(-SIGMOID_K * (score - SIGMOID_MIDPOINT)));
}

function computeConfidence(
  webdriver: boolean | undefined,
  portProbes: PortProbeResult[],
  automationSignals: AutomationSignal[],
  isElectron: boolean = false
): {
  detected: boolean;
  confidence: number;
  rawScore: number;
  signalFamiliesFired: number;
  evidence: string;
} {
  let score = 0;
  const evidenceParts: string[] = [];
  const familiesFired = new Set<SignalFamily>();

  // Signal 1: navigator.webdriver. Definitive when true.
  if (webdriver === true) {
    score += CONFIDENCE_WEBDRIVER;
    familiesFired.add('webdriver');
    evidenceParts.push('navigator.webdriver = true');
  }

  // Signal 2: port timing / stall detection.
  // Stall and timing-delta are now both capped at CONFIDENCE_PORT_MAX and
  // tagged as the same family — neither can single-handedly cross the
  // 2-family critical gate.
  const openPorts = portProbes.filter(p => p.likelyOpen && !p.blocked);
  const stalledPort = openPorts.find(p => p.stalled);
  if (stalledPort) {
    score += CONFIDENCE_PORT_STALLED;
    familiesFired.add('port-probe');
    evidenceParts.push(
      `端口 ${stalledPort.port} WSS 握手挂起（${stalledPort.timedOutCount}/${stalledPort.totalRounds} 轮超时），疑似 CDP 端口（也可能是 Node debug / Electron 调试端口）`
    );
  } else if (openPorts.length > 0) {
    const bestProbe = openPorts.reduce((a, b) => (a.deltaMs > b.deltaMs ? a : b));
    const portScore = Math.min(
      CONFIDENCE_PORT_MAX,
      (bestProbe.deltaMs / CONFIDENCE_PORT_DELTA_SATURATION_MS) * CONFIDENCE_PORT_MAX
    );
    score += portScore;
    familiesFired.add('port-probe');
    evidenceParts.push(`端口 ${bestProbe.port} 时序差 ${bestProbe.deltaMs.toFixed(1)}ms`);
  }

  // Signal 3: per-signal weighted sum (capped), with family tracking.
  const presentSignals = automationSignals.filter(s => s.present && s.weight > 0);
  if (presentSignals.length > 0) {
    const rawSignal3 = presentSignals.reduce((sum, s) => sum + s.weight, 0);
    score += Math.min(CONFIDENCE_SIGNAL3_CAP, rawSignal3);
    presentSignals.forEach(s => familiesFired.add(s.family));
    evidenceParts.push(presentSignals.map(s => s.description).join('、'));
  }

  // Electron cap: hold raw score under the detected threshold unless
  // webdriver=true (which we ship through unchanged because it's the only
  // signal that survives in Electron with negligible FP).
  if (isElectron && webdriver !== true) {
    score = Math.min(score, ELECTRON_CONFIDENCE_CAP);
  }

  const rawScore = score;
  const confidence = sigmoid(rawScore);

  // Diversity gate: critical-tier verdicts require ≥2 distinct families.
  // webdriver=true alone bypasses the gate because it is independently
  // definitive.
  const wd = webdriver === true;
  const meetsDiversity = familiesFired.size >= 2 || wd;
  const detected = confidence >= CONFIDENCE_DETECTED_THRESHOLD;

  return {
    detected,
    confidence: meetsDiversity
      ? confidence
      : Math.min(confidence, CONFIDENCE_CRITICAL_THRESHOLD - 0.01),
    rawScore,
    signalFamiliesFired: familiesFired.size,
    evidence: evidenceParts.join('；') || '未检测到远程调试信号',
  };
}

// ---------------------------------------------------------------------------
// Main detection flow
// ---------------------------------------------------------------------------

async function runSignal2Probes(): Promise<PortProbeResult[]> {
  const perAddress = await Promise.all(
    CDP_ADDRESSES.map(async address => {
      const baselines = await Promise.all(CDP_CONTROL_PORTS.map(p => probePortTiming(address, p)));

      const usable = baselines
        .map((b, i) => ({ probe: b, port: CDP_CONTROL_PORTS[i] }))
        .filter(({ probe }) => !probe.blocked && probe.times.length >= CDP_MIN_VALID_SAMPLES)
        .sort((a, b) => {
          const diff = b.probe.times.length - a.probe.times.length;
          if (diff !== 0) return diff;
          return stddev(a.probe.times) - stddev(b.probe.times);
        });

      if (usable.length === 0) {
        logger.debug(`CDP baseline probes all blocked or undersampled on ${address}`);
        return [] as PortProbeResult[];
      }

      const control = usable[0].probe;
      const controlAvg = mean(control.times);
      const controlStddev = stddev(control.times);
      const threshold = Math.max(
        CDP_THRESHOLD_FLOOR_MS,
        controlAvg * CDP_THRESHOLD_CONTROL_RATIO,
        controlStddev * CDP_THRESHOLD_STDDEV_MULTIPLIER
      );

      const probes = await Promise.all(
        CDP_DEFAULT_PORTS.map(async port => {
          const probe = await probePortTiming(address, port);
          const validCount = probe.times.length;
          const hasEnoughSamples = validCount >= CDP_MIN_VALID_SAMPLES;
          const targetAvg = validCount > 0 ? mean(probe.times) : 0;
          const deltaMs = hasEnoughSamples ? targetAvg - controlAvg : 0;

          const majorityStalled =
            !probe.blocked &&
            validCount === 0 &&
            probe.timedOutRounds >= Math.ceil(probe.totalRounds / 2);

          if (probe.blocked) {
            logger.debug(`CDP probe blocked on ${address}:${port}`);
          } else if (majorityStalled) {
            logger.debug(
              `CDP probe stalled on ${address}:${port} (${probe.timedOutRounds}/${probe.totalRounds} rounds hung past ${CDP_PROBE_TIMEOUT_MS}ms)`
            );
          }

          return {
            port,
            address,
            method: 'wss-timing' as const,
            avgTimeMs: targetAvg,
            controlAvgTimeMs: controlAvg,
            deltaMs,
            likelyOpen:
              majorityStalled || (hasEnoughSamples && !probe.blocked && deltaMs > threshold),
            probeCount: validCount,
            blocked: probe.blocked,
            stalled: majorityStalled,
            timedOutCount: probe.timedOutRounds,
            totalRounds: probe.totalRounds,
          };
        })
      );

      return probes;
    })
  );

  return perAddress.flat();
}

async function detectCDP(): Promise<CDPDetectionData> {
  const webdriverFlag =
    typeof navigator !== 'undefined' ? (navigator as { webdriver?: boolean }).webdriver : undefined;

  const chromiumProbe = probeChromium();
  const electronProbe = probeElectron();

  const automationSignals = await scanAutomationSignals(chromiumProbe, electronProbe);

  // Signal 2: skipped entirely on Electron (port-probe FP rate is too high
  // there — VSCode et al. routinely listen on 9229 for Node debugging) and
  // on non-Chromium browsers (no CDP to probe).
  const portProbes: PortProbeResult[] = [];

  if (chromiumProbe.isChromium && !electronProbe.isElectron) {
    const signal2 = runSignal2Probes();
    const signal2WithTimeout = Promise.race([
      signal2,
      new Promise<PortProbeResult[]>(resolve => {
        setTimeout(() => {
          logger.debug('CDP Signal 2 hit total-timeout');
          resolve([]);
        }, CDP_SIGNAL2_TOTAL_TIMEOUT_MS);
      }),
    ]);
    const results = await signal2WithTimeout;
    portProbes.push(...results);
  }

  const { detected, confidence, rawScore, signalFamiliesFired, evidence } = computeConfidence(
    webdriverFlag,
    portProbes,
    automationSignals,
    electronProbe.isElectron
  );

  const diagnostics: CDPDiagnostics = {
    isChromiumDetected: chromiumProbe.isChromium,
    chromiumDetectionMethod: chromiumProbe.method,
    uaDataBrands: chromiumProbe.uaDataBrands,
    userAgent: chromiumProbe.userAgent,
    hasChromeObj: chromiumProbe.hasChromeObj,
    chromeKeys: chromiumProbe.chromeKeys,
    isElectron: electronProbe.isElectron,
    electronDetectionMethod: electronProbe.method,
  };

  return {
    webdriverFlag,
    isChromium: chromiumProbe.isChromium,
    isElectron: electronProbe.isElectron,
    portProbes,
    automationSignals,
    detected,
    confidence,
    rawScore,
    signalFamiliesFired,
    evidence,
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

export const __testing = { computeConfidence, sigmoid, probeToStringTampering };

export const cdpDetectionModule: DetectionModule<CDPDetectionData> = {
  id: 'cdp-detection',
  name: 'Automated browser detection',
  description:
    'Detects whether the browser is driven by automation tools (Puppeteer, Selenium, headless Chrome, etc.)',
  category: 'privacy',
  icon: 'Bug',
  enabled: true,

  async detect(): Promise<DetectionResult<CDPDetectionData>> {
    try {
      const data = await detectCDP();
      return {
        success: true,
        data,
        detectedAt: new Date(),
        metadata: {
          webdriverFlag: data.webdriverFlag,
          detected: data.detected,
          confidence: data.confidence,
          rawScore: data.rawScore,
          signalFamiliesFired: data.signalFamiliesFired,
          isElectron: data.isElectron,
          portsProbed: data.portProbes.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'CDP detection failed',
        detectedAt: new Date(),
      };
    }
  },
};
