import type {
  AudioFingerprintData,
  BrowserFingerprintData,
  CDPDetectionData,
  CanvasFingerprintData,
  DetectionModule,
  DetectionResult,
  DNSData,
  FontDetectionData,
  NetworkProbeData,
  WebRTCData,
} from '@/lib/detection-modules';
import type { Messages } from '@/lib/i18n/messages';
import type { ModuleAssessment, OverallAssessment, RiskLevel, RiskSignal } from './types';

/**
 * Scoring model — calibrated for a normal desktop browser to land in the 70-90 range.
 *
 * Per-signal penalty:
 *   critical: -25 (one is enough to drop to "high risk")
 *   warning : -6  (a typical browser collects 1-3 of these)
 *   safe / informational signals: no penalty
 */

const UNIQUE_FONT_WARN = 8;
const HIGH_FONT_THRESHOLD = 30;

const PENALTY = { critical: 25, warning: 6 } as const;

function worstLevel(signals: RiskSignal[]): RiskLevel {
  if (signals.some(s => s.level === 'critical')) return 'critical';
  if (signals.some(s => s.level === 'warning')) return 'warning';
  return 'safe';
}

function failureAssessment(
  m: Messages,
  moduleId: string,
  error: string | undefined
): ModuleAssessment {
  return {
    moduleId,
    level: 'unknown',
    signals: [],
    summary: error ? m.signals.failure.withError(error) : m.signals.failure.noError,
  };
}

function untestedAssessment(m: Messages, moduleId: string): ModuleAssessment {
  return {
    moduleId,
    level: 'unknown',
    signals: [],
    summary: m.signals.failure.untested,
  };
}

// ---------- per-module assessors ----------

function assessWebRTC(
  m: Messages,
  moduleId: string,
  result: DetectionResult<WebRTCData>
): ModuleAssessment {
  if (!result.success || !result.data) return failureAssessment(m, moduleId, result.error);

  const data = result.data;
  const signals: RiskSignal[] = [];
  const hasMDNS = (data.debug?.mDNSCandidates?.length ?? 0) > 0;
  const t = m.signals.webrtc;

  if (data.publicIPs.length > 0) {
    signals.push({
      id: 'webrtc.public-ip',
      level: 'warning',
      title: t.publicIp.title,
      description: t.publicIp.description,
      moduleId,
      value: data.publicIPs[0],
    });
  }

  if (data.localIPs.length > 0) {
    signals.push({
      id: 'webrtc.local-ip-leak',
      level: 'warning',
      title: t.localIpLeak.title,
      description: t.localIpLeak.description(data.localIPs.length, data.localIPs[0]),
      moduleId,
      value: data.localIPs[0],
    });
  }

  const globalIPv6 = data.ipv6Addresses.filter(e => e.scope === 'global');
  if (globalIPv6.length > 0) {
    signals.push({
      id: 'webrtc.ipv6-visible',
      level: 'safe',
      title: t.ipv6Visible.title(globalIPv6.length),
      description: t.ipv6Visible.description,
      moduleId,
      value: globalIPv6[0].address,
    });
  }

  if (hasMDNS) {
    signals.push({
      id: 'webrtc.mdns-protected',
      level: 'safe',
      title: t.mdnsProtected.title,
      description: t.mdnsProtected.description,
      moduleId,
    });
  }

  if (signals.length === 0) {
    signals.push({
      id: 'webrtc.no-leak',
      level: 'safe',
      title: t.noLeak.title,
      description: t.noLeak.description,
      moduleId,
    });
  }

  const level = worstLevel(signals);
  const realRisks = signals.filter(s => s.level !== 'safe').length;
  const summary =
    level === 'safe' ? (hasMDNS ? t.summaryMdnsOn : t.summaryNoLeak) : t.summaryRisks(realRisks);

  return { moduleId, level, signals, summary };
}

function assessBrowserFingerprint(
  m: Messages,
  moduleId: string,
  result: DetectionResult<BrowserFingerprintData>
): ModuleAssessment {
  if (!result.success || !result.data) return failureAssessment(m, moduleId, result.error);

  const data = result.data;
  const signals: RiskSignal[] = [];
  const t = m.signals.browserFp;

  signals.push({
    id: 'browser-fingerprint.user-agent',
    level: 'safe',
    title: t.userAgent.title,
    description: t.userAgent.description,
    moduleId,
  });

  signals.push({
    id: 'browser-fingerprint.screen',
    level: 'safe',
    title: t.screen.title(
      data.screenResolution.width,
      data.screenResolution.height,
      data.screenResolution.colorDepth
    ),
    description: t.screen.description,
    moduleId,
  });

  if (data.plugins.length >= 3) {
    signals.push({
      id: 'browser-fingerprint.plugins-many',
      level: 'warning',
      title: t.pluginsMany.title(data.plugins.length),
      description: t.pluginsMany.description,
      moduleId,
    });
  } else if (data.plugins.length > 0) {
    signals.push({
      id: 'browser-fingerprint.plugins-few',
      level: 'safe',
      title: t.pluginsFew.title(data.plugins.length),
      description: t.pluginsFew.description,
      moduleId,
    });
  } else {
    signals.push({
      id: 'browser-fingerprint.plugins-empty',
      level: 'safe',
      title: t.pluginsEmpty.title,
      description: t.pluginsEmpty.description,
      moduleId,
    });
  }

  if (data.timezone?.name) {
    signals.push({
      id: 'browser-fingerprint.timezone',
      level: 'safe',
      title: t.timezone.title(data.timezone.name),
      description: t.timezone.description,
      moduleId,
    });
  }

  if (data.doNotTrack && data.doNotTrack !== '0' && data.doNotTrack !== 'unspecified') {
    signals.push({
      id: 'browser-fingerprint.dnt-set',
      level: 'safe',
      title: t.dntSet.title,
      description: t.dntSet.description,
      moduleId,
    });
  }

  const warnings = signals.filter(s => s.level === 'warning').length;
  return {
    moduleId,
    level: worstLevel(signals),
    signals,
    summary: warnings > 0 ? t.summaryWarnings(warnings) : t.summaryClean,
  };
}

function assessCanvasFingerprint(
  m: Messages,
  moduleId: string,
  result: DetectionResult<CanvasFingerprintData>
): ModuleAssessment {
  if (!result.success || !result.data) return failureAssessment(m, moduleId, result.error);

  const data = result.data;
  const signals: RiskSignal[] = [];
  const t = m.signals.canvas;

  signals.push({
    id: 'canvas-fingerprint.canvas2d',
    level: 'safe',
    title: t.canvas2d.title,
    description: t.canvas2d.description,
    moduleId,
  });

  if (data.canvasWebGL) {
    signals.push({
      id: 'canvas-fingerprint.webgl-visible',
      level: 'safe',
      title: t.webglVisible.title,
      description: t.webglVisible.description,
      moduleId,
    });
  } else {
    signals.push({
      id: 'canvas-fingerprint.webgl-disabled',
      level: 'safe',
      title: t.webglDisabled.title,
      description: t.webglDisabled.description,
      moduleId,
    });
  }

  return {
    moduleId,
    level: worstLevel(signals),
    signals,
    summary: data.canvasWebGL ? t.summaryWithWebgl : t.summaryCanvas2dOnly,
  };
}

function assessAudioFingerprint(
  m: Messages,
  moduleId: string,
  result: DetectionResult<AudioFingerprintData>
): ModuleAssessment {
  if (!result.success || !result.data) return failureAssessment(m, moduleId, result.error);

  const data = result.data;
  const signals: RiskSignal[] = [];
  const t = m.signals.audio;

  if (data.audioContextFingerprint && data.audioContextFingerprint.length > 0) {
    signals.push({
      id: 'audio-fingerprint.exists',
      level: 'safe',
      title: t.exists.title,
      description: t.exists.description,
      moduleId,
    });
  } else {
    signals.push({
      id: 'audio-fingerprint.empty',
      level: 'safe',
      title: t.empty.title,
      description: t.empty.description,
      moduleId,
    });
  }

  return {
    moduleId,
    level: worstLevel(signals),
    signals,
    summary: signals[0].title,
  };
}

function assessFontDetection(
  m: Messages,
  moduleId: string,
  result: DetectionResult<FontDetectionData>
): ModuleAssessment {
  if (!result.success || !result.data) return failureAssessment(m, moduleId, result.error);

  const data = result.data;
  const signals: RiskSignal[] = [];
  const t = m.signals.font;

  if (data.totalFonts >= HIGH_FONT_THRESHOLD) {
    signals.push({
      id: 'font-detection.many',
      level: 'critical',
      title: t.many.title(data.totalFonts),
      description: t.many.description,
      moduleId,
    });
  } else if (data.uniqueFonts.length >= UNIQUE_FONT_WARN) {
    signals.push({
      id: 'font-detection.unique-many',
      level: 'warning',
      title: t.uniqueMany.title(data.uniqueFonts.length),
      description: t.uniqueMany.description,
      moduleId,
      value: data.uniqueFonts.slice(0, 3).join(t.valueJoiner),
    });
  } else if (data.uniqueFonts.length > 0) {
    signals.push({
      id: 'font-detection.unique-few',
      level: 'safe',
      title: t.uniqueFew.title(data.uniqueFonts.length),
      description: t.uniqueFew.description,
      moduleId,
      value: data.uniqueFonts.slice(0, 3).join(t.valueJoiner),
    });
  } else {
    signals.push({
      id: 'font-detection.common-only',
      level: 'safe',
      title: t.commonOnly.title,
      description: t.commonOnly.description,
      moduleId,
    });
  }

  return {
    moduleId,
    level: worstLevel(signals),
    signals,
    summary: t.summary(data.totalFonts, data.uniqueFonts.length),
  };
}

function assessNetworkProbe(
  m: Messages,
  moduleId: string,
  result: DetectionResult<NetworkProbeData>
): ModuleAssessment {
  if (!result.success || !result.data) return failureAssessment(m, moduleId, result.error);

  const data = result.data;
  const signals: RiskSignal[] = [];
  const t = m.signals.networkProbe;

  if (data.ip) {
    const where = [data.city, data.region, data.country].filter(Boolean).join(', ');
    signals.push({
      id: 'network-probe.public-ip',
      level: 'safe',
      title: where ? t.publicIpLocated.title(where) : t.publicIpUnlocated,
      description: data.asOrg
        ? t.publicIpLocated.descriptionWithOrg(
            data.ip,
            data.asn ?? t.publicIpLocated.asnUnknown,
            data.asOrg
          )
        : t.publicIpLocated.descriptionPlain(data.ip),
      moduleId,
      value: data.ip,
    });
  }

  if (data.isTor) {
    signals.push({
      id: 'network-probe.tor-exit',
      level: 'warning',
      title: t.torExit.title,
      description: t.torExit.description,
      moduleId,
    });
  } else if (data.isVpn) {
    signals.push({
      id: 'network-probe.vpn',
      level: 'safe',
      title: t.vpn.title,
      description: t.vpn.description,
      moduleId,
    });
  } else if (data.isProxy) {
    signals.push({
      id: 'network-probe.proxy',
      level: 'safe',
      title: t.proxy.title,
      description: t.proxy.description,
      moduleId,
    });
  } else if (data.isHosting) {
    signals.push({
      id: 'network-probe.hosting',
      level: 'warning',
      title: t.hosting.title,
      description: t.hosting.description,
      moduleId,
    });
  }

  if (data.country && data.clientTimezone) {
    const tzCountry = TIMEZONE_TO_COUNTRY[data.clientTimezone];
    if (tzCountry && tzCountry !== data.country) {
      signals.push({
        id: 'network-probe.tz-ip-mismatch',
        level: 'warning',
        title: t.tzIpMismatch.title,
        description: t.tzIpMismatch.description(data.clientTimezone, tzCountry, data.country),
        moduleId,
      });
    }
  }

  if (
    data.serverUserAgent &&
    data.clientUserAgent &&
    data.serverUserAgent !== data.clientUserAgent
  ) {
    signals.push({
      id: 'network-probe.ua-mismatch',
      level: 'warning',
      title: t.uaMismatch.title,
      description: t.uaMismatch.description,
      moduleId,
    });
  }

  if (data.tlsJa4 || data.tlsJa3) {
    signals.push({
      id: 'network-probe.tls-fingerprint',
      level: 'safe',
      title: t.tlsFingerprint.title,
      description: data.tlsJa4
        ? t.tlsFingerprint.descriptionJa4(data.tlsJa4)
        : t.tlsFingerprint.descriptionJa3(data.tlsJa3!),
      moduleId,
      value: data.tlsJa4 ?? data.tlsJa3 ?? undefined,
    });
  }

  if (signals.length === 0) {
    signals.push({
      id: 'network-probe.minimal',
      level: 'safe',
      title: t.minimal.title,
      description: t.minimal.description,
      moduleId,
    });
  }

  const where = [data.city, data.country].filter(Boolean).join(', ');
  const summary = where ? t.summaryWithLocation(where) : t.summaryGeneric;

  return { moduleId, level: worstLevel(signals), signals, summary };
}

/**
 * Coarse map of common IANA timezones to ISO country codes. Only used as a
 * tiebreaker — anything missing falls through silently.
 */
const TIMEZONE_TO_COUNTRY: Readonly<Record<string, string>> = Object.freeze({
  'Asia/Shanghai': 'CN',
  'Asia/Chongqing': 'CN',
  'Asia/Urumqi': 'CN',
  'Asia/Hong_Kong': 'HK',
  'Asia/Macau': 'MO',
  'Asia/Taipei': 'TW',
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'Asia/Singapore': 'SG',
  'Asia/Bangkok': 'TH',
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Dubai': 'AE',
  'Asia/Tehran': 'IR',
  'Europe/London': 'GB',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL',
  'Europe/Zurich': 'CH',
  'Europe/Stockholm': 'SE',
  'Europe/Moscow': 'RU',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Phoenix': 'US',
  'America/Anchorage': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Mexico_City': 'MX',
  'America/Sao_Paulo': 'BR',
  'America/Buenos_Aires': 'AR',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Pacific/Auckland': 'NZ',
  'Africa/Johannesburg': 'ZA',
  'Africa/Cairo': 'EG',
  'Africa/Lagos': 'NG',
});

function assessDNS(
  m: Messages,
  moduleId: string,
  result: DetectionResult<DNSData>
): ModuleAssessment {
  if (!result.success || !result.data) return failureAssessment(m, moduleId, result.error);

  const data = result.data;
  const signals: RiskSignal[] = [];
  const t = m.signals.dns;

  if (data.dohSupport) {
    signals.push({
      id: 'dns.doh-reachable',
      level: 'safe',
      title: t.dohReachable.title,
      description: t.dohReachable.description,
      moduleId,
    });
  } else {
    signals.push({
      id: 'dns.doh-unreachable',
      level: 'safe',
      title: t.dohUnreachable.title,
      description: t.dohUnreachable.description,
      moduleId,
    });
  }

  if (data.dnssecSupport) {
    signals.push({
      id: 'dns.dnssec-validates',
      level: 'safe',
      title: t.dnssecValidates.title,
      description: t.dnssecValidates.description,
      moduleId,
    });
  }

  if (data.resolverLocation) {
    signals.push({
      id: 'dns.resolver-location',
      level: 'safe',
      title: t.resolverLocation.title,
      description: t.resolverLocation.description,
      moduleId,
      value: data.resolverLocation,
    });
  }

  signals.push({
    id: 'dns.leak-detection-unavailable',
    level: 'safe',
    title: t.leakUnavailable.title,
    description: t.leakUnavailable.description,
    moduleId,
  });

  return {
    moduleId,
    level: worstLevel(signals),
    signals,
    summary: data.dohSupport ? t.summaryDohOk : t.summaryDohFail,
  };
}

/**
 * Map CDP module output → risk signals.
 *
 * The CDP module's `confidence` is already sigmoid-smoothed and gated by
 * signal-family diversity (see cdp-detection-module.ts). That makes raw
 * threshold comparison here safe — small probe-to-probe wobbles cannot
 * flip the verdict, and a single flaky signal cannot reach the critical
 * tier without corroboration. Thresholds aligned with the module's own
 * boundaries (0.3 detected, 0.6 critical).
 */
const CDP_CONFIDENCE_CRITICAL = 0.6;
const CDP_CONFIDENCE_WARNING = 0.3;

function assessCDPDetection(
  m: Messages,
  moduleId: string,
  result: DetectionResult<CDPDetectionData>
): ModuleAssessment {
  if (!result.success || !result.data) return failureAssessment(m, moduleId, result.error);
  const data = result.data;
  const signals: RiskSignal[] = [];
  const webdriverCritical = data.webdriverFlag === true;
  const t = m.signals.cdp;

  if (webdriverCritical) {
    signals.push({
      id: 'cdp.webdriver-true',
      level: 'critical',
      title: t.webdriverTrue.title,
      description: t.webdriverTrue.description,
      moduleId,
    });
  }

  if (data.detected && data.confidence >= CDP_CONFIDENCE_CRITICAL) {
    const variant = webdriverCritical ? t.automationDetectedWarning : t.automationDetectedCritical;
    signals.push({
      id: 'cdp.automation-detected',
      level: webdriverCritical ? 'warning' : 'critical',
      title: variant.title,
      description: variant.description(data.evidence),
      moduleId,
      value: data.portProbes.find(p => p.likelyOpen)?.port?.toString(),
    });
  } else if (data.detected && data.confidence >= CDP_CONFIDENCE_WARNING) {
    signals.push({
      id: 'cdp.automation-suspected',
      level: 'warning',
      title: t.automationSuspected.title,
      description: t.automationSuspected.description(data.evidence),
      moduleId,
    });
  } else {
    signals.push({
      id: 'cdp.no-automation-signals',
      level: 'safe',
      title: t.noAutomation.title,
      description: t.noAutomation.description,
      moduleId,
    });
  }

  // Surface the Electron environment as an explicit safe signal so users
  // running VSCode / Slack / Discord understand why the port probe is
  // suppressed and the verdict is conservative.
  if (data.isElectron) {
    signals.push({
      id: 'cdp.electron-environment',
      level: 'safe',
      title: t.electronEnv.title,
      description: t.electronEnv.description,
      moduleId,
    });
  }

  const blockedProbes = data.portProbes.filter(p => p.blocked);
  if (blockedProbes.length > 0 && !data.detected) {
    signals.push({
      id: 'cdp.probe-blocked',
      level: 'safe',
      title: t.probeBlocked.title,
      description: t.probeBlocked.description,
      moduleId,
    });
  }

  return {
    moduleId,
    level: worstLevel(signals),
    signals,
    summary: data.detected ? t.summaryDetected(Math.round(data.confidence * 100)) : t.summaryClean,
  };
}

type AssessFn = (m: Messages, moduleId: string, result: DetectionResult) => ModuleAssessment;

const ASSESSORS: Record<string, AssessFn> = {
  'network-probe': (m, id, r) => assessNetworkProbe(m, id, r as DetectionResult<NetworkProbeData>),
  webrtc: (m, id, r) => assessWebRTC(m, id, r as DetectionResult<WebRTCData>),
  'browser-fingerprint': (m, id, r) =>
    assessBrowserFingerprint(m, id, r as DetectionResult<BrowserFingerprintData>),
  'canvas-fingerprint': (m, id, r) =>
    assessCanvasFingerprint(m, id, r as DetectionResult<CanvasFingerprintData>),
  'audio-fingerprint': (m, id, r) =>
    assessAudioFingerprint(m, id, r as DetectionResult<AudioFingerprintData>),
  'font-detection': (m, id, r) =>
    assessFontDetection(m, id, r as DetectionResult<FontDetectionData>),
  dns: (m, id, r) => assessDNS(m, id, r as DetectionResult<DNSData>),
  'cdp-detection': (m, id, r) => assessCDPDetection(m, id, r as DetectionResult<CDPDetectionData>),
};

// ---------- aggregation ----------

/**
 * Detect non-routable / dev-environment server IPs that should NOT participate
 * in the split-tunnel cross-check. The cross-check compares the server-observed
 * egress IP against WebRTC-revealed public IPs — but when serving over a
 * loopback origin (Next.js dev on localhost, Docker on 127.0.0.1, devcontainer)
 * the server IP IS the loopback address, while WebRTC legitimately surfaces
 * the real public IP. That mismatch is not a VPN leak; it's just the dev
 * environment. Treating it as a critical signal cost the local dev scores
 * a fixed 25 points and was the dominant source of false-positive critical
 * verdicts on developer machines.
 *
 * RFC1918 / IPv6 loopback / IPv6 ULA / link-local match list. Conservative
 * by design — when in doubt, run the cross-check (real users on a real
 * residential IP will never match these patterns).
 */
function isLocalOrPrivateIp(ip: string): boolean {
  if (!ip) return false;
  if (ip === '::1' || ip === '127.0.0.1') return true;
  // IPv4 loopback
  if (/^127\./.test(ip)) return true;
  // IPv4 RFC1918
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
  // IPv4 link-local
  if (/^169\.254\./.test(ip)) return true;
  // IPv4 CGNAT
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  // IPv6 ULA (fc00::/7) and link-local (fe80::/10)
  if (/^fc[0-9a-f]{2}:/i.test(ip)) return true;
  if (/^fd[0-9a-f]{2}:/i.test(ip)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;
  return false;
}

function injectSplitTunnelSignal(
  m: Messages,
  perModule: ModuleAssessment[],
  results: ReadonlyMap<string, DetectionResult>
): void {
  const probeAssessment = perModule.find(mod => mod.moduleId === 'network-probe');
  if (!probeAssessment || probeAssessment.level === 'unknown') return;

  const probeResult = results.get('network-probe') as DetectionResult<NetworkProbeData> | undefined;
  const webrtcResult = results.get('webrtc') as DetectionResult<WebRTCData> | undefined;
  if (!probeResult?.success || !probeResult.data) return;
  if (!webrtcResult?.success || !webrtcResult.data) return;

  const serverIp = probeResult.data.ip;
  const webrtcPublicIps = webrtcResult.data.publicIPs;
  if (!serverIp || webrtcPublicIps.length === 0) return;

  const t = m.signals.cross;

  // Local / dev environment: server IP is loopback or RFC1918. The
  // server-vs-WebRTC mismatch is meaningless here. Surface an
  // informational signal instead of a false-positive critical.
  if (isLocalOrPrivateIp(serverIp)) {
    probeAssessment.signals.push({
      id: 'cross.local-dev-env',
      level: 'safe',
      title: t.localDevEnv.title,
      description: t.localDevEnv.description(serverIp),
      moduleId: 'network-probe',
    });
    return;
  }

  const mismatched = webrtcPublicIps.filter(ip => ip !== serverIp);
  if (mismatched.length === 0) {
    probeAssessment.signals.push({
      id: 'cross.ip-consistency-ok',
      level: 'safe',
      title: t.ipConsistencyOk.title,
      description: t.ipConsistencyOk.description,
      moduleId: 'network-probe',
    });
    return;
  }

  probeAssessment.signals.push({
    id: 'cross.split-tunnel-leak',
    level: 'critical',
    title: t.splitTunnelLeak.title,
    description: t.splitTunnelLeak.description(
      serverIp,
      mismatched.join(m.signals.font.valueJoiner)
    ),
    moduleId: 'network-probe',
    value: mismatched[0],
  });
  probeAssessment.level = worstLevel(probeAssessment.signals);
}

function overallLevel(score: number, hasAnyResult: boolean): RiskLevel {
  if (!hasAnyResult) return 'unknown';
  if (score >= 85) return 'safe';
  if (score >= 60) return 'warning';
  return 'critical';
}

export function assessAll(
  modules: readonly DetectionModule[],
  results: ReadonlyMap<string, DetectionResult>,
  m: Messages
): OverallAssessment {
  const perModule: ModuleAssessment[] = modules.map(mod => {
    const r = results.get(mod.id);
    if (!r) return untestedAssessment(m, mod.id);
    const fn = ASSESSORS[mod.id];
    return fn ? fn(m, mod.id, r) : untestedAssessment(m, mod.id);
  });

  injectSplitTunnelSignal(m, perModule, results);

  const allSignals = perModule.flatMap(mod => mod.signals);
  const counts = {
    critical: allSignals.filter(s => s.level === 'critical').length,
    warning: allSignals.filter(s => s.level === 'warning').length,
    safe: allSignals.filter(s => s.level === 'safe').length,
  };

  const penalty = counts.critical * PENALTY.critical + counts.warning * PENALTY.warning;
  const score = Math.max(0, 100 - penalty);
  const hasAnyResult = perModule.some(mod => mod.level !== 'unknown');

  return {
    score,
    level: overallLevel(score, hasAnyResult),
    counts,
    untestedModuleIds: perModule.filter(mod => mod.level === 'unknown').map(mod => mod.moduleId),
    perModule,
  };
}
