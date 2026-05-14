import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, ShieldAlert } from 'lucide-react';

import { UsageMeter, type UsageMeterData } from '@/components/billing/usage-meter';
import { BackLink } from '@/components/ui/back-link';
import { getOptionalUser } from '@/lib/api/auth';
import { getEntitlement } from '@/lib/billing/entitlement';
import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages, htmlLang, type Locale, type Messages } from '@/lib/i18n/messages';
import prisma from '@/lib/prisma';
import { ScanRow, type ToneSpec } from './scan-row';

export const dynamic = 'force-dynamic';

function levelCopy(m: Messages): Record<string, ToneSpec> {
  return {
    safe: {
      label: m.overview.levelSafe,
      tone: 'text-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]',
      bar: 'bg-[hsl(var(--success))]',
    },
    warning: {
      label: m.overview.levelWarning,
      tone: 'text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)]',
      bar: 'bg-[hsl(var(--warning))]',
    },
    critical: {
      label: m.overview.levelCritical,
      tone: 'text-destructive bg-destructive/10',
      bar: 'bg-destructive',
    },
    unknown: {
      label: m.overview.levelUnknown,
      tone: 'text-muted-foreground bg-muted/40',
      bar: 'bg-muted-foreground/40',
    },
  };
}

export default async function ScansListPage() {
  const user = await getOptionalUser();
  if (!user) redirect('/app?login=1&next=/scans');

  const locale = getLocale();
  const m = getMessages(locale);
  const LEVEL_COPY = levelCopy(m);

  const [scans, entitlement] = await Promise.all([
    prisma.detectScan.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        createdAt: true,
        score: true,
        level: true,
        ipCountry: true,
        ipCity: true,
        ipAsn: true,
        ipIsVpn: true,
      },
    }),
    getEntitlement(user.id),
  ]);

  const usage: UsageMeterData = {
    plan: entitlement.plan,
    status: entitlement.status,
    scansUsed: entitlement.scansUsed,
    scansLimit: entitlement.scansLimit,
    retainCap: entitlement.retainCap,
    periodEnd: entitlement.periodEnd.toISOString(),
    isPaid: entitlement.isPaid,
  };

  // Cheap aggregates so we don't need a second query.
  const totalCount = scans.length;
  const avgScore =
    totalCount === 0 ? null : Math.round(scans.reduce((sum, s) => sum + s.score, 0) / totalCount);
  const latest = scans[0] ?? null;
  const latestRel = latest ? formatRelative(latest.createdAt, locale, m) : null;

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <BackLink href="/">{m.scans.backToDetector}</BackLink>
        </div>

        <div className="mb-6 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{m.scans.historyHeading}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {m.scans.historyIntro(Math.min(totalCount, 100))}
            </p>
          </div>
        </div>

        {totalCount >= 2 && (
          <div className="mb-3">
            <Link
              href="/scans/analytics"
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
            >
              {m.analytics.openCta}
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        )}

        <div className="mb-5">
          <UsageMeter initial={usage} compact />
        </div>

        {totalCount > 0 && (
          <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3">
            <SummaryStat
              label={m.scans.avgScore}
              value={avgScore === null ? '—' : String(avgScore)}
              suffix="/ 100"
              tone={
                avgScore === null
                  ? 'muted'
                  : avgScore >= 85
                    ? 'success'
                    : avgScore >= 60
                      ? 'warning'
                      : 'danger'
              }
            />
            <SummaryStat
              label={m.scans.lastScan}
              value={latest ? `${latest.score}` : '—'}
              suffix={latestRel ?? ''}
              tone={
                !latest
                  ? 'muted'
                  : latest.level === 'safe'
                    ? 'success'
                    : latest.level === 'warning'
                      ? 'warning'
                      : latest.level === 'critical'
                        ? 'danger'
                        : 'muted'
              }
            />
          </div>
        )}

        {scans.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card p-10 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <ShieldAlert className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold">{m.scans.empty}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{m.scans.emptyHint}</p>
          </div>
        ) : (
          <ul className="space-y-2" role="list">
            {scans.map(scan => (
              <ScanRow
                key={scan.id}
                scan={scan}
                tone={LEVEL_COPY[scan.level] ?? LEVEL_COPY.unknown}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function SummaryStat({
  label,
  value,
  suffix,
  tone = 'default',
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-[hsl(var(--success))]'
      : tone === 'warning'
        ? 'text-[hsl(var(--warning))]'
        : tone === 'danger'
          ? 'text-destructive'
          : tone === 'muted'
            ? 'text-muted-foreground'
            : 'text-foreground';

  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`text-xl font-semibold tabular-nums ${valueClass}`}>{value}</span>
        {suffix && <span className="text-[11px] text-muted-foreground truncate">{suffix}</span>}
      </div>
    </div>
  );
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function formatRelative(when: Date, locale: Locale, m: Messages): string {
  const ms = Date.now() - when.getTime();
  if (ms < MINUTE) return m.scans.justNow;
  if (ms < HOUR) return m.scans.minutesAgo(Math.round(ms / MINUTE));
  if (ms < DAY) return m.scans.hoursAgo(Math.round(ms / HOUR));
  if (ms < 7 * DAY) return m.scans.daysAgo(Math.round(ms / DAY));
  return when.toLocaleDateString(htmlLang[locale]);
}
