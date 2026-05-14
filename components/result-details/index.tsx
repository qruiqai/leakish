'use client';

import { Card, CardContent } from '@/components/ui/card';
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
import { useMessages } from '@/lib/i18n/locale-client';
import { localizeModule } from '@/lib/i18n/localize-module';
import { AudioFingerprintResultDetail } from './audio-fingerprint-result-detail';
import { BrowserFingerprintResultDetail } from './browser-fingerprint-result-detail';
import { CanvasFingerprintResultDetail } from './canvas-fingerprint-result-detail';
import { CDPResultDetail } from './cdp-result-detail';
import { DNSResultDetail } from './dns-result-detail';
import { FontDetectionResultDetail } from './font-detection-result-detail';
import { NetworkProbeResultDetail } from './network-probe-result-detail';
import { WebRTCResultDetail } from './webrtc-result-detail';

interface ResultDetailProps {
  module: DetectionModule;
  result: DetectionResult;
}

export function ResultDetail({ module, result }: ResultDetailProps) {
  switch (module.id) {
    case 'network-probe':
      return <NetworkProbeResultDetail result={result as DetectionResult<NetworkProbeData>} />;
    case 'webrtc':
      return <WebRTCResultDetail result={result as DetectionResult<WebRTCData>} />;
    case 'browser-fingerprint':
      return (
        <BrowserFingerprintResultDetail
          result={result as DetectionResult<BrowserFingerprintData>}
        />
      );
    case 'canvas-fingerprint':
      return (
        <CanvasFingerprintResultDetail result={result as DetectionResult<CanvasFingerprintData>} />
      );
    case 'audio-fingerprint':
      return (
        <AudioFingerprintResultDetail result={result as DetectionResult<AudioFingerprintData>} />
      );
    case 'font-detection':
      return <FontDetectionResultDetail result={result as DetectionResult<FontDetectionData>} />;
    case 'dns':
      return <DNSResultDetail result={result as DetectionResult<DNSData>} />;
    case 'cdp-detection':
      return <CDPResultDetail result={result as DetectionResult<CDPDetectionData>} />;
    default:
      return <DefaultResultDetail module={module} result={result} />;
  }
}

function DefaultResultDetail({
  module,
  result,
}: {
  module: DetectionModule;
  result: DetectionResult;
}) {
  const m = useMessages();
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">
        {m.results.defaultHeading(localizeModule(m, module).name)}
      </h2>
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  {m.results.detectionStatus}
                </label>
                <p className={result.success ? 'text-green-600' : 'text-red-600'}>
                  {result.success ? m.detector.success : m.detector.failed}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  {m.results.detectedAt}
                </label>
                <p className="text-sm">{result.detectedAt.toLocaleString()}</p>
              </div>
            </div>

            {result.error && (
              <div>
                <h3 className="text-lg font-semibold mb-2 text-red-600">{m.results.errorInfo}</h3>
                <p className="text-sm text-red-600">{result.error}</p>
              </div>
            )}

            {result.data !== undefined && result.data !== null && (
              <div>
                <h3 className="text-lg font-semibold mb-2">{m.results.rawData}</h3>
                <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </div>
            )}

            {result.metadata && (
              <div>
                <h3 className="text-lg font-semibold mb-2">{m.results.metadata}</h3>
                <pre className="text-xs bg-muted p-4 rounded overflow-auto">
                  {JSON.stringify(result.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
