/**
 * @jest-environment node
 */
import type {
  CDPDetectionData,
  DetectionModule,
  DetectionResult,
  NetworkProbeData,
  WebRTCData,
} from '@/lib/detection-modules';
import { en } from '@/lib/i18n/en';
import { assessAll } from '../assess';

const baseProbe = <T>(data: T): DetectionResult<T> => ({
  success: true,
  data,
  detectedAt: new Date(),
});

// Minimal module stubs — assessAll only reads `.id`, so it's safe to skip
// the rest of the DetectionModule surface here.
const networkProbeMod = { id: 'network-probe' } as unknown as DetectionModule;
const webrtcMod = { id: 'webrtc' } as unknown as DetectionModule;
const cdpMod = { id: 'cdp-detection' } as unknown as DetectionModule;

const PUBLIC_IP_DATA: NetworkProbeData = {
  ip: '203.0.113.42',
  ipFamily: 'ipv4',
  country: 'CN',
  region: null,
  city: null,
  asn: null,
  asOrg: null,
  isVpn: null,
  isProxy: null,
  isTor: null,
  isHosting: null,
  tlsJa3: null,
  tlsJa4: null,
  serverUserAgent: 'Mozilla/5.0 (X)',
  acceptLanguage: 'en-US',
  acceptEncoding: 'gzip',
  clientUserAgent: 'Mozilla/5.0 (X)',
  clientTimezone: 'Asia/Shanghai',
};

const WEBRTC_PUBLIC: WebRTCData = {
  localIPs: [],
  publicIPs: ['198.51.100.99'],
  ipv6Addresses: [],
  debug: { totalCandidates: 0, mDNSCandidates: [], rawCandidates: [] },
};

describe('assessAll — split-tunnel cross-signal injection', () => {
  it('production: mismatched WebRTC public IP → critical split-tunnel signal', () => {
    const results = new Map<string, DetectionResult>([
      ['network-probe', baseProbe(PUBLIC_IP_DATA)],
      ['webrtc', baseProbe(WEBRTC_PUBLIC)],
    ]);
    const overall = assessAll([networkProbeMod, webrtcMod], results, en);
    const probe = overall.perModule.find(p => p.moduleId === 'network-probe')!;
    expect(probe.signals.some(s => s.id === 'cross.split-tunnel-leak')).toBe(true);
    expect(probe.level).toBe('critical');
  });

  it('localhost dev: server IP is ::1 → split-tunnel skipped, informational signal injected', () => {
    // The reported flap scenario: Next.js dev server, server-observed IP
    // is the loopback ::1, WebRTC surfaces the real public IP. Treating
    // that mismatch as a "VPN leak" cost dev users a fixed 25-point hit.
    const results = new Map<string, DetectionResult>([
      ['network-probe', baseProbe({ ...PUBLIC_IP_DATA, ip: '::1', country: null })],
      ['webrtc', baseProbe(WEBRTC_PUBLIC)],
    ]);
    const overall = assessAll([networkProbeMod, webrtcMod], results, en);
    const probe = overall.perModule.find(p => p.moduleId === 'network-probe')!;
    expect(probe.signals.some(s => s.id === 'cross.split-tunnel-leak')).toBe(false);
    expect(probe.signals.some(s => s.id === 'cross.local-dev-env')).toBe(true);
    // No critical signal injected → module level should not be critical from this path.
    expect(probe.signals.find(s => s.id === 'cross.local-dev-env')?.level).toBe('safe');
  });

  it('localhost dev (127.0.0.1): same skip path as ::1', () => {
    const results = new Map<string, DetectionResult>([
      ['network-probe', baseProbe({ ...PUBLIC_IP_DATA, ip: '127.0.0.1', country: null })],
      ['webrtc', baseProbe(WEBRTC_PUBLIC)],
    ]);
    const overall = assessAll([networkProbeMod, webrtcMod], results, en);
    const probe = overall.perModule.find(p => p.moduleId === 'network-probe')!;
    expect(probe.signals.some(s => s.id === 'cross.split-tunnel-leak')).toBe(false);
    expect(probe.signals.some(s => s.id === 'cross.local-dev-env')).toBe(true);
  });

  it('private LAN (192.168.x.x): same skip path', () => {
    const results = new Map<string, DetectionResult>([
      ['network-probe', baseProbe({ ...PUBLIC_IP_DATA, ip: '192.168.1.5', country: null })],
      ['webrtc', baseProbe(WEBRTC_PUBLIC)],
    ]);
    const overall = assessAll([networkProbeMod, webrtcMod], results, en);
    const probe = overall.perModule.find(p => p.moduleId === 'network-probe')!;
    expect(probe.signals.some(s => s.id === 'cross.split-tunnel-leak')).toBe(false);
    expect(probe.signals.some(s => s.id === 'cross.local-dev-env')).toBe(true);
  });

  it('matching IPs: ip-consistency-ok injected (not the dev-env signal)', () => {
    const matching = { ...WEBRTC_PUBLIC, publicIPs: [PUBLIC_IP_DATA.ip!] };
    const results = new Map<string, DetectionResult>([
      ['network-probe', baseProbe(PUBLIC_IP_DATA)],
      ['webrtc', baseProbe(matching)],
    ]);
    const overall = assessAll([networkProbeMod, webrtcMod], results, en);
    const probe = overall.perModule.find(p => p.moduleId === 'network-probe')!;
    expect(probe.signals.some(s => s.id === 'cross.ip-consistency-ok')).toBe(true);
    expect(probe.signals.some(s => s.id === 'cross.split-tunnel-leak')).toBe(false);
  });
});

describe('assessAll — CDP module → signal level mapping', () => {
  const baseCDP = (over: Partial<CDPDetectionData> = {}): CDPDetectionData => ({
    webdriverFlag: undefined,
    isChromium: true,
    isElectron: false,
    portProbes: [],
    automationSignals: [],
    detected: false,
    confidence: 0,
    rawScore: 0,
    signalFamiliesFired: 0,
    evidence: '',
    diagnostics: {
      isChromiumDetected: true,
      chromiumDetectionMethod: 'userAgentData',
      uaDataBrands: null,
      userAgent: '',
      hasChromeObj: true,
      chromeKeys: [],
      isElectron: false,
      electronDetectionMethod: 'none',
    },
    ...over,
  });

  it('confidence 0.21 (just-below detected): clean safe signal, no warning/critical', () => {
    const results = new Map<string, DetectionResult>([
      [
        'cdp-detection',
        baseProbe(baseCDP({ confidence: 0.21, detected: false })) as DetectionResult,
      ],
    ]);
    const overall = assessAll([cdpMod], results, en);
    const cdp = overall.perModule.find(p => p.moduleId === 'cdp-detection')!;
    expect(cdp.signals.some(s => s.id === 'cdp.no-automation-signals')).toBe(true);
    expect(cdp.level).toBe('safe');
  });

  it('confidence 0.45 (mid range): warning, not critical', () => {
    const results = new Map<string, DetectionResult>([
      [
        'cdp-detection',
        baseProbe(baseCDP({ confidence: 0.45, detected: true })) as DetectionResult,
      ],
    ]);
    const overall = assessAll([cdpMod], results, en);
    const cdp = overall.perModule.find(p => p.moduleId === 'cdp-detection')!;
    expect(cdp.signals.some(s => s.id === 'cdp.automation-suspected')).toBe(true);
    expect(cdp.level).toBe('warning');
  });

  it('confidence 0.7 (high): critical', () => {
    const results = new Map<string, DetectionResult>([
      ['cdp-detection', baseProbe(baseCDP({ confidence: 0.7, detected: true })) as DetectionResult],
    ]);
    const overall = assessAll([cdpMod], results, en);
    const cdp = overall.perModule.find(p => p.moduleId === 'cdp-detection')!;
    expect(cdp.signals.some(s => s.id === 'cdp.automation-detected')).toBe(true);
    expect(cdp.level).toBe('critical');
  });

  it('Electron environment: surfaces explicit safe signal', () => {
    const results = new Map<string, DetectionResult>([
      [
        'cdp-detection',
        baseProbe(
          baseCDP({ confidence: 0.2, detected: false, isElectron: true })
        ) as DetectionResult,
      ],
    ]);
    const overall = assessAll([cdpMod], results, en);
    const cdp = overall.perModule.find(p => p.moduleId === 'cdp-detection')!;
    expect(cdp.signals.some(s => s.id === 'cdp.electron-environment')).toBe(true);
    expect(cdp.level).toBe('safe');
  });

  it('REGRESSION: VSCode-like flap scenario (Electron + low confidence) stays safe', () => {
    // Two simulated scans of the same VSCode browser with slightly
    // different env-fingerprint contributions. Both should land at "safe"
    // so the overall score does not flap between runs.
    const scan1 = baseProbe(
      baseCDP({ confidence: 0.18, detected: false, isElectron: true })
    ) as DetectionResult;
    const scan2 = baseProbe(
      baseCDP({ confidence: 0.27, detected: false, isElectron: true })
    ) as DetectionResult;

    for (const r of [scan1, scan2]) {
      const overall = assessAll([cdpMod], new Map([['cdp-detection', r]]), en);
      const cdp = overall.perModule.find(p => p.moduleId === 'cdp-detection')!;
      expect(cdp.level).toBe('safe');
      expect(overall.score).toBeGreaterThanOrEqual(85);
    }
  });
});
