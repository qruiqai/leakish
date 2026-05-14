'use client';

import { useState } from 'react';
import Link from 'next/link';

import { useMessages } from '@/lib/i18n/locale-client';
import type { Bucket, DistributionFieldKey, UserAnalytics } from '@/lib/server/analytics';

const FIELD_ORDER: DistributionFieldKey[] = [
  'timezoneName',
  'platform',
  'language',
  'screenSize',
  'webglRenderer',
  'ipCountry',
  'ipAsn',
  'fontTotalCount',
];

export function DistributionGrid({
  distribution,
  totalScans,
}: {
  distribution: UserAnalytics['distribution'];
  totalScans: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {FIELD_ORDER.map(key => (
        <FieldDistribution
          key={key}
          fieldKey={key}
          buckets={distribution[key]}
          totalScans={totalScans}
        />
      ))}
    </div>
  );
}

function FieldDistribution({
  fieldKey,
  buckets,
  totalScans,
}: {
  fieldKey: DistributionFieldKey;
  buckets: Bucket[];
  totalScans: number;
}) {
  const m = useMessages();
  const [open, setOpen] = useState<string | null>(null);
  const label = m.analytics.distribution.field[fieldKey];
  const unique = buckets.length;

  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {m.analytics.distribution.bucketCountSuffix(unique)}
        </span>
      </div>
      <ul className="space-y-1.5" role="list">
        {buckets.slice(0, 8).map(bucket => {
          const pct = totalScans > 0 ? (bucket.count / totalScans) * 100 : 0;
          const minority = pct < 20;
          const expanded = open === bucket.value;
          return (
            <li key={bucket.value}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : bucket.value)}
                className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-muted/40"
                aria-expanded={expanded}
              >
                <span
                  className="truncate text-[12px] flex-shrink-0"
                  style={{ width: '40%' }}
                  title={bucket.value}
                >
                  {bucket.value === '(unknown)' ? m.analytics.distribution.unknown : bucket.value}
                </span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted/60">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full ${
                      minority ? 'bg-[hsl(var(--warning))]' : 'bg-primary/70'
                    }`}
                    style={{ width: `${Math.max(pct, 4)}%` }}
                  />
                </span>
                <span className="w-12 text-right text-[11px] tabular-nums text-muted-foreground">
                  {bucket.count}
                </span>
              </button>
              {expanded && (
                <ul className="ml-2 mt-1 flex flex-wrap gap-1.5" role="list">
                  {bucket.scanIds.map(id => (
                    <li key={id}>
                      <Link
                        href={`/scans/${id}`}
                        className="rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-muted"
                      >
                        {id.slice(0, 8)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {buckets.length > 8 && (
          <li className="px-1 text-[11px] text-muted-foreground">+{buckets.length - 8}</li>
        )}
      </ul>
    </div>
  );
}
