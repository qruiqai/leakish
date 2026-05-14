'use client';

import type { CDPDetectionData, DetectionResult } from '@/lib/detection-modules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMessages } from '@/lib/i18n/locale-client';
import {
  AlertTriangle,
  Bug,
  CheckCircle,
  Clock,
  HelpCircle,
  Info,
  Shield,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

interface CDPResultDetailProps {
  result: DetectionResult<CDPDetectionData>;
}

export function CDPResultDetail({ result }: CDPResultDetailProps) {
  const m = useMessages();
  const t = m.results.cdp;

  if (!result.success || !result.data) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            {t.detectionFailed}: {result.error || m.results.unknownError}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const data = result.data;

  const confidencePct = Math.round(data.confidence * 100);
  // Thresholds aligned with assess.ts (warning=30, critical=60). The
  // module already sigmoid-smooths confidence so these comparisons are
  // stable across repeat scans.
  const strengthLabel =
    confidencePct >= 60
      ? m.results.shared.high
      : confidencePct >= 30
        ? m.results.shared.medium
        : m.results.shared.low;
  const strengthColor =
    confidencePct >= 60
      ? 'text-red-500'
      : confidencePct >= 30
        ? 'text-yellow-500'
        : 'text-green-500';

  return (
    <div className="p-6 space-y-6">
      {/* Scope disclosure — persistent, not a detection outcome. */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          {t.disclosurePart1}
          <strong>{t.disclosurePart2}</strong>
          {t.disclosurePart3}
          <strong>{t.disclosureCannot}</strong>
          {t.disclosurePart4}
          <code>--remote-debugging-port</code>
          {t.disclosurePart5}
          <code>chrome://inspect</code>
          {t.disclosurePart6}
          <code>lsof -i :9222</code>
          {t.disclosurePeriod}
        </AlertDescription>
      </Alert>

      {/* Electron environment banner — surfaced when the CDP module
          suppressed port probes and capped confidence. Helps users running
          VSCode / Slack / Discord understand why the verdict is conservative. */}
      {data.isElectron && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <div className="font-medium">{t.electronBannerTitle}</div>
            <div className="text-muted-foreground mt-1">{t.electronBannerBody}</div>
          </AlertDescription>
        </Alert>
      )}

      {/* Overall verdict */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            {t.resultTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${strengthColor}`}>{strengthLabel}</div>
              <div className="text-sm text-muted-foreground">{t.strength}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{confidencePct}%</div>
              <div className="text-sm text-muted-foreground">{t.confidence}</div>
            </div>
            <div className="text-center">
              <div
                className={`text-2xl font-bold ${data.webdriverFlag ? 'text-red-500' : 'text-green-500'}`}
              >
                {data.webdriverFlag === true
                  ? 'true'
                  : data.webdriverFlag === false
                    ? 'false'
                    : 'N/A'}
              </div>
              <div className="text-sm text-muted-foreground">navigator.webdriver</div>
            </div>
          </div>
          {data.evidence && (
            <div className="text-sm text-muted-foreground mt-2">
              <span className="font-medium">{t.evidenceLabel}</span>
              {data.evidence}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signal 1: navigator.webdriver */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t.webdriverSection}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {data.webdriverFlag === true ? (
              <>
                <ShieldAlert className="h-5 w-5 text-red-500" />
                <div>
                  <div className="font-medium text-red-600">{t.webdriverTrueLabel}</div>
                  <div className="text-sm text-muted-foreground">{t.webdriverTrueBody}</div>
                </div>
              </>
            ) : data.webdriverFlag === false ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <div className="font-medium text-green-600">{t.webdriverFalseLabel}</div>
                  <div className="text-sm text-muted-foreground">{t.webdriverFalseBody}</div>
                </div>
              </>
            ) : (
              <>
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium">{t.webdriverUndefinedLabel}</div>
                  <div className="text-sm text-muted-foreground">{t.webdriverUndefinedBody}</div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Signal 2: port probes */}
      {data.portProbes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t.portsSection}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">{t.portsCols.port}</th>
                    <th className="text-left py-2 px-2">{t.portsCols.address}</th>
                    <th className="text-right py-2 px-2">{t.portsCols.probeTime}</th>
                    <th className="text-right py-2 px-2">{t.portsCols.controlTime}</th>
                    <th className="text-right py-2 px-2">{t.portsCols.delta}</th>
                    <th className="text-center py-2 px-2">{t.portsCols.verdict}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.portProbes.map((probe, idx) => {
                    const inconclusive = !probe.blocked && !probe.stalled && probe.probeCount === 0;
                    return (
                      <tr key={idx} className="border-b last:border-b-0">
                        <td className="py-2 px-2 font-mono">{probe.port}</td>
                        <td className="py-2 px-2 font-mono text-xs">{probe.address}</td>
                        <td className="py-2 px-2 text-right font-mono">
                          {probe.stalled
                            ? t.portsStalled
                            : probe.probeCount === 0
                              ? '—'
                              : `${probe.avgTimeMs.toFixed(1)}ms`}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {probe.controlAvgTimeMs.toFixed(1)}ms
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {probe.stalled || probe.probeCount === 0
                            ? '—'
                            : `${probe.deltaMs.toFixed(1)}ms`}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {probe.stalled ? (
                            <Badge variant="destructive">{t.portsStalledBadge}</Badge>
                          ) : probe.blocked ? (
                            <Badge variant="outline">{t.portsBlocked}</Badge>
                          ) : probe.likelyOpen ? (
                            <Badge variant="destructive">{t.portsLikelyOpen}</Badge>
                          ) : inconclusive ? (
                            <Badge variant="outline">{t.portsInconclusive}</Badge>
                          ) : (
                            <Badge variant="secondary">{t.portsClosed}</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {data.portProbes.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t.portsSection}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              {data.isElectron
                ? t.portsSkippedElectron
                : data.isChromium
                  ? t.portsBlockedByPolicy
                  : t.portsSkippedNonChromium}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signal 3: automation fingerprint */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t.signalsSection}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.automationSignals.map(signal => (
            <div key={signal.id} className="flex items-center gap-3 py-1">
              {signal.present ? (
                <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
              )}
              <span className="text-sm">{signal.description}</span>
              <Badge variant={signal.present ? 'destructive' : 'secondary'} className="ml-auto">
                {signal.present ? t.signalDetected : t.signalNormal}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>{t.recommendationsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <h4 className="font-medium">{t.defenseHeading}</h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              {t.tips.map((tip, i) => (
                <li key={i}>• {tip}</li>
              ))}
              <li>
                • {t.lsofTipPrefix}
                <code>lsof -i :9222</code>
                {t.lsofTipMiddle}
                <code>chrome://inspect</code>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
