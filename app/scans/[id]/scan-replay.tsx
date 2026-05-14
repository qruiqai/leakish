'use client';

import { AlertTriangle, CheckCircle2, ChevronDown, Globe, ShieldAlert, Wifi } from 'lucide-react';
import { useState } from 'react';

import type { OverallAssessment, RiskLevel, RiskSignal } from '@/lib/risk';
import { useMessages } from '@/lib/i18n/locale-client';
import type { Messages } from '@/lib/i18n/messages';

interface ServerContext {
  ipCountry: string | null;
  ipRegion: string | null;
  ipCity: string | null;
  ipAsn: string | null;
  ipIsVpn: boolean | null;
  tlsJa3: string | null;
  tlsJa4: string | null;
  serverUserAgent: string | null;
  acceptLanguage: string | null;
}

interface Props {
  assessment: OverallAssessment;
  serverContext: ServerContext;
}

function levelCopy(m: Messages): Record<RiskLevel, string> {
  return {
    safe: m.overview.levelSafe,
    warning: m.overview.levelWarning,
    critical: m.overview.levelCritical,
    unknown: m.overview.levelUnknown,
  };
}

function levelTone(level: RiskLevel) {
  switch (level) {
    case 'safe':
      return {
        text: 'text-[hsl(var(--success))]',
        bg: 'bg-[hsl(var(--success)/0.12)]',
        bar: 'bg-[hsl(var(--success))]',
        ring: 'ring-[hsl(var(--success)/0.35)]',
      };
    case 'warning':
      return {
        text: 'text-[hsl(var(--warning))]',
        bg: 'bg-[hsl(var(--warning)/0.12)]',
        bar: 'bg-[hsl(var(--warning))]',
        ring: 'ring-[hsl(var(--warning)/0.35)]',
      };
    case 'critical':
      return {
        text: 'text-destructive',
        bg: 'bg-destructive/10',
        bar: 'bg-destructive',
        ring: 'ring-destructive/30',
      };
    default:
      return {
        text: 'text-muted-foreground',
        bg: 'bg-muted/60',
        bar: 'bg-muted-foreground/40',
        ring: 'ring-border',
      };
  }
}

export function ScanReplay({ assessment, serverContext }: Props) {
  const m = useMessages();
  const LEVEL_COPY = levelCopy(m);
  const tone = levelTone(assessment.level);

  const allSignals = assessment.perModule.flatMap(p => p.signals);
  const critical = allSignals.filter(s => s.level === 'critical');
  const warning = allSignals.filter(s => s.level === 'warning');
  const safe = allSignals.filter(s => s.level === 'safe');

  return (
    <div className="space-y-5">
      {/* Score card — same visual rhythm as the live Overview so a saved scan
          feels like the same artifact, not a separate page style. */}
      <div className={`rounded-2xl border bg-card p-5 shadow-elevated ring-1 ${tone.ring}`}>
        <div className="flex items-end gap-3">
          <span className={`text-5xl font-semibold tabular-nums tracking-tight ${tone.text}`}>
            {assessment.score}
          </span>
          <span className="pb-2 text-sm text-muted-foreground">/ 100</span>
          <span
            className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.bg} ${tone.text}`}
          >
            {LEVEL_COPY[assessment.level]}
          </span>
        </div>
        <div
          className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={assessment.score}
        >
          <div
            className={`h-full rounded-full ${tone.bar}`}
            style={{ width: `${assessment.score}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <CountChip tone="critical" n={assessment.counts.critical} label={m.risk.level.critical} />
          <CountChip tone="warning" n={assessment.counts.warning} label={m.risk.level.warning} />
          <CountChip tone="safe" n={assessment.counts.safe} label={m.risk.level.safe} />
        </div>
      </div>

      <ServerContextStrip ctx={serverContext} />

      <Section level="critical" title={m.overview.sectionCritical} signals={critical} />
      <Section level="warning" title={m.overview.sectionWarning} signals={warning} />
      <Section level="safe" title={m.overview.sectionSafe} signals={safe} />
    </div>
  );
}

function ServerContextStrip({ ctx }: { ctx: ServerContext }) {
  const m = useMessages();
  const [open, setOpen] = useState(false);

  const where = [ctx.ipCity, ctx.ipRegion, ctx.ipCountry].filter(Boolean).join(', ');
  const chips: Array<{ label: string; value: string; mono?: boolean }> = [];
  if (where) chips.push({ label: m.replay.egressLocation, value: where });
  if (ctx.ipAsn) chips.push({ label: 'ASN', value: ctx.ipAsn, mono: true });
  if (ctx.ipIsVpn !== null) {
    chips.push({ label: 'VPN / Proxy', value: ctx.ipIsVpn ? m.replay.yes : m.replay.no });
  }
  if (ctx.tlsJa4) chips.push({ label: 'JA4', value: ctx.tlsJa4, mono: true });

  if (chips.length === 0 && !ctx.serverUserAgent && !ctx.acceptLanguage) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60 bg-muted/20">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground">
          {m.replay.serverEnv}
        </h3>
      </div>

      {chips.length > 0 && (
        <ul role="list" className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-xs">
          {chips.map(chip => (
            <li key={chip.label} className="inline-flex items-baseline gap-1.5">
              <span className="text-muted-foreground">{chip.label}</span>
              <span className={chip.mono ? 'font-mono text-foreground' : 'text-foreground'}>
                {chip.value}
              </span>
            </li>
          ))}
        </ul>
      )}

      {(ctx.serverUserAgent || ctx.acceptLanguage) && (
        <div className="border-t border-border/60">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="inline-flex items-center gap-1.5">
              <Wifi className="h-3 w-3" aria-hidden="true" />
              {m.replay.httpHeaderToggle(open)}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>

          {open && (
            <div className="px-4 pb-3 space-y-2">
              {ctx.acceptLanguage && (
                <div className="rounded-md bg-muted/40 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Accept-Language
                  </div>
                  <div className="mt-0.5 font-mono text-xs break-all">{ctx.acceptLanguage}</div>
                </div>
              )}
              {ctx.serverUserAgent && (
                <div className="rounded-md bg-muted/40 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {m.replay.serverUserAgent}
                  </div>
                  <div className="mt-0.5 font-mono text-xs break-all">{ctx.serverUserAgent}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CountChip({
  tone,
  n,
  label,
}: {
  tone: 'critical' | 'warning' | 'safe';
  n: number;
  label: string;
}) {
  const cls =
    tone === 'critical'
      ? 'bg-destructive/10 text-destructive'
      : tone === 'warning'
        ? 'bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]'
        : 'bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${cls}`}>
      {label} {n}
    </span>
  );
}

function Section({
  level,
  title,
  signals,
}: {
  level: 'critical' | 'warning' | 'safe';
  title: string;
  signals: RiskSignal[];
}) {
  if (signals.length === 0) return null;
  const tone = levelTone(level as RiskLevel);
  const Icon =
    level === 'critical' ? ShieldAlert : level === 'warning' ? AlertTriangle : CheckCircle2;
  return (
    <section>
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${tone.bg}`}>
          <Icon className={`h-3.5 w-3.5 ${tone.text}`} aria-hidden="true" />
        </span>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{signals.length}</span>
      </div>
      <ul className="space-y-1.5" role="list">
        {signals.map(signal => (
          <li
            key={signal.id}
            className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-3"
          >
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.bar}`}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-medium leading-snug">{signal.title}</span>
                {signal.value && (
                  <code className="font-mono text-[11px] text-muted-foreground bg-muted/70 rounded px-1.5 py-0.5">
                    {signal.value}
                  </code>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                {signal.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
