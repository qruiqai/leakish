'use client';

import { AlertTriangle, ShieldCheck, Volume2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AudioFingerprintData, DetectionResult } from '@/lib/detection-modules';
import { useMessages } from '@/lib/i18n/locale-client';

interface Props {
  result: DetectionResult<AudioFingerprintData>;
}

function formatLatency(ms: number | undefined): string {
  if (ms === undefined) return '—';
  return `${(ms * 1000).toFixed(2)} ms`;
}

export function AudioFingerprintResultDetail({ result }: Props) {
  const m = useMessages();
  if (!result.success || !result.data) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              {result.error ?? m.results.detectionFailed}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = result.data;
  const hasFingerprint =
    data.audioContextFingerprint.length > 0 && data.audioContextFingerprint !== '0';
  const t = m.results.audio;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t.heading}</h2>
        <p className="text-muted-foreground">
          {m.results.detectedAt}: {result.detectedAt.toLocaleString()}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" aria-hidden="true" />
            {m.results.riskStatus}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`p-4 rounded-lg flex items-center gap-3 ${
              hasFingerprint
                ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
                : 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400'
            }`}
          >
            {hasFingerprint ? (
              <>
                <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                <div>
                  <p className="font-semibold">{t.unique}</p>
                  <p className="text-sm opacity-90">{t.uniqueHint}</p>
                </div>
              </>
            ) : (
              <>
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                <div>
                  <p className="font-semibold">{t.safe}</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.dataTitle}</CardTitle>
          <CardDescription>{t.dataHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">{t.fingerprint}</label>
              <code className="block text-sm mt-1 break-all font-mono">
                {data.audioContextFingerprint}
              </code>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted/50 rounded-lg">
                <label className="text-sm font-medium text-muted-foreground">{t.sampleRate}</label>
                <p className="text-lg font-mono">{data.sampleRate} Hz</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <label className="text-sm font-medium text-muted-foreground">
                  {t.maxChannelCount}
                </label>
                <p className="text-lg font-mono">{data.maxChannelCount}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <label className="text-sm font-medium text-muted-foreground">
                  {t.channelCount}
                </label>
                <p className="text-lg font-mono">{data.channelCount}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <label className="text-sm font-medium text-muted-foreground">{t.state}</label>
                <Badge variant="outline">{data.state}</Badge>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <label className="text-sm font-medium text-muted-foreground">{t.baseLatency}</label>
                <p className="text-lg font-mono">{formatLatency(data.baseLatency)}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <label className="text-sm font-medium text-muted-foreground">
                  {t.outputLatency}
                </label>
                <p className="text-lg font-mono">{formatLatency(data.outputLatency)}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <label className="text-sm font-medium text-muted-foreground">
                  {t.channelCountMode}
                </label>
                <p className="text-sm font-mono">{data.channelCountMode}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <label className="text-sm font-medium text-muted-foreground">
                  {t.channelInterpretation}
                </label>
                <p className="text-sm font-mono">{data.channelInterpretation}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.recommendations.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              t.recommendations.resistFingerprint,
              t.recommendations.extension,
              t.recommendations.privacyBrowser,
            ].map(rec => (
              <div key={rec.title} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <p className="font-medium">{rec.title}</p>
                  <p className="text-sm text-muted-foreground">{rec.body}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
