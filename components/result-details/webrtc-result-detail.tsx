'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DetectionResult, WebRTCData } from '@/lib/detection-modules';
import { useMessages } from '@/lib/i18n/locale-client';
import { motion } from 'framer-motion';
import { Wifi, Globe, Network, Shield, Info } from 'lucide-react';

interface WebRTCResultDetailProps {
  result: DetectionResult<WebRTCData>;
}

export function WebRTCResultDetail({ result }: WebRTCResultDetailProps) {
  const m = useMessages();
  const t = m.results.webrtc;

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
  const hasMDNS = data.debug?.mDNSCandidates && data.debug.mDNSCandidates.length > 0;
  const hasLeaks = data.localIPs.length > 0 || data.publicIPs.length > 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2">{t.heading}</h2>
        <p className="text-muted-foreground">
          {t.detectedAtLabel}: {result.detectedAt.toLocaleString()}
        </p>
      </div>

      {/* Security Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t.securityStatus}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`p-4 rounded-lg flex items-center gap-3 ${
              hasLeaks
                ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
                : hasMDNS
                  ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400'
                  : 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400'
            }`}
          >
            {hasLeaks ? (
              <>
                <Info className="h-6 w-6" />
                <div>
                  <p className="font-semibold">{t.leakedHeading}</p>
                  <p className="text-sm opacity-90">{t.leakedBody}</p>
                </div>
              </>
            ) : hasMDNS ? (
              <>
                <Shield className="h-6 w-6" />
                <div>
                  <p className="font-semibold">{t.privacyHeading}</p>
                  <p className="text-sm opacity-90">{t.privacyBody}</p>
                </div>
              </>
            ) : (
              <>
                <Shield className="h-6 w-6" />
                <div>
                  <p className="font-semibold">{t.safeHeading}</p>
                  <p className="text-sm opacity-90">{t.safeBody}</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Local IPs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            {t.localIpsTitle}
            <Badge variant="secondary">{data.localIPs.length}</Badge>
          </CardTitle>
          <CardDescription>{t.localIpsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.localIPs.length > 0 ? (
            <div className="space-y-3">
              <div className="grid gap-2">
                {data.localIPs.map((ip, index) => (
                  <motion.div
                    key={ip}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <code className="font-mono text-sm">{ip}</code>
                    <Badge variant="outline">{t.localIpBadge}</Badge>
                  </motion.div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                <p className="text-sm text-amber-700 dark:text-amber-400">{t.localIpWarning}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Wifi className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t.localIpEmpty}</p>
              <p className="text-xs mt-1">{t.localIpEmptyHint}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Public IPs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t.publicIpsTitle}
            <Badge variant="secondary">{data.publicIPs.length}</Badge>
          </CardTitle>
          <CardDescription>{t.publicIpsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.publicIPs.length > 0 ? (
            <div className="space-y-3">
              <div className="grid gap-2">
                {data.publicIPs.map((ip, index) => (
                  <motion.div
                    key={ip}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <code className="font-mono text-sm">{ip}</code>
                    <Badge variant="destructive">{t.publicIpBadge}</Badge>
                  </motion.div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-400">{t.publicIpWarning}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t.publicIpEmpty}</p>
              <p className="text-xs mt-1">{t.publicIpEmptyHint}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* IPv6 Addresses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            {t.ipv6Title}
            <Badge variant="secondary">{data.ipv6Addresses.length}</Badge>
          </CardTitle>
          <CardDescription>{t.ipv6Description}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.ipv6Addresses.length > 0 ? (
            <div className="space-y-3">
              <div className="grid gap-2">
                {data.ipv6Addresses.map((entry, index) => (
                  <motion.div
                    key={entry.address}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <code className="font-mono text-xs break-all">{entry.address}</code>
                    <Badge variant={entry.scope === 'global' ? 'destructive' : 'outline'}>
                      {(t.ipv6Scope as Record<string, string>)[entry.scope] ?? entry.scope}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Network className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t.ipv6Empty}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* mDNS Candidates */}
      {hasMDNS && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t.mdnsTitle}
              <Badge variant="secondary">{data.debug!.mDNSCandidates.length}</Badge>
            </CardTitle>
            <CardDescription>{t.mdnsDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid gap-2">
                {data.debug!.mDNSCandidates.map((candidate, index) => (
                  <motion.div
                    key={candidate}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <code className="font-mono text-sm">{candidate}</code>
                    <Badge variant="secondary">{t.mdnsBadge}</Badge>
                  </motion.div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-400">{t.mdnsSuccess}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Technical Details */}
      <Card>
        <CardHeader>
          <CardTitle>{m.results.technicalDetails}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t.iceCandidates}</label>
              <p className="text-lg font-mono">{data.debug?.totalCandidates || 0}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                {t.detectionMethod}
              </label>
              <p className="text-lg">WebRTC STUN</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                {t.privacyProtection}
              </label>
              <p className="text-lg">
                {hasMDNS ? m.results.shared.enabled : m.results.shared.disabledShort}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                {m.results.riskLevelLabel}
              </label>
              <Badge variant={hasLeaks ? 'destructive' : hasMDNS ? 'default' : 'secondary'}>
                {hasLeaks ? t.riskHigh : hasMDNS ? t.riskProtected : t.riskSafe}
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
              t.recommendations.extension,
              t.recommendations.disable,
              t.recommendations.privacyBrowser,
              t.recommendations.firewall,
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
