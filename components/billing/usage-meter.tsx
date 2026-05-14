'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useLocale, useMessages } from '@/lib/i18n/locale-client';
import { htmlLang } from '@/lib/i18n/messages';

export interface UsageMeterData {
  plan: 'free' | 'starter' | 'pro';
  status: string;
  scansUsed: number;
  scansLimit: number;
  retainCap: number;
  periodEnd: string;
  isPaid: boolean;
}

export interface UsageMeterProps {
  /** Pass a prefetched server-rendered snapshot to avoid a flash of "loading". */
  initial?: UsageMeterData;
  /** Compact variant: single horizontal pill, no headings. */
  compact?: boolean;
}

export function UsageMeter({ initial, compact = false }: UsageMeterProps) {
  const m = useMessages();
  const locale = useLocale();
  const [data, setData] = useState<UsageMeterData | null>(initial ?? null);

  useEffect(() => {
    // Skip the refetch when the parent supplied a server-rendered snapshot —
    // every consumer page is `force-dynamic`, so `initial` is already fresh
    // on every navigation (including the post-Checkout success redirect).
    // The fetch is only needed when no snapshot is provided.
    if (initial) return;
    let alive = true;
    fetch('/api/billing/me', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (alive && json) {
          setData({
            plan: json.plan,
            status: json.status,
            scansUsed: json.scansUsed,
            scansLimit: json.scansLimit,
            retainCap: json.retainCap,
            periodEnd: json.periodEnd,
            isPaid: json.isPaid,
          });
        }
      })
      .catch(() => {
        /* leave default null in place — caller will render nothing */
      });
    return () => {
      alive = false;
    };
  }, [initial]);

  if (!data) return null;

  const pct = Math.min(100, Math.round((data.scansUsed / Math.max(data.scansLimit, 1)) * 100));
  const exhausted = data.scansUsed >= data.scansLimit;
  const tone = exhausted
    ? 'bg-destructive'
    : pct >= 80
      ? 'bg-[hsl(var(--warning))]'
      : 'bg-[hsl(var(--success))]';

  const resetWhen = new Date(data.periodEnd).toLocaleDateString(htmlLang[locale]);
  const planName = m.pricing.plans[data.plan].name;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2 text-xs">
        <span className="font-medium">{planName}</span>
        <span className="tabular-nums text-muted-foreground">
          {m.billing.usageLine(data.scansUsed, data.scansLimit)}
        </span>
        <div className="h-1.5 flex-1 min-w-[6rem] rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
        </div>
        {exhausted && (
          <Link
            href="/pricing"
            className="rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background hover:bg-foreground/90"
          >
            {m.billing.changePlan}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {m.billing.usageHeading}
          </div>
          <div className="mt-1 text-base font-semibold tabular-nums">
            {m.billing.usageLine(data.scansUsed, data.scansLimit)}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{planName}</div>
          <div className="mt-0.5">{m.billing.resetAt(resetWhen)}</div>
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{m.billing.retainHint(data.retainCap)}</p>
      {exhausted && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>{m.billing.upgradeBanner}</span>
          <Link
            href="/pricing"
            className="rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background hover:bg-foreground/90"
          >
            {m.billing.changePlan}
          </Link>
        </div>
      )}
    </div>
  );
}
