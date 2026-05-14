'use client';

import Link from 'next/link';
import { ChevronRight, Loader2, MapPin } from 'lucide-react';

import { usePendingRouter } from '@/lib/client/use-pending-router';
import { useLocale, useMessages } from '@/lib/i18n/locale-client';
import { htmlLang } from '@/lib/i18n/messages';
import { DeleteScanButton } from './delete-scan-button';

interface Scan {
  id: string;
  name: string | null;
  createdAt: Date;
  score: number;
  level: string;
  ipCountry: string | null;
  ipCity: string | null;
  ipAsn: string | null;
  ipIsVpn: boolean | null;
}

export interface ToneSpec {
  label: string;
  /** Tailwind classes for the small risk-level pill (text + bg). */
  tone: string;
  /** Tailwind class for the left-edge color strip (bg only). */
  bar: string;
}

/** Map the bg-* class to a matching text-* class so the score number stays consistent. */
function textForBar(bar: string): string {
  if (bar.includes('--success')) return 'text-[hsl(var(--success))]';
  if (bar.includes('--warning')) return 'text-[hsl(var(--warning))]';
  if (bar.includes('destructive')) return 'text-destructive';
  return 'text-muted-foreground';
}

interface Props {
  scan: Scan;
  tone: ToneSpec;
}

export function ScanRow({ scan, tone }: Props) {
  const m = useMessages();
  const locale = useLocale();
  const { pending, interceptClick } = usePendingRouter();
  const where = [scan.ipCity, scan.ipCountry].filter(Boolean).join(', ');
  const href = `/scans/${scan.id}`;
  const scoreColor = textForBar(tone.bar);

  return (
    <li className="relative">
      <Link
        href={href}
        onClick={interceptClick(href)}
        aria-busy={pending || undefined}
        className={`group relative flex items-center gap-4 rounded-xl border bg-card pl-5 pr-4 py-3 overflow-hidden transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          pending
            ? 'border-foreground/20 cursor-progress opacity-80'
            : 'border-border/60 hover:border-border'
        }`}
      >
        {/* Left-edge color strip — gives the list a quick visual rhythm of risk. */}
        <span className={`absolute left-0 top-0 bottom-0 w-1 ${tone.bar}`} aria-hidden="true" />

        {/* Score number replaces the previous shield icon — easier to scan. */}
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/40">
          <span className={`text-base font-semibold tabular-nums tracking-tight ${scoreColor}`}>
            {scan.score}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.tone}`}
            >
              {tone.label}
            </span>
            <span className="font-medium text-sm truncate max-w-[28ch]">
              {scan.name ?? m.scans.unnamed}
            </span>
            {scan.ipIsVpn && (
              <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                VPN / Proxy
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span>{scan.createdAt.toLocaleString(htmlLang[locale])}</span>
            {where && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {where}
                {scan.ipAsn && <span>· {scan.ipAsn}</span>}
              </span>
            )}
          </div>
        </div>

        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin text-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight
            className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground"
            aria-hidden="true"
          />
        )}
      </Link>

      {/* Absolute-positioned so the click doesn't compete with the row link. */}
      <div className="absolute right-12 top-1/2 -translate-y-1/2">
        <DeleteScanButton scanId={scan.id} afterDelete="refresh" />
      </div>
    </li>
  );
}
