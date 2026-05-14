'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  HelpCircle,
  History,
  Loader2,
  Play,
  RefreshCw,
  Save,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NavButton } from '@/components/ui/nav-button';
import { useAuthGate } from '@/components/auth/auth-gate-provider';
import { usePendingRouter } from '@/lib/client/use-pending-router';
import type { DetectionModule, DetectionResult } from '@/lib/detection-modules';
import type { OverallAssessment, RiskLevel, RiskSignal } from '@/lib/risk';
import type { UniquenessKind, UniquenessOwnMatch, UniquenessResponse } from '@/lib/client/scan-api';
import { useMessages } from '@/lib/i18n/locale-client';
import type { Messages } from '@/lib/i18n/messages';
import { localizeModule } from '@/lib/i18n/localize-module';
import { DiagnosticsExport } from '@/components/overview/diagnostics-export';
import { SaveScanDialog } from '@/components/overview/save-scan-dialog';

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; id: string }
  | { kind: 'error'; message: string };

interface Props {
  assessment: OverallAssessment;
  modules: readonly DetectionModule[];
  results: Map<string, DetectionResult>;
  isRunningAll: boolean;
  onRunAll: () => void;
  onSelectModule: (id: string) => void;
  onSaveScan: (name: string) => void;
  saveStatus: SaveStatus;
  uniqueness: UniquenessResponse | null;
  uniquenessLoading: boolean;
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
        ring: 'ring-[hsl(var(--success)/0.35)]',
        bar: 'bg-[hsl(var(--success))]',
      };
    case 'warning':
      return {
        text: 'text-[hsl(var(--warning))]',
        bg: 'bg-[hsl(var(--warning)/0.12)]',
        ring: 'ring-[hsl(var(--warning)/0.35)]',
        bar: 'bg-[hsl(var(--warning))]',
      };
    case 'critical':
      return {
        text: 'text-destructive',
        bg: 'bg-destructive/10',
        ring: 'ring-destructive/30',
        bar: 'bg-destructive',
      };
    default:
      return {
        text: 'text-muted-foreground',
        bg: 'bg-muted/60',
        ring: 'ring-border',
        bar: 'bg-muted-foreground/40',
      };
  }
}

export function OverviewPanel({
  assessment,
  modules,
  results,
  isRunningAll,
  onRunAll,
  onSelectModule,
  onSaveScan,
  saveStatus,
  uniqueness,
  uniquenessLoading,
}: Props) {
  const m = useMessages();
  const LEVEL_COPY = levelCopy(m);
  const moduleNameById = new Map(modules.map(mod => [mod.id, localizeModule(m, mod).name]));
  const hasResults = assessment.level !== 'unknown';

  const { user, requireAuth } = useAuthGate();
  const { pending: navPending, navigate } = usePendingRouter();
  const onHistory = () => {
    if (user) {
      navigate('/scans');
    } else {
      requireAuth({ redirectAfter: '/scans' });
    }
  };

  if (!hasResults) {
    return (
      <section className="flex-1 flex items-center justify-center px-6 bg-background">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted ring-1 ring-border">
            <ShieldAlert className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="text-xl font-semibold tracking-tight">{m.overview.emptyHeading}</h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {m.overview.emptyHint}
          </p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button
              onClick={onRunAll}
              disabled={isRunningAll}
              size="sm"
              className="shadow-elevated"
            >
              {isRunningAll ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
                  {m.detector.runAllRunning}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  {m.detector.pickOneCta}
                </>
              )}
            </Button>
            <Button onClick={onHistory} variant="outline" size="sm" disabled={navPending}>
              {navPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
              ) : (
                <History className="h-4 w-4 mr-1.5" aria-hidden="true" />
              )}
              {m.overview.history}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const tone = levelTone(assessment.level);

  const critical = assessment.perModule.flatMap(m => m.signals).filter(s => s.level === 'critical');
  const warning = assessment.perModule.flatMap(m => m.signals).filter(s => s.level === 'warning');
  const safe = assessment.perModule.flatMap(m => m.signals).filter(s => s.level === 'safe');

  return (
    <section className="flex-1 flex flex-col min-w-0 bg-background">
      <div className="border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{m.overview.heading}</h2>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.bg} ${tone.text}`}
              >
                {LEVEL_COPY[assessment.level]}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{m.overview.subheading}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={onHistory}
              variant="ghost"
              size="sm"
              disabled={navPending}
              className="text-muted-foreground hover:text-foreground"
            >
              {navPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
              ) : (
                <History className="h-4 w-4 mr-1.5" aria-hidden="true" />
              )}
              {m.overview.history}
            </Button>
            <SaveControl status={saveStatus} onSave={onSaveScan} />
            <Button onClick={onRunAll} disabled={isRunningAll} size="sm" variant="outline">
              {isRunningAll ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
                  {m.detector.runAllRunning}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  {m.overview.rerun}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-6 py-5 space-y-5 max-w-3xl">
          {/* Score card */}
          <div className={`rounded-2xl border bg-card p-5 shadow-elevated ring-1 ${tone.ring}`}>
            <div className="flex items-end gap-3">
              <span className={`text-5xl font-semibold tabular-nums tracking-tight ${tone.text}`}>
                {assessment.score}
              </span>
              <span className="pb-2 text-sm text-muted-foreground">/ 100</span>
            </div>
            <div
              className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={assessment.score}
            >
              <div
                className={`h-full rounded-full ${tone.bar} transition-[width] duration-500`}
                style={{ width: `${assessment.score}%` }}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <CountChip
                tone="critical"
                label={m.overview.countCritical(assessment.counts.critical)}
              />
              <CountChip
                tone="warning"
                label={m.overview.countWarning(assessment.counts.warning)}
              />
              <CountChip tone="safe" label={m.overview.countSafe(assessment.counts.safe)} />
            </div>

            {assessment.untestedModuleIds.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {m.overview.untestedHint(assessment.untestedModuleIds.length)}
              </p>
            )}
          </div>

          <UniquenessCard uniqueness={uniqueness} loading={uniquenessLoading} />

          {/* Signal sections */}
          <SignalSection
            level="critical"
            title={m.overview.sectionCritical}
            signals={critical}
            moduleNameById={moduleNameById}
            onSelectModule={onSelectModule}
          />
          <SignalSection
            level="warning"
            title={m.overview.sectionWarning}
            signals={warning}
            moduleNameById={moduleNameById}
            onSelectModule={onSelectModule}
          />
          <SignalSection
            level="safe"
            title={m.overview.sectionSafe}
            signals={safe}
            moduleNameById={moduleNameById}
            onSelectModule={onSelectModule}
            collapsed
          />

          <DiagnosticsExport assessment={assessment} modules={modules} results={results} />
        </div>
      </div>
    </section>
  );
}

/**
 * "Save" affordance. The button opens a centered modal (`SaveScanDialog`) that
 * collects a label and runs a soft same-name check against the user's own
 * history before persisting. The modal owns its own validation + duplicate
 * confirmation flow; this control just drives the open/close state and
 * surfaces the resulting `SaveStatus` for the idle / saving / saved / error
 * pills shown next to the History button.
 */
function SaveControl({ status, onSave }: { status: SaveStatus; onSave: (name: string) => void }) {
  const m = useMessages();
  const [open, setOpen] = useState(false);

  // Once the parent resets the save state (e.g. user re-runs the scan), make
  // sure the dialog isn't lingering open from a previous attempt.
  useEffect(() => {
    if (status.kind === 'idle') setOpen(false);
  }, [status.kind]);

  if (status.kind === 'saved') {
    return (
      <NavButton
        href={`/scans/${status.id}`}
        variant="ghost"
        size="sm"
        className="text-[hsl(var(--success))]"
        icon={<CheckCircle2 className="h-4 w-4 mr-1.5" aria-hidden="true" />}
      >
        {m.overview.saved}
      </NavButton>
    );
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={status.kind === 'saving'}
        size="sm"
        variant="outline"
        className={status.kind === 'error' ? 'border-destructive text-destructive' : ''}
        title={status.kind === 'error' ? status.message : undefined}
      >
        {status.kind === 'saving' ? (
          <RefreshCw className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
        ) : (
          <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
        )}
        {status.kind === 'saving'
          ? m.overview.saving
          : status.kind === 'error'
            ? m.overview.saveFailed
            : m.overview.saveScan}
      </Button>
      <SaveScanDialog
        open={open}
        status={status}
        onClose={() => setOpen(false)}
        onSave={onSave}
      />
    </>
  );
}

function UniquenessCard({
  uniqueness,
  loading,
}: {
  uniqueness: UniquenessResponse | null;
  loading: boolean;
}) {
  const m = useMessages();
  if (!loading && !uniqueness) return null;

  const items: Array<{
    key: UniquenessKind;
    label: string;
    matches: number | null;
    own: UniquenessOwnMatch[];
  }> = uniqueness
    ? (['ua', 'canvas2d', 'webgl', 'audio', 'fontset'] as const).map(key => ({
        key,
        label: m.overview.uniqueness[key],
        matches: uniqueness.matches[key],
        own: uniqueness.ownMatches?.[key] ?? [],
      }))
    : [];

  const total = uniqueness?.totalScans ?? 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{m.overview.uniquenessLabel}</h3>
          {uniqueness && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {m.overview.uniquenessNote(total)}
            </p>
          )}
        </div>
        {loading && (
          <span className="inline-flex items-center text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 mr-1 animate-pulse" aria-hidden="true" />
            {m.overview.uniquenessRunning}
          </span>
        )}
      </div>

      {uniqueness && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5" role="list">
          {items.map(item => {
            if (item.matches === null) {
              return (
                <li
                  key={item.key}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs bg-muted/40 text-muted-foreground"
                >
                  <span>{item.label}</span>
                  <span>{m.overview.uniquenessNotCollected}</span>
                </li>
              );
            }
            const isUnique = item.matches <= 1;
            return (
              <li
                key={item.key}
                className={`rounded-md px-3 py-2 text-xs ${
                  isUnique
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{item.label}</span>
                  <span className="tabular-nums">
                    {m.overview.uniquenessVerdict(item.matches, total)}
                  </span>
                </div>
                {item.own.length > 0 && <OwnMatchList kind={item.key} matches={item.own} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Shows which of the current user's own saved scans share this exact
 * fingerprint hash. Lets the reader jump straight to the matching record
 * so "这次的 Canvas 指纹又重复了" becomes actionable.
 */
function OwnMatchList({ kind, matches }: { kind: UniquenessKind; matches: UniquenessOwnMatch[] }) {
  const m = useMessages();
  return (
    <div className="mt-2 text-[11px] text-muted-foreground">
      <span className="mr-1.5">{m.overview.uniquenessOwnMatchPrefix}</span>
      <ul
        className="inline-flex flex-wrap gap-1.5"
        role="list"
        aria-label={m.overview.uniquenessOwnMatchAria(kind)}
      >
        {matches.map(match => (
          <li key={match.id}>
            <NavButton
              href={`/scans/${match.id}`}
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] font-medium text-foreground hover:text-foreground"
            >
              {match.name ?? m.overview.uniquenessOwnMatchUnnamed}
            </NavButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CountChip({ tone, label }: { tone: 'critical' | 'warning' | 'safe'; label: string }) {
  const cls =
    tone === 'critical'
      ? 'bg-destructive/10 text-destructive'
      : tone === 'warning'
        ? 'bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]'
        : 'bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${cls}`}>
      {label}
    </span>
  );
}

function SignalSection({
  level,
  title,
  signals,
  moduleNameById,
  onSelectModule,
  collapsed = false,
}: {
  level: Exclude<RiskLevel, 'unknown'>;
  title: string;
  signals: RiskSignal[];
  moduleNameById: Map<string, string>;
  onSelectModule: (id: string) => void;
  collapsed?: boolean;
}) {
  const m = useMessages();
  if (signals.length === 0) return null;

  const Icon =
    level === 'critical'
      ? ShieldAlert
      : level === 'warning'
        ? AlertTriangle
        : level === 'safe'
          ? CheckCircle2
          : HelpCircle;

  const tone = levelTone(level as RiskLevel);

  return (
    <section>
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${tone.bg}`}>
          <Icon className={`h-3.5 w-3.5 ${tone.text}`} aria-hidden="true" />
        </span>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{signals.length}</span>
      </div>

      <ul className={`space-y-1.5 ${collapsed ? 'opacity-90' : ''}`} role="list">
        {signals.map(signal => (
          <li key={signal.id}>
            <button
              type="button"
              onClick={() => onSelectModule(signal.moduleId)}
              className="group flex w-full items-start gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-3 text-left transition-colors hover:border-border hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
                  {m.overview.drillIn(moduleNameById.get(signal.moduleId) ?? signal.moduleId)}
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
