'use client';

import { useState } from 'react';
import Link from 'next/link';

import { useMessages } from '@/lib/i18n/locale-client';
import type { HashKind, UserAnalytics } from '@/lib/server/analytics';

const KIND_ORDER: HashKind[] = ['ua', 'canvas2d', 'webgl', 'audio', 'fontset'];

export function HashRepetition({
  repetition,
  totalScans,
}: {
  repetition: UserAnalytics['ownHashRepetition'];
  totalScans: number;
}) {
  return (
    <ul className="divide-y divide-border/60" role="list">
      {KIND_ORDER.map(kind => (
        <KindRow key={kind} kind={kind} groups={repetition[kind]} totalScans={totalScans} />
      ))}
    </ul>
  );
}

function KindRow({
  kind,
  groups,
  totalScans,
}: {
  kind: HashKind;
  groups: UserAnalytics['ownHashRepetition'][HashKind];
  totalScans: number;
}) {
  const m = useMessages();
  const [open, setOpen] = useState(false);

  // Count scans in repeated groups vs. scans total. Unique = total - sum(count) + groups.length
  // i.e. scans that appear in a repeat group are repeats; everything else is unique.
  const repeatedScans = groups.reduce((s, g) => s + g.count, 0);
  // Each repeat group represents 1 unique hash shared by g.count scans, so we still count
  // 1 toward the "unique values" tally for each group.
  const uniqueHashCount = totalScans - repeatedScans + groups.length;
  const uniqueRatio = totalScans > 0 ? uniqueHashCount / totalScans : 1;

  const risk = uniqueRatio >= 0.9 ? 'low' : uniqueRatio >= 0.5 ? 'medium' : 'high';
  const riskClass =
    risk === 'low'
      ? 'text-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]'
      : risk === 'medium'
        ? 'text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)]'
        : 'text-destructive bg-destructive/10';

  return (
    <li className="py-2.5">
      <button
        type="button"
        onClick={() => groups.length > 0 && setOpen(!open)}
        className="flex w-full items-center gap-3 text-left"
        aria-expanded={open}
        disabled={groups.length === 0}
      >
        <span className="w-24 text-sm font-medium">{m.analytics.repetition.kind[kind]}</span>
        <span className="flex-1 text-[12px] text-muted-foreground tabular-nums">
          {m.analytics.repetition.uniqueOf(uniqueHashCount, totalScans)}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskClass}`}>
          {m.analytics.repetition.risk[risk]}
        </span>
      </button>

      {open && groups.length > 0 && (
        <ul className="ml-24 mt-2 space-y-1.5" role="list">
          {groups.map(g => (
            <li key={g.hash} className="flex items-center gap-2 text-[11px]">
              <span className="font-mono text-muted-foreground">{g.hash.slice(0, 10)}…</span>
              <span className="text-muted-foreground">·</span>
              <span>{m.analytics.repetition.groupLabel(g.count)}</span>
              <span className="flex flex-wrap gap-1">
                {g.scanIds.map(id => (
                  <Link
                    key={id}
                    href={`/scans/${id}`}
                    className="rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted"
                  >
                    {id.slice(0, 8)}
                  </Link>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {groups.length === 0 && (
        <p className="ml-24 mt-1 text-[11px] text-muted-foreground">
          {m.analytics.repetition.noRepeats}
        </p>
      )}
    </li>
  );
}
