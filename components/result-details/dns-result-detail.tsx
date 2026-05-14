'use client';

import type { DetectionResult, DNSData } from '@/lib/detection-modules';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, AlertTriangle, Network, Shield, Globe, Clock } from 'lucide-react';
import { useMessages } from '@/lib/i18n/locale-client';

interface DNSResultDetailProps {
  result: DetectionResult<DNSData>;
}

interface RiskItem {
  level: 'high' | 'medium' | 'low';
  message: string;
  description: string;
}

export function DNSResultDetail({ result }: DNSResultDetailProps) {
  const m = useMessages();
  const t = m.results.dns;

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

  const risks: RiskItem[] = [];
  if (data.dnsLeakDetected) {
    risks.push({
      level: 'high',
      message: t.risk.leakHeading,
      description: t.risk.leakBody,
    });
  }
  if (!data.dohSupport) {
    risks.push({
      level: 'medium',
      message: t.risk.nodohHeading,
      description: t.risk.nodohBody,
    });
  }
  if (!data.dnssecSupport) {
    risks.push({
      level: 'medium',
      message: t.risk.nodnssecHeading,
      description: t.risk.nodnssecBody,
    });
  }
  if (data.customDns) {
    risks.push({
      level: 'low',
      message: t.risk.customHeading,
      description: t.risk.customBody,
    });
  }

  const getRiskBadgeVariant = (level: string) => {
    switch (level) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const totalResolvers = Object.values(data.publicResolvers).reduce(
    (sum, resolver) => sum + resolver.ipv4.length + resolver.ipv6.length,
    0
  );

  return (
    <div className="p-6 space-y-6">
      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            {t.overview}
          </CardTitle>
          <CardDescription>{t.overviewDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{data.responseTime.toFixed(0)}ms</div>
              <div className="text-sm text-muted-foreground">{t.responseTime}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{totalResolvers}</div>
              <div className="text-sm text-muted-foreground">{t.availableResolvers}</div>
            </div>
            <div className="text-center">
              <div
                className={`text-2xl font-bold ${data.dohSupport ? 'text-green-500' : 'text-red-500'}`}
              >
                {data.dohSupport ? m.results.shared.supported : m.results.shared.unsupported}
              </div>
              <div className="text-sm text-muted-foreground">{t.dohEncryption}</div>
            </div>
            <div className="text-center">
              <div
                className={`text-2xl font-bold ${data.dnssecSupport ? 'text-green-500' : 'text-red-500'}`}
              >
                {data.dnssecSupport ? m.results.shared.enabled : m.results.shared.disabledShort}
              </div>
              <div className="text-sm text-muted-foreground">{t.dnssec}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Risks */}
      {risks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t.securityRisks}
            </CardTitle>
            <CardDescription>{t.risksFound(risks.length)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {risks.map((risk, index) => (
              <Alert key={index} variant={risk.level === 'high' ? 'destructive' : 'default'}>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    {risk.level === 'high' && <XCircle className="h-4 w-4 text-red-500" />}
                    {risk.level === 'medium' && (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                    {risk.level === 'low' && <AlertTriangle className="h-4 w-4 text-blue-500" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{risk.message}</span>
                      <Badge variant={getRiskBadgeVariant(risk.level)} className="text-xs">
                        {risk.level === 'high'
                          ? t.risk.highBadge
                          : risk.level === 'medium'
                            ? t.risk.mediumBadge
                            : t.risk.lowBadge}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">{risk.description}</div>
                  </div>
                </div>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* DNS Resolver Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t.resolversTitle}
          </CardTitle>
          <CardDescription>{t.resolversDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(data.publicResolvers).map(([provider, resolvers]) => {
            const totalCount = resolvers.ipv4.length + resolvers.ipv6.length;
            const isAvailable = totalCount > 0;

            return (
              <div key={provider} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">
                      {provider === 'google'
                        ? 'Google DNS'
                        : provider === 'cloudflare'
                          ? 'Cloudflare DNS'
                          : provider === 'quad9'
                            ? 'Quad9 DNS'
                            : provider}
                    </span>
                    {isAvailable ? (
                      <Badge variant="secondary" className="bg-green-50 text-green-700">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {t.resolverAvailable}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-red-50 text-red-700">
                        <XCircle className="h-3 w-3 mr-1" />
                        {t.resolverUnavailable}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t.resolverServers(totalCount)}
                  </div>
                </div>

                {isAvailable && (
                  <div className="grid md:grid-cols-2 gap-3">
                    {resolvers.ipv4.length > 0 && (
                      <div>
                        <div className="text-sm font-medium mb-1">{t.ipv4Servers}</div>
                        <div className="space-y-1">
                          {resolvers.ipv4.map((ip, idx) => (
                            <div key={idx} className="text-sm font-mono bg-muted px-2 py-1 rounded">
                              {ip}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {resolvers.ipv6.length > 0 && (
                      <div>
                        <div className="text-sm font-medium mb-1">{t.ipv6Servers}</div>
                        <div className="space-y-1">
                          {resolvers.ipv6.slice(0, 2).map((ip, idx) => (
                            <div key={idx} className="text-sm font-mono bg-muted px-2 py-1 rounded">
                              {ip}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Advanced */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t.advancedTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.resolverLocation && (
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm font-medium">{t.resolverLocation}</span>
              <span className="text-sm font-mono">{data.resolverLocation}</span>
            </div>
          )}
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-sm font-medium">{t.dohRow}</span>
            <Badge variant={data.dohSupport ? 'secondary' : 'outline'}>
              {data.dohSupport ? m.results.shared.supported : m.results.shared.unsupported}
            </Badge>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-sm font-medium">{t.dnssecRow}</span>
            <Badge variant={data.dnssecSupport ? 'secondary' : 'outline'}>
              {data.dnssecSupport ? m.results.shared.enabled : m.results.shared.disabledShort}
            </Badge>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-sm font-medium">{t.customRow}</span>
            <Badge variant={data.customDns ? 'secondary' : 'outline'}>
              {data.customDns ? m.results.shared.yes : m.results.shared.no}
            </Badge>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm font-medium">{t.leakRow}</span>
            <Badge variant={data.dnsLeakDetected ? 'destructive' : 'secondary'}>
              {data.dnsLeakDetected ? t.leakDetected : t.leakNotDetected}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>{t.recommendationsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <h4 className="font-medium">{t.improveDns}</h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              {t.tips.map((tip, i) => (
                <li key={i}>• {tip}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
