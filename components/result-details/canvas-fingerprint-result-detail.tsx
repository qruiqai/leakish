'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CanvasFingerprintData, DetectionResult } from '@/lib/detection-modules';
import { useMessages } from '@/lib/i18n/locale-client';
import { motion } from 'framer-motion';
// Lucide's `Image` icon collides with the DOM's Image global, so alias it.
import { Image as ImageIcon, Monitor, Palette, Shield, Eye } from 'lucide-react';

interface CanvasFingerprintResultDetailProps {
  result: DetectionResult<CanvasFingerprintData>;
}

export function CanvasFingerprintResultDetail({ result }: CanvasFingerprintResultDetailProps) {
  const m = useMessages();
  const t = m.results.canvas;

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

      {/* Canvas 2D Fingerprint */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            {t.canvas2dTitle}
          </CardTitle>
          <CardDescription>{t.canvas2dDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">
                {t.fingerprintHash}
              </label>
              <code className="block text-sm mt-1 break-all font-mono">
                {(result.metadata?.canvas2DHash as string) || 'N/A'}
              </code>
            </div>

            {data.canvas2D && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  {t.renderPreview}
                </label>
                <div className="border rounded-lg p-4 bg-white">
                  <img
                    src={data.canvas2D}
                    alt={t.canvas2dPreviewAlt}
                    className="max-w-full h-auto border rounded"
                  />
                </div>
              </div>
            )}

            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-400">{t.canvas2dWarning}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Canvas Text Fingerprint */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            {t.textTitle}
          </CardTitle>
          <CardDescription>{t.textDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <label className="text-sm font-medium text-muted-foreground">
                {t.textFingerprintHash}
              </label>
              <code className="block text-sm mt-1 break-all font-mono">
                {(result.metadata?.canvasTextHash as string) || 'N/A'}
              </code>
            </div>

            {data.canvasText && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  {t.textPreview}
                </label>
                <div className="border rounded-lg p-4 bg-white">
                  <img
                    src={data.canvasText}
                    alt={t.textPreviewAlt}
                    className="max-w-full h-auto border rounded"
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* WebGL Fingerprint */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
            {t.webglTitle}
            <Badge variant={data.canvasWebGL ? 'default' : 'secondary'}>
              {data.canvasWebGL ? m.results.shared.supported : m.results.shared.unsupported}
            </Badge>
          </CardTitle>
          <CardDescription>{t.webglDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.canvasWebGL ? (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  {t.webglPreview}
                </label>
                <div className="border rounded-lg p-4 bg-white">
                  <img
                    src={data.canvasWebGL}
                    alt={t.webglPreviewAlt}
                    className="max-w-full h-auto border rounded"
                  />
                </div>
              </div>

              <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-400">{t.webglWarning}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" aria-hidden="true" />
              <p>{t.webglDisabled}</p>
              <p className="text-xs mt-1">{t.webglDisabledHint}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supported Formats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            {t.formatsTitle}
            <Badge variant="secondary">{data.supportedFormats.length}</Badge>
          </CardTitle>
          <CardDescription>{t.formatsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {data.supportedFormats.map((format, index) => (
                <motion.div
                  key={format}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Badge variant="outline" className="font-mono">
                    {format}
                  </Badge>
                </motion.div>
              ))}
            </div>

            {data.supportedFormats.length === 0 && (
              <div className="text-center py-4 text-muted-foreground">
                <p>{t.formatsEmpty}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Fingerprint Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {m.results.fingerprintAnalysis}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-500">{t.analysisValues.medium}</div>
                <div className="text-sm text-muted-foreground">{t.analysisLabels.canvas2d}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-500">
                  {data.canvasWebGL ? t.analysisValues.high : t.analysisValues.low}
                </div>
                <div className="text-sm text-muted-foreground">{t.analysisLabels.webgl}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">{t.analysisValues.low}</div>
                <div className="text-sm text-muted-foreground">{t.analysisLabels.formats}</div>
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm">
                <span className="font-medium">{t.uniquenessAssess}</span>{' '}
                {t.uniquenessText(Math.pow(2, data.canvasWebGL ? 20 : 12))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Technical Details */}
      <Card>
        <CardHeader>
          <CardTitle>{m.results.technicalDetails}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t.techCanvas2d}</label>
              <Badge variant="default">{m.results.shared.supported}</Badge>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t.techWebgl}</label>
              <Badge variant={data.canvasWebGL ? 'default' : 'secondary'}>
                {data.canvasWebGL ? m.results.shared.supported : m.results.shared.unsupported}
              </Badge>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t.techFormats}</label>
              <p className="text-lg font-mono">{data.supportedFormats.length}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                {m.results.riskLevelLabel}
              </label>
              <Badge variant={data.canvasWebGL ? 'destructive' : 'default'}>
                {data.canvasWebGL ? t.riskHigh : t.riskMedium}
              </Badge>
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
              t.recommendations.block,
              t.recommendations.disableWebgl,
              t.recommendations.randomize,
              t.recommendations.strict,
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
