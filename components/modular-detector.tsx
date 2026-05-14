'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eraser, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LocaleToggle } from '@/components/ui/locale-toggle';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { UserMenu } from '@/components/ui/user-menu';
import { ModuleList } from '@/components/detector/module-list';
import { ResultPanel } from '@/components/detector/result-panel';
import { OverviewPanel, type SaveStatus } from '@/components/overview/overview-panel';
import { useAuthGate } from '@/components/auth/auth-gate-provider';
import { useDetectorState } from '@/components/detector/useDetectorState';
import {
  extractFingerprintInputs,
  extractModuleSnapshot,
  lookupUniqueness,
  saveScan,
  type UniquenessResponse,
} from '@/lib/client/scan-api';
import { logger } from '@/lib/logger';
import { useMessages } from '@/lib/i18n/locale-client';

export function ModularDetector() {
  const m = useMessages();
  const {
    modules,
    results,
    runningIds,
    isRunningAll,
    selectedCategory,
    setSelectedCategory,
    selectedModuleId,
    setSelectedModuleId,
    categories,
    filteredModules,
    enabledCount,
    isModuleEnabled,
    toggleModule,
    runModule,
    runAllEnabled,
    clearResults,
    selectedModule,
    selectedResult,
    assessment,
  } = useDetectorState();

  const { user, requireAuth } = useAuthGate();

  // Save status (idle / saving / saved / error)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: 'idle' });
  // Fingerprint uniqueness lookup result
  const [uniqueness, setUniqueness] = useState<UniquenessResponse | null>(null);
  const [uniquenessLoading, setUniquenessLoading] = useState(false);

  // Reset derived state whenever the user clears or re-runs.
  // We use results.size as a coarse "scan generation" proxy.
  const resultsKey = `${results.size}-${assessment.score}-${assessment.level}`;
  useEffect(() => {
    setSaveStatus({ kind: 'idle' });
  }, [resultsKey]);

  // Fire uniqueness lookup automatically once the assessment becomes meaningful.
  useEffect(() => {
    if (assessment.level === 'unknown' || isRunningAll) {
      setUniqueness(null);
      return;
    }
    let cancelled = false;
    setUniquenessLoading(true);
    const fingerprints = extractFingerprintInputs(results);
    lookupUniqueness(fingerprints)
      .then(res => {
        if (!cancelled) setUniqueness(res);
      })
      .catch(err => {
        logger.warn('uniqueness lookup failed:', err);
        if (!cancelled) setUniqueness(null);
      })
      .finally(() => {
        if (!cancelled) setUniquenessLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // resultsKey covers the dimensions that should re-trigger the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsKey, isRunningAll]);

  const doSaveScan = async (name: string) => {
    if (assessment.level === 'unknown' || saveStatus.kind === 'saving') return;
    setSaveStatus({ kind: 'saving' });
    try {
      const fingerprints = extractFingerprintInputs(results);
      const moduleSnapshot = extractModuleSnapshot(results);
      const { id } = await saveScan(assessment, fingerprints, moduleSnapshot, name);
      setSaveStatus({ kind: 'saved', id });
    } catch (err) {
      logger.warn('saveScan failed:', err);
      setSaveStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : m.overview.saveFailed,
      });
    }
  };

  const onSaveScan = (name: string) => requireAuth({ action: () => doSaveScan(name) });

  // Run All needs auth too — the network-probe module hits an authed endpoint
  // (other modules would silently fail/skip otherwise).
  const onRunAll = () => requireAuth({ action: runAllEnabled });

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* `backdrop-blur` creates its own stacking context; without `relative
          z-40` the sibling panels below (which also use `backdrop-blur`)
          render above the user-menu dropdown and obscure it. */}
      <header className="relative z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            aria-label={m.app.title}
            className="flex items-center gap-3 min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[hsl(var(--cat-network))] to-[hsl(var(--cat-browser))] flex items-center justify-center shadow-elevated">
              <ShieldCheck className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight truncate">{m.app.title}</h1>
              <p className="text-xs text-muted-foreground truncate hidden sm:block">
                {m.app.subtitle}
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className="hidden md:inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground"
              aria-live="polite"
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]"
                aria-hidden="true"
              />
              {m.detector.enabledCount(enabledCount, modules.length)}
            </span>
            {results.size > 0 && (
              <Button
                onClick={clearResults}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <Eraser className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {m.detector.clearResults}
              </Button>
            )}
            <Button
              onClick={onRunAll}
              disabled={isRunningAll || enabledCount === 0}
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
                  {m.detector.runAll}
                </>
              )}
            </Button>
            <LocaleToggle />
            <ThemeToggle />
            {user ? (
              <UserMenu />
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => requireAuth({ action: () => undefined })}
              >
                {m.auth.signInShort}
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <ModuleList
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          filteredModules={filteredModules}
          results={results}
          runningIds={runningIds}
          selectedModuleId={selectedModuleId}
          onSelectModule={setSelectedModuleId}
          onSelectOverview={() => setSelectedModuleId(null)}
          isModuleEnabled={isModuleEnabled}
          onToggleModule={toggleModule}
          totalModules={modules.length}
          assessment={assessment}
        />

        {selectedModule ? (
          <ResultPanel
            module={selectedModule}
            result={selectedResult}
            isEnabled={isModuleEnabled(selectedModule.id)}
            isRunning={runningIds.has(selectedModule.id)}
            onToggle={toggleModule}
            onRun={runModule}
          />
        ) : (
          <OverviewPanel
            assessment={assessment}
            modules={modules}
            results={results}
            isRunningAll={isRunningAll}
            onRunAll={onRunAll}
            onSelectModule={setSelectedModuleId}
            onSaveScan={onSaveScan}
            saveStatus={saveStatus}
            uniqueness={uniqueness}
            uniquenessLoading={uniquenessLoading}
          />
        )}
      </div>
    </div>
  );
}
