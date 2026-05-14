'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { DetectionModule, DetectionResult } from '@/lib/detection-modules';
import { useMessages } from '@/lib/i18n/locale-client';
import type { Messages } from '@/lib/i18n/messages';
import { localizeModule } from '@/lib/i18n/localize-module';
import { categoryAccent, resolveIcon } from './icon-map';

interface Props {
  module: DetectionModule;
  enabled: boolean;
  running: boolean;
  selected: boolean;
  result: DetectionResult | undefined;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}

function statusFor(
  m: Messages,
  result: DetectionResult | undefined,
  running: boolean,
  enabled: boolean
): { label: string; node: React.ReactNode } {
  if (running) {
    return {
      label: m.detector.statusRunning,
      node: (
        <RefreshCw
          className="h-3.5 w-3.5 animate-spin text-[hsl(var(--info))]"
          aria-hidden="true"
        />
      ),
    };
  }
  if (result) {
    if (result.success) {
      return {
        label: m.detector.statusOk,
        node: (
          <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" aria-hidden="true" />
        ),
      };
    }
    return {
      label: m.detector.statusFailed,
      node: <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />,
    };
  }
  if (!enabled) {
    return {
      label: m.detector.statusDisabled,
      node: <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />,
    };
  }
  return {
    label: m.detector.statusIdle,
    node: <span className="h-2 w-2 rounded-full bg-muted-foreground/35" aria-hidden="true" />,
  };
}

function ModuleCardImpl({ module, enabled, running, selected, result, onSelect, onToggle }: Props) {
  const m = useMessages();
  const Icon = resolveIcon(module.icon);
  const accent = categoryAccent[module.category];
  const status = statusFor(m, result, running, enabled);
  const localized = localizeModule(m, module);

  const handleKey: React.KeyboardEventHandler<HTMLDivElement> = event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(module.id);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${localized.name} · ${status.label}`}
        onClick={() => onSelect(module.id)}
        onKeyDown={handleKey}
        className={`
          group relative flex items-start gap-3 rounded-xl border px-3 py-2.5
          transition-all outline-none cursor-pointer
          focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1
          focus-visible:ring-offset-background
          ${
            selected
              ? 'bg-card border-border shadow-elevated'
              : 'bg-card/40 border-transparent hover:bg-card hover:border-border/80'
          }
          ${!enabled ? 'opacity-70' : ''}
        `}
      >
        {/* Selected accent bar */}
        {selected && (
          <span
            className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full ${accent.dot}`}
            aria-hidden="true"
          />
        )}

        {/* Category-tinted icon */}
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent.tint}`}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm truncate">{localized.name}</span>
            <span
              className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"
              title={status.label}
            >
              {status.node}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-snug">
            {localized.description}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider ${accent.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} aria-hidden="true" />
              {m.category[module.category]}
            </span>
            {result && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {result.detectedAt.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>

        {/* Switch (separated from card click target) */}
        <div
          className="shrink-0 self-center"
          onClick={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()}
        >
          <Switch
            checked={enabled}
            onCheckedChange={() => onToggle(module.id)}
            aria-label={m.detector.toggleEnable(localized.name)}
          />
        </div>
      </div>
    </motion.div>
  );
}

export const ModuleCard = memo(ModuleCardImpl);
