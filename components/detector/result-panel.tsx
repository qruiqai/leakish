'use client';

import { Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ResultDetail } from '@/components/result-details';
import { useMessages } from '@/lib/i18n/locale-client';
import { localizeModule } from '@/lib/i18n/localize-module';
import type { DetectionModule, DetectionResult } from '@/lib/detection-modules';
import { categoryAccent, resolveIcon } from './icon-map';

interface Props {
  module: DetectionModule;
  result: DetectionResult | null;
  isEnabled: boolean;
  isRunning: boolean;
  onToggle: (id: string) => void;
  onRun: (id: string) => void;
}

export function ResultPanel({ module, result, isEnabled, isRunning, onToggle, onRun }: Props) {
  const m = useMessages();
  const Icon = resolveIcon(module.icon);
  const accent = categoryAccent[module.category];
  const localized = localizeModule(m, module);

  return (
    <section className="flex-1 flex flex-col min-w-0 bg-background">
      <div className="border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent.tint}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold tracking-tight whitespace-nowrap">
                  {localized.name}
                </h2>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${accent.tint}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} aria-hidden="true" />
                  {m.category[module.category]}
                </span>
                {result && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {m.detector.lastRun(result.detectedAt.toLocaleTimeString())}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {localized.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground select-none">
              <span>{isEnabled ? m.detector.enabledShort : m.detector.disabledShort}</span>
              <Switch
                checked={isEnabled}
                onCheckedChange={() => onToggle(module.id)}
                aria-label={m.detector.toggleEnable(localized.name)}
              />
            </label>
            <Button
              onClick={() => onRun(module.id)}
              disabled={!isEnabled || isRunning}
              size="sm"
              className="shadow-elevated"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
                  {m.detector.running}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  {m.detector.runOne}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {result ? (
          <ResultDetail module={module} result={result} />
        ) : (
          <ReadyState moduleName={localized.name} />
        )}
      </div>
    </section>
  );
}

function ReadyState({ moduleName }: { moduleName: string }) {
  const m = useMessages();
  return (
    <div className="flex items-center justify-center h-full px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
          <Play className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold">{m.detector.ready}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{m.detector.readyHint}</p>
        <p className="sr-only">{moduleName}</p>
      </div>
    </div>
  );
}
