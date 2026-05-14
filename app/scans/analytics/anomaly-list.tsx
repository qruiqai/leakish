'use client';

import Link from 'next/link';

import { useMessages } from '@/lib/i18n/locale-client';
import type { OutlierScan } from '@/lib/server/analytics';

export function AnomalyList({ outliers }: { outliers: OutlierScan[] }) {
  const m = useMessages();
  if (outliers.length === 0) {
    return <p className="text-sm text-muted-foreground">{m.analytics.outliers.none}</p>;
  }

  return (
    <ul className="space-y-3" role="list">
      {outliers.map(o => (
        <li key={o.id} className="rounded-lg border border-border/40 bg-background/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/scans/${o.id}`} className="text-sm font-medium hover:underline">
              {o.name ?? (
                <span className="font-mono text-muted-foreground">{o.id.slice(0, 10)}</span>
              )}
            </Link>
            <span className="rounded-full bg-[hsl(var(--warning)/0.15)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--warning))] tabular-nums">
              {m.analytics.outliers.score(o.outlierScore)}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            {new Date(o.createdAt).toLocaleString()}
          </div>
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {m.analytics.outliers.reasonsLabel}
            </div>
            <ul className="mt-1 flex flex-wrap gap-1.5" role="list">
              {o.reasons.map(r => (
                <li
                  key={r}
                  className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]"
                >
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}
