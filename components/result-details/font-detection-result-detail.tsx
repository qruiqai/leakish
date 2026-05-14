'use client';

import { AlertTriangle, ShieldCheck, Type } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DetectionResult, FontDetectionData } from '@/lib/detection-modules';
import { useMessages } from '@/lib/i18n/locale-client';

interface Props {
  result: DetectionResult<FontDetectionData>;
}

export function FontDetectionResultDetail({ result }: Props) {
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
  const hasUniqueFonts = data.uniqueFonts.length > 0;
  const t = m.results.font;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t.heading}</h2>
        <p className="text-muted-foreground">
          {m.results.detectedAt}: {result.detectedAt.toLocaleString()} ·{' '}
          {t.totalFonts(data.totalFonts)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" aria-hidden="true" />
            {m.results.riskStatus}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`p-4 rounded-lg flex items-center gap-3 ${
              hasUniqueFonts
                ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
                : 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400'
            }`}
          >
            {hasUniqueFonts ? (
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t.common}
              <Badge variant="secondary">{data.commonFonts.length}</Badge>
            </CardTitle>
            <CardDescription>{t.commonHint}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.commonFonts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {data.commonFonts.map(font => (
                  <Badge key={font} variant="outline" className="font-mono text-xs">
                    {font}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{m.results.empty}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t.uniqueFonts}
              <Badge variant={hasUniqueFonts ? 'destructive' : 'secondary'}>
                {data.uniqueFonts.length}
              </Badge>
            </CardTitle>
            <CardDescription>{t.uniqueFontsHint}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.uniqueFonts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {data.uniqueFonts.map(font => (
                  <Badge key={font} variant="outline" className="font-mono text-xs">
                    {font}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{m.results.empty}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t.installed}
            <Badge variant="secondary">{data.totalFonts}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.installedFonts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.installedFonts.map(font => (
                <Badge key={font} variant="outline" className="font-mono text-xs">
                  {font}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t.noAvailable}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.recommendations.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              t.recommendations.disableEnum,
              t.recommendations.limitFonts,
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
