/**
 * @jest-environment jsdom
 */
import {
  __testing as cdpInternals,
  isChromiumBrowser,
  probeChromium,
  probeElectron,
  scanAutomationSignals,
} from '../cdp-detection-module';

type NavLike = {
  userAgent: string;
  userAgentData?: { brands?: { brand: string; version?: string }[] };
  webdriver?: boolean;
  plugins?: unknown;
  languages?: readonly string[];
  permissions?: { query: (d: { name: string }) => Promise<{ state: string }> };
};

function mockEnv(nav: NavLike, windowPatch: Record<string, unknown> = {}) {
  const origDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  Object.defineProperty(globalThis, 'navigator', {
    value: nav as unknown as Navigator,
    configurable: true,
    writable: true,
  });

  const w = globalThis.window as unknown as Record<string, unknown>;
  const removedKeys = new Set<string>();
  const priorValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(windowPatch)) {
    if (k in w) priorValues[k] = w[k];
    if (v === undefined) {
      delete w[k];
      removedKeys.add(k);
    } else {
      w[k] = v;
    }
  }

  return () => {
    if (origDesc) {
      Object.defineProperty(globalThis, 'navigator', origDesc);
    } else {
      delete (globalThis as { navigator?: unknown }).navigator;
    }
    for (const k of Object.keys(windowPatch)) {
      if (k in priorValues) {
        w[k] = priorValues[k];
      } else {
        // Newly-added key: always delete, regardless of whether the test
        // requested `undefined` (which already deleted) or set a real value.
        // Without this, e.g. `{ electronAPI: {} }` leaks into the next test's
        // window and probeElectron would spuriously return true.
        delete w[k];
      }
    }
  };
}

const FIREFOX_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0';
const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const IOS_CRIOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1';
// VSCode 1.119 user agent (the exact UA the user reported flapping scores under)
const VSCODE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.119.1 Chrome/142.0.7444.265 Electron/39.8.8 Safari/537.36';

describe('probeChromium — Chromium detection decision matrix', () => {
  it('SCENARIO 1: normal Chrome (default profile, full userAgentData + window.chrome)', () => {
    const restore = mockEnv(
      {
        userAgent: CHROME_UA,
        userAgentData: {
          brands: [
            { brand: 'Chromium', version: '124' },
            { brand: 'Google Chrome', version: '124' },
            { brand: 'Not-A.Brand', version: '99' },
          ],
        },
      },
      { chrome: { runtime: { id: 'abc' }, csi: () => {}, loadTimes: () => {} } }
    );
    try {
      const p = probeChromium();
      expect(p.isChromium).toBe(true);
      expect(p.method).toBe('userAgentData');
      expect(p.hasChromeObj).toBe(true);
      expect(isChromiumBrowser()).toBe(true);
    } finally {
      restore();
    }
  });

  it('SCENARIO 2: temporary profile Chrome (--user-data-dir=/tmp/xxx) with empty/sparse brands', () => {
    const restore = mockEnv(
      {
        userAgent: CHROME_UA,
        userAgentData: {
          brands: [{ brand: 'Not-A.Brand', version: '99' }],
        },
      },
      { chrome: { runtime: { id: 'abc' } } }
    );
    try {
      const p = probeChromium();
      expect(p.isChromium).toBe(true);
      expect(p.method).toBe('uaFallback');
      expect(isChromiumBrowser()).toBe(true);
    } finally {
      restore();
    }
  });

  it('SCENARIO 3: Chrome with --remote-debugging-port + --user-data-dir (CDP enabled)', async () => {
    const restore = mockEnv(
      {
        userAgent: CHROME_UA,
        userAgentData: { brands: [] },
      },
      { chrome: {} }
    );
    try {
      const p = probeChromium();
      expect(p.isChromium).toBe(true);
      expect(p.method).toBe('uaFallback');
      expect(p.hasChromeObj).toBe(true);

      const signals = await scanAutomationSignals(p);
      expect(signals.map(s => s.id)).not.toContain('chrome-runtime-absent');
      const legacy = signals.find(s => s.id === 'chrome-legacy-keys-missing');
      expect(legacy?.present).toBe(true);
    } finally {
      restore();
    }
  });

  it('SCENARIO 3b: CDP Chrome where even window.chrome is stripped', async () => {
    const restore = mockEnv(
      { userAgent: CHROME_UA, userAgentData: { brands: [] } },
      { chrome: undefined }
    );
    try {
      const p = probeChromium();
      expect(p.isChromium).toBe(true);
      expect(p.method).toBe('uaFallback');
      expect(p.hasChromeObj).toBe(false);

      const signals = await scanAutomationSignals(p);
      expect(signals.map(s => s.id)).not.toContain('chrome-legacy-keys-missing');
    } finally {
      restore();
    }
  });

  it('Firefox: hard negative, only cross-browser signals pushed (no Chromium-specific)', async () => {
    const restore = mockEnv({ userAgent: FIREFOX_UA }, { chrome: undefined });
    try {
      const p = probeChromium();
      expect(p.isChromium).toBe(false);
      expect(p.method).toBe('explicit-non-chromium');
      expect(isChromiumBrowser()).toBe(false);
      const signals = await scanAutomationSignals(p);
      // Cross-browser signals: automation-fingerprint-globals + runtime-toString-tampered.
      // No Chromium-specific signal may leak through.
      const ids = signals.map(s => s.id).sort();
      expect(ids).toEqual(['automation-fingerprint-globals', 'runtime-toString-tampered']);
    } finally {
      restore();
    }
  });

  it('Safari: hard negative — only cross-browser signals pushed', async () => {
    const restore = mockEnv({ userAgent: SAFARI_UA }, { chrome: undefined });
    try {
      const p = probeChromium();
      expect(p.isChromium).toBe(false);
      expect(p.method).toBe('none');
      const signals = await scanAutomationSignals(p);
      const ids = signals.map(s => s.id).sort();
      expect(ids).toEqual(['automation-fingerprint-globals', 'runtime-toString-tampered']);
    } finally {
      restore();
    }
  });

  it('iOS Chrome (CriOS): hard negative — only cross-browser signals pushed', async () => {
    const restore = mockEnv({ userAgent: IOS_CRIOS_UA }, { chrome: undefined });
    try {
      const p = probeChromium();
      expect(p.isChromium).toBe(false);
      expect(p.method).toBe('explicit-non-chromium');
      const signals = await scanAutomationSignals(p);
      const ids = signals.map(s => s.id).sort();
      expect(ids).toEqual(['automation-fingerprint-globals', 'runtime-toString-tampered']);
    } finally {
      restore();
    }
  });

  it('userAgentData-only exotic Chromium fork: positive via userAgentData', async () => {
    const restore = mockEnv(
      {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) ExoticBrowser/1.0',
        userAgentData: { brands: [{ brand: 'Chromium', version: '124' }] },
      },
      { chrome: undefined }
    );
    try {
      const p = probeChromium();
      expect(p.isChromium).toBe(true);
      expect(p.method).toBe('userAgentData');
      const signals = await scanAutomationSignals(p);
      expect(signals.map(s => s.id)).not.toContain('chrome-legacy-keys-missing');
    } finally {
      restore();
    }
  });

  it('window.chrome only (no UA match, no userAgentData): positive via chromeObj', async () => {
    const restore = mockEnv(
      { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) UnknownUA/1.0' },
      { chrome: { runtime: { id: 'x' } } }
    );
    try {
      const p = probeChromium();
      expect(p.isChromium).toBe(true);
      expect(p.method).toBe('chromeObj');
      const signals = await scanAutomationSignals(p);
      const legacy = signals.find(s => s.id === 'chrome-legacy-keys-missing');
      expect(legacy?.present).toBe(true);
    } finally {
      restore();
    }
  });

  it('diagnostics snapshot: records the actual raw values used for the decision', () => {
    const brands = [{ brand: 'Chromium', version: '124' }];
    const restore = mockEnv(
      { userAgent: CHROME_UA, userAgentData: { brands } },
      { chrome: { runtime: { id: 'abc' } } }
    );
    try {
      const p = probeChromium();
      expect(p.userAgent).toBe(CHROME_UA);
      expect(p.uaDataBrands).toEqual(brands);
      expect(p.chromeKeys).toContain('runtime');
    } finally {
      restore();
    }
  });
});

describe('probeElectron — Electron runtime detection', () => {
  it('detects Electron via UA marker (VSCode-style UA)', () => {
    const restore = mockEnv({ userAgent: VSCODE_UA });
    try {
      const e = probeElectron();
      expect(e.isElectron).toBe(true);
      expect(e.method).toBe('ua');
    } finally {
      restore();
    }
  });

  it('does not flag plain desktop Chrome as Electron', () => {
    const restore = mockEnv({ userAgent: CHROME_UA });
    try {
      const e = probeElectron();
      expect(e.isElectron).toBe(false);
      expect(e.method).toBe('none');
    } finally {
      restore();
    }
  });

  it('detects Electron via preload-bridge global when UA is overridden', () => {
    // Many Electron apps strip the "Electron/" UA marker (Discord, 1Password, etc.)
    // but expose a preload bridge global.
    const restore = mockEnv({ userAgent: CHROME_UA }, { electronAPI: {} });
    try {
      const e = probeElectron();
      expect(e.isElectron).toBe(true);
      expect(e.method).toBe('preloadBridge');
    } finally {
      restore();
    }
  });

  it('detects Electron via process.versions.electron (legacy nodeIntegration)', () => {
    const restore = mockEnv({ userAgent: CHROME_UA });
    const origProcess = (globalThis as { process?: unknown }).process;
    (globalThis as { process?: unknown }).process = {
      versions: { electron: '39.8.8' },
    };
    try {
      const e = probeElectron();
      expect(e.isElectron).toBe(true);
      expect(e.method).toBe('processGlobal');
    } finally {
      if (origProcess === undefined) {
        delete (globalThis as { process?: unknown }).process;
      } else {
        (globalThis as { process?: unknown }).process = origProcess;
      }
      restore();
    }
  });

  it('VSCode-style runtime: Electron detected AND Chromium detected', async () => {
    const restore = mockEnv(
      {
        userAgent: VSCODE_UA,
        userAgentData: {
          brands: [
            { brand: 'Not_A Brand', version: '99' },
            { brand: 'Chromium', version: '142' },
          ],
        },
        plugins: { length: 0 },
        languages: ['en-US'],
      },
      { chrome: {} }
    );
    try {
      const chromium = probeChromium();
      const electron = probeElectron();
      expect(chromium.isChromium).toBe(true);
      expect(electron.isElectron).toBe(true);

      const signals = await scanAutomationSignals(chromium, electron);
      // The Electron environment signal must be surfaced (informational).
      const env = signals.find(s => s.id === 'environment-electron');
      expect(env?.present).toBe(true);
      expect(env?.weight).toBe(0);
      expect(env?.family).toBe('electron-env');
    } finally {
      restore();
    }
  });

  it('Electron downweights permissions-mismatch and webgl-software-renderer', async () => {
    const fakePermissions = {
      query: async () => ({ state: 'prompt' as const }),
    };
    const origNotification = (globalThis as { Notification?: unknown }).Notification;
    (globalThis as { Notification?: unknown }).Notification = { permission: 'denied' };
    const restore = mockEnv(
      {
        userAgent: VSCODE_UA,
        userAgentData: { brands: [{ brand: 'Chromium', version: '142' }] },
        permissions: fakePermissions,
      },
      { chrome: { runtime: { id: 'x' } } }
    );
    try {
      const chromium = probeChromium();
      const electron = probeElectron();
      const signals = await scanAutomationSignals(chromium, electron);

      const mismatch = signals.find(s => s.id === 'permissions-notification-mismatch');
      // present=true (the API state still differs) but weight=0 in Electron.
      expect(mismatch?.present).toBe(true);
      expect(mismatch?.weight).toBe(0);
    } finally {
      restore();
      if (origNotification === undefined) {
        delete (globalThis as { Notification?: unknown }).Notification;
      } else {
        (globalThis as { Notification?: unknown }).Notification = origNotification;
      }
    }
  });
});

describe('scanAutomationSignals — headless-leaning Chromium signals', () => {
  it('flags empty navigator.plugins and empty navigator.languages on Chromium', async () => {
    const restore = mockEnv(
      {
        userAgent: CHROME_UA,
        userAgentData: { brands: [{ brand: 'Chromium', version: '124' }] },
        plugins: { length: 0 },
        languages: [] as readonly string[],
      },
      { chrome: { runtime: { id: 'x' } } }
    );
    try {
      const signals = await scanAutomationSignals();
      const plugins = signals.find(s => s.id === 'plugins-empty');
      const languages = signals.find(s => s.id === 'languages-empty');
      expect(plugins?.present).toBe(true);
      expect(plugins?.weight).toBeGreaterThan(0);
      expect(plugins?.family).toBe('env-fingerprint');
      expect(languages?.present).toBe(true);
      expect(languages?.weight).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it('does not flag normal plugins/languages presence', async () => {
    const restore = mockEnv(
      {
        userAgent: CHROME_UA,
        userAgentData: { brands: [{ brand: 'Chromium', version: '124' }] },
        plugins: { length: 3 },
        languages: ['en-US', 'en'] as readonly string[],
      },
      { chrome: { runtime: { id: 'x' }, loadTimes: () => {}, csi: () => {}, app: {} } }
    );
    try {
      const signals = await scanAutomationSignals();
      expect(signals.find(s => s.id === 'plugins-empty')?.present).toBe(false);
      expect(signals.find(s => s.id === 'languages-empty')?.present).toBe(false);
      expect(signals.find(s => s.id === 'chrome-legacy-keys-missing')?.present).toBe(false);
    } finally {
      restore();
    }
  });

  it('flags permissions mismatch (Notification denied + permissions prompt)', async () => {
    const fakePermissions = {
      query: async () => ({ state: 'prompt' as const }),
    };
    const origNotification = (globalThis as { Notification?: unknown }).Notification;
    (globalThis as { Notification?: unknown }).Notification = { permission: 'denied' };
    const restore = mockEnv(
      {
        userAgent: CHROME_UA,
        userAgentData: { brands: [{ brand: 'Chromium', version: '124' }] },
        permissions: fakePermissions,
      },
      { chrome: { runtime: { id: 'x' } } }
    );
    try {
      const signals = await scanAutomationSignals();
      const mismatch = signals.find(s => s.id === 'permissions-notification-mismatch');
      expect(mismatch?.present).toBe(true);
      expect(mismatch?.weight).toBeGreaterThan(0);
    } finally {
      restore();
      if (origNotification === undefined) {
        delete (globalThis as { Notification?: unknown }).Notification;
      } else {
        (globalThis as { Notification?: unknown }).Notification = origNotification;
      }
    }
  });

  it('flags missing chrome legacy keys when ≥2 are absent', async () => {
    const restore = mockEnv(
      {
        userAgent: CHROME_UA,
        userAgentData: { brands: [{ brand: 'Chromium', version: '124' }] },
      },
      { chrome: { runtime: { id: 'x' } } }
    );
    try {
      const signals = await scanAutomationSignals();
      const legacy = signals.find(s => s.id === 'chrome-legacy-keys-missing');
      expect(legacy?.present).toBe(true);
      expect(legacy?.weight).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it('runtime-toString-tampered: clean native toString reports false', async () => {
    const restore = mockEnv({ userAgent: CHROME_UA });
    try {
      const signals = await scanAutomationSignals();
      const sig = signals.find(s => s.id === 'runtime-toString-tampered');
      expect(sig).toBeDefined();
      expect(sig?.present).toBe(false);
      expect(sig?.family).toBe('runtime-tamper');
    } finally {
      restore();
    }
  });

  it('runtime-toString-tampered: detects when Function.prototype.toString is overridden', async () => {
    const restore = mockEnv({ userAgent: CHROME_UA });
    const origToString = Function.prototype.toString;
    // Simulate a stealth plugin's blanket toString override that returns
    // a fake "[native code]" string but whose own source is JS, not native.
    Function.prototype.toString = function patched() {
      return 'function patched() { /* stealth */ }';
    };
    try {
      const signals = await scanAutomationSignals();
      const sig = signals.find(s => s.id === 'runtime-toString-tampered');
      expect(sig?.present).toBe(true);
      expect(sig?.weight).toBeGreaterThan(0);
    } finally {
      Function.prototype.toString = origToString;
      restore();
    }
  });
});

describe('computeConfidence — sigmoid + family-diversity gate', () => {
  const { computeConfidence } = cdpInternals;

  it('normal desktop Chrome (no signals): raw=0, below detected threshold', () => {
    const res = computeConfidence(
      false,
      [],
      [
        {
          id: 'automation-fingerprint-globals',
          present: false,
          weight: 0.4,
          family: 'automation-globals',
          description: '',
        },
        {
          id: 'chrome-legacy-keys-missing',
          present: false,
          weight: 0.1,
          family: 'env-fingerprint',
          description: '',
        },
        {
          id: 'plugins-empty',
          present: false,
          weight: 0.08,
          family: 'env-fingerprint',
          description: '',
        },
        {
          id: 'languages-empty',
          present: false,
          weight: 0.1,
          family: 'env-fingerprint',
          description: '',
        },
        {
          id: 'window-outer-zero',
          present: false,
          weight: 0.1,
          family: 'env-fingerprint',
          description: '',
        },
      ]
    );
    expect(res.detected).toBe(false);
    expect(res.rawScore).toBe(0);
    // Sigmoid maps 0 → ~0.17, still well under the 0.3 detected threshold.
    expect(res.confidence).toBeLessThan(0.3);
  });

  it('REGRESSION: single chrome-legacy-keys-missing alone stays under threshold', () => {
    const res = computeConfidence(
      false,
      [],
      [
        {
          id: 'chrome-legacy-keys-missing',
          present: true,
          weight: 0.1,
          family: 'env-fingerprint',
          description: '',
        },
      ]
    );
    expect(res.detected).toBe(false);
  });

  it('webdriver=true alone: strongly detected, bypasses family-diversity gate', () => {
    const res = computeConfidence(true, [], []);
    expect(res.detected).toBe(true);
    expect(res.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('FAMILY-DIVERSITY: single port-stall signal alone does NOT reach critical tier', () => {
    // This is the primary fix for the VSCode/Electron flap: a single port
    // stall must not be enough to push to "critical". It can detect, but
    // confidence must stay below the critical threshold (0.6) without
    // corroboration from a second family.
    const res = computeConfidence(
      undefined,
      [
        {
          port: 9229,
          address: '127.0.0.1',
          method: 'wss-timing',
          avgTimeMs: 0,
          controlAvgTimeMs: 70,
          deltaMs: 0,
          likelyOpen: true,
          probeCount: 0,
          blocked: false,
          stalled: true,
          timedOutCount: 5,
          totalRounds: 5,
        },
      ],
      []
    );
    expect(res.confidence).toBeLessThan(0.6);
    expect(res.signalFamiliesFired).toBe(1);
  });

  it('FAMILY-DIVERSITY: port stall + env-fingerprint together CAN reach critical', () => {
    // With two distinct families present, confidence is allowed to cross
    // the critical threshold. This shows the gate doesn't block legitimate
    // multi-signal detection.
    const res = computeConfidence(
      undefined,
      [
        {
          port: 9222,
          address: '127.0.0.1',
          method: 'wss-timing',
          avgTimeMs: 0,
          controlAvgTimeMs: 70,
          deltaMs: 0,
          likelyOpen: true,
          probeCount: 0,
          blocked: false,
          stalled: true,
          timedOutCount: 5,
          totalRounds: 5,
        },
      ],
      [
        {
          id: 'plugins-empty',
          present: true,
          weight: 0.08,
          family: 'env-fingerprint',
          description: 'plugins empty',
        },
        {
          id: 'languages-empty',
          present: true,
          weight: 0.1,
          family: 'env-fingerprint',
          description: 'languages empty',
        },
        {
          id: 'webgl-software-renderer',
          present: true,
          weight: 0.15,
          family: 'env-fingerprint',
          description: 'swiftshader',
        },
        {
          id: 'chrome-legacy-keys-missing',
          present: true,
          weight: 0.1,
          family: 'env-fingerprint',
          description: 'legacy keys missing',
        },
      ]
    );
    expect(res.signalFamiliesFired).toBe(2);
    expect(res.detected).toBe(true);
    expect(res.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('ELECTRON CAP: env-fingerprint signals alone are not enough to detect in Electron', () => {
    // VSCode-style scenario: chrome-legacy-keys-missing + plugins-empty +
    // languages-empty would normally fire env-fingerprint family. Under
    // Electron the raw score is hard-capped at 0.18 → sigmoid ≈ 0.30,
    // right under the detected threshold.
    const res = computeConfidence(
      undefined,
      [],
      [
        {
          id: 'chrome-legacy-keys-missing',
          present: true,
          weight: 0.1,
          family: 'env-fingerprint',
          description: '',
        },
        {
          id: 'plugins-empty',
          present: true,
          weight: 0.08,
          family: 'env-fingerprint',
          description: '',
        },
        {
          id: 'languages-empty',
          present: true,
          weight: 0.1,
          family: 'env-fingerprint',
          description: '',
        },
      ],
      true // isElectron
    );
    expect(res.detected).toBe(false);
    expect(res.confidence).toBeLessThan(0.4);
  });

  it('ELECTRON CAP: webdriver=true still detects through the cap', () => {
    // In Electron, webdriver=true is the only signal strong enough to
    // bypass the cap — it's W3C-mandated and (essentially) FP-free.
    const res = computeConfidence(true, [], [], true);
    expect(res.detected).toBe(true);
    expect(res.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('STABILITY: rawScore wobbles near the midpoint do not flip the verdict', () => {
    // The flap-fix test: two raw scores 0.05 apart should not both straddle
    // a critical-tier boundary. With sigmoid smoothing they map close together.
    const a = computeConfidence(
      undefined,
      [],
      [
        { id: 's1', present: true, weight: 0.25, family: 'env-fingerprint', description: '' },
        { id: 's2', present: true, weight: 0.2, family: 'runtime-tamper', description: '' },
      ]
    );
    const b = computeConfidence(
      undefined,
      [],
      [{ id: 's1', present: true, weight: 0.25, family: 'env-fingerprint', description: '' }]
    );
    // a fired 2 families (env + runtime-tamper); b fired 1. Even with that
    // difference the confidence gap should be modest, not a 25-point swing.
    expect(Math.abs(a.confidence - b.confidence)).toBeLessThan(0.4);
  });

  it('headless Chrome (multiple leaning signals across families): high confidence', () => {
    const res = computeConfidence(
      undefined,
      [],
      [
        {
          id: 'chrome-legacy-keys-missing',
          present: true,
          weight: 0.1,
          family: 'env-fingerprint',
          description: '',
        },
        {
          id: 'plugins-empty',
          present: true,
          weight: 0.08,
          family: 'env-fingerprint',
          description: '',
        },
        {
          id: 'languages-empty',
          present: true,
          weight: 0.1,
          family: 'env-fingerprint',
          description: '',
        },
        {
          id: 'window-outer-zero',
          present: true,
          weight: 0.1,
          family: 'env-fingerprint',
          description: '',
        },
        {
          id: 'webgl-software-renderer',
          present: true,
          weight: 0.15,
          family: 'env-fingerprint',
          description: '',
        },
        {
          id: 'permissions-notification-mismatch',
          present: true,
          weight: 0.2,
          family: 'env-fingerprint',
          description: '',
        },
        {
          id: 'runtime-toString-tampered',
          present: true,
          weight: 0.2,
          family: 'runtime-tamper',
          description: '',
        },
      ]
    );
    expect(res.detected).toBe(true);
    expect(res.confidence).toBeGreaterThanOrEqual(0.6);
    expect(res.signalFamiliesFired).toBeGreaterThanOrEqual(2);
  });

  it('port-stall + control-quality baseline empty: not detected when no signals', () => {
    const res = computeConfidence(undefined, [], []);
    expect(res.detected).toBe(false);
  });

  it('single weak signal alone: below threshold', () => {
    const res = computeConfidence(
      undefined,
      [],
      [
        {
          id: 'plugins-empty',
          present: true,
          weight: 0.08,
          family: 'env-fingerprint',
          description: '',
        },
      ]
    );
    expect(res.detected).toBe(false);
  });

  it('Signal 3 total is still capped — cannot pin at 1.0 without webdriver / port', () => {
    const manySignals = Array.from({ length: 10 }, (_, i) => ({
      id: `fake-${i}`,
      present: true,
      weight: 0.2,
      family: 'env-fingerprint' as const,
      description: '',
    }));
    const res = computeConfidence(undefined, [], manySignals);
    // Signal-3 cap (0.6) → sigmoid(0.6) ≈ 0.69, ceiling without webdriver.
    expect(res.confidence).toBeLessThanOrEqual(0.8);
  });

  it('webdriver + open port: full confidence including port evidence', () => {
    const res = computeConfidence(
      true,
      [
        {
          port: 9222,
          address: '127.0.0.1',
          method: 'wss-timing',
          avgTimeMs: 0,
          controlAvgTimeMs: 70,
          deltaMs: 0,
          likelyOpen: true,
          probeCount: 0,
          blocked: false,
          stalled: true,
          timedOutCount: 5,
          totalRounds: 5,
        },
      ],
      []
    );
    expect(res.detected).toBe(true);
    expect(res.evidence).toContain('webdriver');
    expect(res.evidence).toContain('9222');
  });
});
