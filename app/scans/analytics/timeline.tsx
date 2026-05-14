'use client';

import Link from 'next/link';
import { ArrowRightLeft, AlertTriangle } from 'lucide-react';

import { useMessages } from '@/lib/i18n/locale-client';
import type { TimelinePoint } from '@/lib/server/analytics';

export function Timeline({ timeline }: { timeline: TimelinePoint[] }) {
  const m = useMessages();
  if (timeline.length === 0) {
    return <p className="text-sm text-muted-foreground">{m.analytics.timeline.noChanges}</p>;
  }

  const points = timeline.map((p, i) => {
    const prev = i > 0 ? timeline[i - 1] : null;
    return {
      ...p,
      ipChanged: prev !== null && p.ipPublic !== prev.ipPublic,
      asnChanged: prev !== null && p.ipAsn !== prev.ipAsn,
    };
  });

  return (
    <ol className="relative border-l border-border/60 pl-5" role="list">
      {points.map(p => (
        <li key={p.id} className="mb-3 last:mb-0">
          <span
            className={`absolute -left-[5px] mt-1 inline-block h-2.5 w-2.5 rounded-full ring-2 ring-background ${
              p.level === 'critical'
                ? 'bg-destructive'
                : p.level === 'warning'
                  ? 'bg-[hsl(var(--warning))]'
                  : p.level === 'safe'
                    ? 'bg-[hsl(var(--success))]'
                    : 'bg-muted-foreground/50'
            }`}
            aria-hidden="true"
          />
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {new Date(p.createdAt).toLocaleString()}
          </div>
          <Link
            href={`/scans/${p.id}`}
            className="font-mono text-[12px] text-foreground hover:underline"
          >
            {p.id.slice(0, 10)}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">
              {p.ipPublic ?? '—'} · {p.ipAsn ?? '—'}
            </span>
            {p.ipChanged && (
              <span className="inline-flex items-center gap-0.5 rounded bg-muted/60 px-1 py-0.5 text-[10px]">
                <ArrowRightLeft className="h-2.5 w-2.5" />
                {m.analytics.timeline.ipChanged}
              </span>
            )}
            {p.asnChanged && (
              <span className="inline-flex items-center gap-0.5 rounded bg-muted/60 px-1 py-0.5 text-[10px]">
                <ArrowRightLeft className="h-2.5 w-2.5" />
                {m.analytics.timeline.asnChanged}
              </span>
            )}
            {p.webrtcIpMismatch === true && (
              <span className="inline-flex items-center gap-0.5 rounded bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive">
                <AlertTriangle className="h-2.5 w-2.5" />
                {m.analytics.timeline.mismatch}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
