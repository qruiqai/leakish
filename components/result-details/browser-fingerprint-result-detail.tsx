'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { BrowserFingerprintData, DetectionResult } from '@/lib/detection-modules';
import { useMessages } from '@/lib/i18n/locale-client';
import { motion } from 'framer-motion';
import { Monitor, Globe, Clock, Cpu, HardDrive, Wifi } from 'lucide-react';

interface BrowserFingerprintResultDetailProps {
  result: DetectionResult<BrowserFingerprintData>;
}

export function BrowserFingerprintResultDetail({ result }: BrowserFingerprintResultDetailProps) {
  const m = useMessages();
  const t = m.results.browserFp;

  if (!result.success || !result.data) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              {result.error || m.results.detectionFailed}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = result.data;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2">{t.heading}</h2>
        <p className="text-muted-foreground">
          {t.detectedAtLabel}: {result.detectedAt.toLocaleString()}
        </p>
      </div>

      {/* Browser Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            {t.browserInfoTitle}
          </CardTitle>
          <CardDescription>{t.browserInfoDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <label className="text-sm font-medium text-muted-foreground">
                  {t.userAgentLabel}
                </label>
                <code className="block text-sm mt-1 break-all">{data.userAgent}</code>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <label className="text-sm font-medium text-muted-foreground">
                    {t.platformLabel}
                  </label>
                  <p className="text-lg font-mono">{data.platform}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <label className="text-sm font-medium text-muted-foreground">
                    {t.primaryLanguageLabel}
                  </label>
                  <p className="text-lg font-mono">{data.language}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-400">{t.userAgentTip}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Screen Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            {t.screenTitle}
          </CardTitle>
          <CardDescription>{t.screenDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">{t.resolution}</label>
              <p className="text-lg font-mono">
                {data.screenResolution.width} × {data.screenResolution.height}
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">{t.colorDepth}</label>
              <p className="text-lg font-mono">
                {m.results.shared.bits(data.screenResolution.colorDepth)}
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">{t.pixelDepth}</label>
              <p className="text-lg font-mono">
                {m.results.shared.bits(data.screenResolution.pixelDepth)}
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">
                {t.screenFingerprint}
              </label>
              <code className="text-sm">
                {data.screenResolution.width}x{data.screenResolution.height}x
                {data.screenResolution.colorDepth}
              </code>
            </div>
          </div>

          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-400">{t.screenWarning}</p>
          </div>
        </CardContent>
      </Card>

      {/* Language Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t.languagesTitle}
          </CardTitle>
          <CardDescription>{t.languagesDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">
                {t.languagesSupported(data.languages.length)}
              </label>
              <div className="flex flex-wrap gap-2 mt-2">
                {data.languages.map((lang, index) => (
                  <Badge key={index} variant="outline" className="font-mono">
                    {lang}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timezone Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t.timezoneTitle}
          </CardTitle>
          <CardDescription>{t.timezoneDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">{t.timezoneName}</label>
              <p className="text-lg font-mono">{data.timezone.name}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">
                {t.timezoneOffset}
              </label>
              <p className="text-lg font-mono">
                {t.timezoneOffsetValue(
                  data.timezone.offset > 0 ? '-' : '+',
                  Math.abs(data.timezone.offset / 60)
                )}
              </p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">{t.timezoneWarning}</p>
          </div>
        </CardContent>
      </Card>

      {/* Hardware Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            {t.hardwareTitle}
          </CardTitle>
          <CardDescription>{t.hardwareDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">{t.cpuCores}</label>
              <p className="text-lg font-mono">{data.hardwareConcurrency}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">{t.deviceMemory}</label>
              <p className="text-lg font-mono">
                {data.deviceMemory ? `${data.deviceMemory} GB` : m.results.shared.notProvided}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Browser Plugins */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            {t.pluginsTitle}
            <Badge variant="secondary">{data.plugins.length}</Badge>
          </CardTitle>
          <CardDescription>{t.pluginsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.plugins.length > 0 ? (
            <div className="space-y-3">
              <div className="grid gap-2">
                {data.plugins.map((plugin, index) => (
                  <motion.div
                    key={plugin}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="p-3 bg-muted/50 rounded-lg"
                  >
                    <code className="text-sm">{plugin}</code>
                  </motion.div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                <p className="text-sm text-amber-700 dark:text-amber-400">{t.pluginsWarning}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <HardDrive className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t.pluginsEmpty}</p>
              <p className="text-xs mt-1">{t.pluginsEmptyHint}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Privacy Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            {t.privacyTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">{t.cookieEnabled}</label>
              <Badge variant={data.cookieEnabled ? 'default' : 'secondary'}>
                {data.cookieEnabled ? m.results.shared.yes : m.results.shared.no}
              </Badge>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">{t.doNotTrack}</label>
              <Badge variant="outline">{data.doNotTrack || t.doNotTrackUnset}</Badge>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">{t.onlineStatus}</label>
              <Badge variant={data.onlineStatus ? 'default' : 'secondary'}>
                {data.onlineStatus ? t.onlineYes : t.onlineNo}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fingerprint Risk Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>{t.analysisTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-500">{m.results.shared.high}</div>
                <div className="text-sm text-muted-foreground">{t.analysisUserAgent}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-500">{m.results.shared.medium}</div>
                <div className="text-sm text-muted-foreground">{t.analysisScreen}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-500">
                  {data.plugins.length > 0 ? m.results.shared.high : m.results.shared.low}
                </div>
                <div className="text-sm text-muted-foreground">{t.analysisPlugins}</div>
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm">{m.results.shared.uniquenessIn(Math.pow(2, 16))}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Protection Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>{m.results.protectionRecommendations}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              t.recommendations.privateMode,
              t.recommendations.extensions,
              t.recommendations.spoofUa,
              t.recommendations.tor,
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
