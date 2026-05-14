import { notFound, redirect } from 'next/navigation';

import { BackLink } from '@/components/ui/back-link';
import { getOptionalUser } from '@/lib/api/auth';
import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages, htmlLang } from '@/lib/i18n/messages';
import prisma from '@/lib/prisma';
import type { OverallAssessment } from '@/lib/risk';
import { DeleteScanButton } from '../delete-scan-button';
import { ScanReplay } from './scan-replay';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
}

export default async function ScanDetailPage({ params }: Props) {
  const user = await getOptionalUser();
  if (!user) redirect(`/app?login=1&next=/scans/${params.id}`);

  const locale = getLocale();
  const m = getMessages(locale);

  const scan = await prisma.detectScan.findFirst({
    where: { id: params.id, userId: user.id },
    select: {
      id: true,
      name: true,
      createdAt: true,
      score: true,
      level: true,
      ipCountry: true,
      ipRegion: true,
      ipCity: true,
      ipAsn: true,
      ipIsVpn: true,
      tlsJa3: true,
      tlsJa4: true,
      serverUserAgent: true,
      acceptLanguage: true,
      payload: true,
    },
  });

  if (!scan) notFound();

  const payload = scan.payload as { assessment: OverallAssessment } | null;
  const assessment = payload?.assessment;
  if (!assessment) notFound();

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <BackLink href="/scans">{m.scans.returnToList}</BackLink>
        </div>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight truncate">
              {scan.name ?? m.scans.scanDetails}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {m.scans.savedAt(scan.createdAt.toLocaleString(htmlLang[locale]))}
            </p>
          </div>
          <DeleteScanButton scanId={scan.id} afterDelete="redirect" variant="full" />
        </div>

        <ScanReplay
          assessment={assessment}
          serverContext={{
            ipCountry: scan.ipCountry,
            ipRegion: scan.ipRegion,
            ipCity: scan.ipCity,
            ipAsn: scan.ipAsn,
            ipIsVpn: scan.ipIsVpn,
            tlsJa3: scan.tlsJa3,
            tlsJa4: scan.tlsJa4,
            serverUserAgent: scan.serverUserAgent,
            acceptLanguage: scan.acceptLanguage,
          }}
        />
      </div>
    </main>
  );
}
