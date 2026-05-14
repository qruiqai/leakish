'use client';

import { useMemo } from 'react';

import { useMessages } from '@/lib/i18n/locale-client';
import type { ScanSummary, UserAnalytics } from '@/lib/server/analytics';

import { AnomalyList } from './anomaly-list';
import { DistributionGrid } from './distribution-chart';
import { HashRepetition } from './hash-repetition';
import { ScanCompare } from './scan-compare';
import { Timeline } from './timeline';

interface Props {
  analytics: UserAnalytics;
  scanSummaries: ScanSummary[];
}

export function AnalyticsDashboard({ analytics, scanSummaries }: Props) {
  const m = useMessages();

  const stats = useMemo(() => {
    const outlierCount = analytics.outliers.length;
    const repeatedHashGroups = Object.values(analytics.ownHashRepetition).reduce(
      (sum, groups) => sum + groups.length,
      0
    );
    const countries = new Set<string>();
    analytics.distribution.ipCountry.forEach(b => {
      if (b.value !== '(unknown)') countries.add(b.value);
    });
    const asns = new Set<string>();
    analytics.distribution.ipAsn.forEach(b => {
      if (b.value !== '(unknown)') asns.add(b.value);
    });
    return {
      outlierCount,
      repeatedHashGroups,
      geoCount: countries.size + asns.size,
    };
  }, [analytics]);

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <SummaryStat label={m.analytics.summary.totalScans} value={String(analytics.totalScans)} />
        <SummaryStat
          label={m.analytics.summary.outliers}
          value={String(stats.outlierCount)}
          tone={stats.outlierCount > 0 ? 'warning' : 'success'}
        />
        <SummaryStat
          label={m.analytics.summary.repeatedHashes}
          value={String(stats.repeatedHashGroups)}
          tone={stats.repeatedHashGroups > 0 ? 'danger' : 'success'}
        />
        <SummaryStat label={m.analytics.summary.geoCount} value={String(stats.geoCount)} />
      </section>

      <Section
        title={m.analytics.sections.distribution}
        hint={m.analytics.sections.distributionHint}
      >
        <DistributionGrid distribution={analytics.distribution} totalScans={analytics.totalScans} />
      </Section>

      <Section title={m.analytics.sections.repetition} hint={m.analytics.sections.repetitionHint}>
        <HashRepetition
          repetition={analytics.ownHashRepetition}
          totalScans={analytics.totalScans}
        />
      </Section>

      <Section title={m.analytics.sections.timeline} hint={m.analytics.sections.timelineHint}>
        <Timeline timeline={analytics.timeline} />
      </Section>

      <Section title={m.analytics.sections.outliers} hint={m.analytics.sections.outliersHint}>
        <AnomalyList outliers={analytics.outliers} />
      </Section>

      <Section title={m.analytics.sections.compare} hint={m.analytics.sections.compareHint}>
        <ScanCompare scanSummaries={scanSummaries} />
      </Section>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">{children}</div>
    </section>
  );
}

function SummaryStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-[hsl(var(--success))]'
      : tone === 'warning'
        ? 'text-[hsl(var(--warning))]'
        : tone === 'danger'
          ? 'text-destructive'
          : 'text-foreground';
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}
