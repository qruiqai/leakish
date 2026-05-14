'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Globe, MapPin, ShieldCheck, ShieldAlert, Fingerprint, Languages } from 'lucide-react';
import type { DetectionResult, NetworkProbeData } from '@/lib/detection-modules';
import { useMessages } from '@/lib/i18n/locale-client';

interface Props {
  result: DetectionResult<NetworkProbeData>;
}

export function NetworkProbeResultDetail({ result }: Props) {
  const m = useMessages();
  const t = m.results.networkProbe;

  if (!result.success || !result.data) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>
            {t.detectionFailed}: {result.error || m.results.unknownError}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const d = result.data;
  const hasVpnSignal = d.isVpn || d.isProxy || d.isTor;
  const uaMismatch =
    !!d.serverUserAgent && !!d.clientUserAgent && d.serverUserAgent !== d.clientUserAgent;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t.heading}</h2>
        <p className="text-muted-foreground">
          {t.detectedAtLabel}
          {result.detectedAt.toLocaleString()}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" aria-hidden="true" />
            {t.realEgressTitle}
          </CardTitle>
          <CardDescription>{t.realEgressDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.ipLabel} value={d.ip ?? '—'} mono />
            <Field label={t.protocolLabel} value={d.ipFamily?.toUpperCase() ?? '—'} mono />
            <Field label={t.asnLabel} value={d.asn ?? '—'} mono />
            <Field label={t.ispLabel} value={d.asOrg ?? '—'} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" aria-hidden="true" />
            {t.geoTitle}
          </CardTitle>
          <CardDescription>{t.geoDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t.country} value={d.country ?? '—'} />
            <Field label={t.region} value={d.region ?? '—'} />
            <Field label={t.city} value={d.city ?? '—'} />
          </div>
          {d.clientTimezone && (
            <div className="mt-3 text-xs text-muted-foreground">
              {t.browserTimezone}
              <code className="font-mono">{d.clientTimezone}</code>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {hasVpnSignal ? (
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            )}
            {t.egressNatureTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <PrivacyBadge
              label={t.privacyVpn}
              value={d.isVpn}
              yes={t.privacyValueYes}
              no={t.privacyValueNo}
              unknown={t.privacyValueUnknown}
            />
            <PrivacyBadge
              label={t.privacyProxy}
              value={d.isProxy}
              yes={t.privacyValueYes}
              no={t.privacyValueNo}
              unknown={t.privacyValueUnknown}
            />
            <PrivacyBadge
              label={t.privacyTor}
              value={d.isTor}
              yes={t.privacyValueYes}
              no={t.privacyValueNo}
              unknown={t.privacyValueUnknown}
            />
            <PrivacyBadge
              label={t.privacyDatacenter}
              value={d.isHosting}
              yes={t.privacyValueYes}
              no={t.privacyValueNo}
              unknown={t.privacyValueUnknown}
            />
          </div>
          {d.isVpn === null && d.isProxy === null && (
            <p className="mt-3 text-xs text-muted-foreground">{t.privacyTokenNote}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5" aria-hidden="true" />
            {t.tlsTitle}
          </CardTitle>
          <CardDescription>{t.tlsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Field label="JA4" value={d.tlsJa4 ?? t.ja4Empty} mono />
          <Field label="JA3" value={d.tlsJa3 ?? '—'} mono />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" aria-hidden="true" />
            {t.headersTitle}
          </CardTitle>
          <CardDescription>{t.headersDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label={t.acceptLanguage} value={d.acceptLanguage ?? '—'} mono />
          <div className="grid grid-cols-1 gap-2">
            <div className="rounded-md bg-muted/50 p-3 space-y-2">
              <div className="text-xs text-muted-foreground">{t.serverUaLabel}</div>
              <code className="block text-xs break-all font-mono">{d.serverUserAgent ?? '—'}</code>
            </div>
            <div className="rounded-md bg-muted/50 p-3 space-y-2">
              <div className="text-xs text-muted-foreground">{t.clientUaLabel}</div>
              <code className="block text-xs break-all font-mono">{d.clientUserAgent ?? '—'}</code>
            </div>
            {uaMismatch && (
              <Badge variant="destructive" className="self-start">
                {t.uaMismatch}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm ${mono ? 'font-mono break-all' : ''}`}>{value}</div>
    </div>
  );
}

function PrivacyBadge({
  label,
  value,
  yes,
  no,
  unknown,
}: {
  label: string;
  value: boolean | null;
  yes: string;
  no: string;
  unknown: string;
}) {
  if (value === null) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {label}: {unknown}
      </Badge>
    );
  }
  return (
    <Badge variant={value ? 'destructive' : 'secondary'}>
      {label}: {value ? yes : no}
    </Badge>
  );
}
