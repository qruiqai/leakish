import { redirect } from 'next/navigation';

import { BackLink } from '@/components/ui/back-link';
import { getOptionalUser } from '@/lib/api/auth';
import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages } from '@/lib/i18n/messages';
import prisma from '@/lib/prisma';
import { computeUserAnalytics, toScanSummary, type AnalyticsScan } from '@/lib/server/analytics';

import { AnalyticsDashboard } from './analytics-dashboard';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const user = await getOptionalUser();
  if (!user) redirect('/app?login=1&next=/scans/analytics');

  const locale = getLocale();
  const m = getMessages(locale);

  const rows = await prisma.detectScan.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      createdAt: true,
      score: true,
      level: true,
      ipPublic: true,
      ipCountry: true,
      ipAsn: true,
      webrtcIpMismatch: true,
      platform: true,
      language: true,
      timezoneName: true,
      screenWidth: true,
      screenHeight: true,
      webglRenderer: true,
      fontTotalCount: true,
      uaHash: true,
      canvas2dHash: true,
      webglHash: true,
      audioHash: true,
      fontsetHash: true,
    },
  });

  const scans: AnalyticsScan[] = rows;
  const analytics = computeUserAnalytics(scans);
  const scanSummaries = scans.map(toScanSummary);

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <BackLink href="/scans">{m.analytics.backToHistory}</BackLink>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{m.analytics.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{m.analytics.intro}</p>
        </div>

        {scans.length < 2 ? (
          <div className="rounded-2xl border border-border/60 bg-card p-10 text-center">
            <h3 className="text-base font-semibold">{m.analytics.needMore}</h3>
          </div>
        ) : (
          <AnalyticsDashboard analytics={analytics} scanSummaries={scanSummaries} />
        )}
      </div>
    </main>
  );
}
