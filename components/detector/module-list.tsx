'use client';

import { AnimatePresence } from 'framer-motion';
import { Gauge } from 'lucide-react';
import { useMessages } from '@/lib/i18n/locale-client';
import type { Messages } from '@/lib/i18n/messages';
import type { DetectionModule, DetectionResult } from '@/lib/detection-modules';
import type { OverallAssessment, RiskLevel } from '@/lib/risk';
import { CategoryFilter } from './category-filter';
import { ModuleCard } from './module-card';

interface Props {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (c: string) => void;
  filteredModules: DetectionModule[];
  results: Map<string, DetectionResult>;
  runningIds: Set<string>;
  selectedModuleId: string | null;
  onSelectModule: (id: string) => void;
  onSelectOverview: () => void;
  isModuleEnabled: (id: string) => boolean;
  onToggleModule: (id: string) => void;
  totalModules: number;
  assessment: OverallAssessment;
}

export function ModuleList({
  categories,
  selectedCategory,
  onSelectCategory,
  filteredModules,
  results,
  runningIds,
  selectedModuleId,
  onSelectModule,
  onSelectOverview,
  isModuleEnabled,
  onToggleModule,
  totalModules,
  assessment,
}: Props) {
  const m = useMessages();
  const tested = totalModules - assessment.untestedModuleIds.length;
  const percent = totalModules === 0 ? 0 : Math.round((tested / totalModules) * 100);
  const overviewActive = selectedModuleId === null;

  return (
    <aside className="w-[22rem] shrink-0 border-r border-border/60 bg-muted/30 flex flex-col">
      <div className="px-3 pt-3 pb-2">
        <OverviewEntry active={overviewActive} assessment={assessment} onClick={onSelectOverview} />
      </div>

      <div className="px-4 pt-2 pb-3 border-b border-border/60">
        <CategoryFilter
          categories={categories}
          selected={selectedCategory}
          onSelect={onSelectCategory}
        />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-1.5">
        <AnimatePresence initial={false}>
          {filteredModules.map(module => (
            <ModuleCard
              key={module.id}
              module={module}
              enabled={isModuleEnabled(module.id)}
              running={runningIds.has(module.id)}
              selected={selectedModuleId === module.id}
              result={results.get(module.id)}
              onSelect={onSelectModule}
              onToggle={onToggleModule}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="px-4 py-3 border-t border-border/60 bg-background/60 backdrop-blur">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">{m.detector.overview}</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {m.detector.progress(tested, totalModules)}
          </span>
        </div>
        <div
          className="h-1 w-full rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--cat-network))] to-[hsl(var(--cat-browser))] transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5 mt-3">
          <StatChip
            label={m.risk.level.critical}
            value={assessment.counts.critical}
            tone="danger"
          />
          <StatChip label={m.risk.level.warning} value={assessment.counts.warning} tone="warning" />
          <StatChip label={m.risk.level.safe} value={assessment.counts.safe} tone="success" />
        </div>
      </div>
    </aside>
  );
}

function OverviewEntry({
  active,
  assessment,
  onClick,
}: {
  active: boolean;
  assessment: OverallAssessment;
  onClick: () => void;
}) {
  const m = useMessages();
  const tone = levelTextClass(assessment.level);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? 'bg-card border-border shadow-elevated'
          : 'bg-card/40 border-transparent hover:bg-card hover:border-border/80'
      }`}
    >
      {active && (
        <span
          className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-foreground"
          aria-hidden="true"
        />
      )}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(var(--cat-network)/0.18)] to-[hsl(var(--cat-browser)/0.18)] ring-1 ring-border">
        <Gauge className="h-[18px] w-[18px] text-foreground/70" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm">{m.overview.sidebarLabel}</span>
          <span className={`text-xs font-semibold tabular-nums ${tone}`}>
            {assessment.level === 'unknown' ? '—' : assessment.score}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
          {assessment.level === 'unknown'
            ? m.overview.sidebarHint
            : levelLabel(m, assessment.level)}
        </p>
      </div>
    </button>
  );
}

function levelLabel(m: Messages, level: RiskLevel): string {
  switch (level) {
    case 'safe':
      return m.overview.levelSafe;
    case 'warning':
      return m.overview.levelWarning;
    case 'critical':
      return m.overview.levelCritical;
    default:
      return m.overview.levelUnknown;
  }
}

function levelTextClass(level: RiskLevel): string {
  switch (level) {
    case 'safe':
      return 'text-[hsl(var(--success))]';
    case 'warning':
      return 'text-[hsl(var(--warning))]';
    case 'critical':
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-[hsl(var(--success))]'
      : tone === 'warning'
        ? 'text-[hsl(var(--warning))]'
        : 'text-destructive';

  return (
    <div className="rounded-md bg-muted/60 px-2 py-1.5 text-center">
      <div className={`text-base font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
