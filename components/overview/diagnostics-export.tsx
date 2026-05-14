'use client';

import { useMemo, useState } from 'react';
import { ClipboardCheck, ClipboardCopy, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DetectionModule, DetectionResult } from '@/lib/detection-modules';
import type { ModuleAssessment, OverallAssessment } from '@/lib/risk';
import { useMessages } from '@/lib/i18n/locale-client';

type ModuleStatus = 'ok' | 'failed' | 'untested';

interface DiagnosticModuleExport {
  status: ModuleStatus;
  score: ModuleAssessment['level'];
  data: unknown;
  error?: string;
  detectedAt?: string;
}

interface DiagnosticsPayload {
  timestamp: string;
  userAgent: string;
  url: string;
  riskScore: number;
  riskLevel: OverallAssessment['level'];
  modules: Record<string, DiagnosticModuleExport>;
}

interface Props {
  assessment: OverallAssessment;
  modules: readonly DetectionModule[];
  results: Map<string, DetectionResult>;
}

type CopyState = { kind: 'idle' } | { kind: 'copied' } | { kind: 'manual'; reason: string };

function buildPayload(
  assessment: OverallAssessment,
  modules: readonly DetectionModule[],
  results: Map<string, DetectionResult>
): DiagnosticsPayload {
  const assessmentById = new Map(assessment.perModule.map(m => [m.moduleId, m]));
  const out: Record<string, DiagnosticModuleExport> = {};

  for (const module of modules) {
    const result = results.get(module.id);
    const perModule = assessmentById.get(module.id);
    let status: ModuleStatus;
    if (!result) status = 'untested';
    else if (result.success) status = 'ok';
    else status = 'failed';

    out[module.id] = {
      status,
      score: perModule?.level ?? 'unknown',
      // Preserve raw module data verbatim (including CDP diagnostics) so the
      // export is a faithful copy of what each module reported. Do not trim.
      data: result?.data,
      error: result?.error,
      detectedAt: result?.detectedAt ? new Date(result.detectedAt).toISOString() : undefined,
    };
  }

  return {
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    url: typeof window !== 'undefined' ? window.location.href : '',
    riskScore: assessment.score,
    riskLevel: assessment.level,
    modules: out,
  };
}

async function copyToClipboard(
  text: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Preferred path — modern secure-context API.
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    } catch (err) {
      // Fall through to execCommand fallback below.
      // Some browsers reject writeText when not focused / permission denied.
      void err;
    }
  }

  // Fallback: hidden textarea + execCommand('copy'). Works in older browsers
  // and insecure contexts where the async Clipboard API is unavailable.
  if (typeof document !== 'undefined') {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.left = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const success = document.execCommand('copy');
      document.body.removeChild(ta);
      if (success) return { ok: true };
      return { ok: false, reason: 'execCommand returned false' };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  return { ok: false, reason: 'no clipboard available' };
}

export function DiagnosticsExport({ assessment, modules, results }: Props) {
  const json = useMemo(
    () => JSON.stringify(buildPayload(assessment, modules, results), null, 2),
    [assessment, modules, results]
  );

  const [state, setState] = useState<CopyState>({ kind: 'idle' });

  const onCopy = async () => {
    const res = await copyToClipboard(json);
    if (res.ok) {
      setState({ kind: 'copied' });
      // Revert to idle after a short interval so the button is usable again.
      window.setTimeout(() => {
        setState(prev => (prev.kind === 'copied' ? { kind: 'idle' } : prev));
      }, 2000);
    } else {
      setState({ kind: 'manual', reason: res.reason });
    }
  };

  const copy = useMessages().overview.diagnostics;

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5" aria-label={copy.heading}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-muted/60">
              <FileJson className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </span>
            <h3 className="text-sm font-semibold tracking-tight">{copy.heading}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{copy.description}</p>
        </div>
        <Button
          onClick={onCopy}
          size="sm"
          variant="outline"
          className={state.kind === 'copied' ? 'text-[hsl(var(--success))]' : undefined}
          aria-live="polite"
        >
          {state.kind === 'copied' ? (
            <>
              <ClipboardCheck className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {copy.copied}
            </>
          ) : (
            <>
              <ClipboardCopy className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {copy.copy}
            </>
          )}
        </Button>
      </div>

      {state.kind === 'manual' && (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {copy.manualFallback}
        </p>
      )}

      <details className="mt-4 group">
        <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground transition-colors">
          {copy.toggle}
        </summary>
        <pre
          className="mt-2 max-h-96 overflow-auto rounded-md border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words"
          // Allow users to select and copy manually when clipboard API fails.
        >
          {json}
        </pre>
      </details>
    </section>
  );
}
