'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMessages } from '@/lib/i18n/locale-client';
import type { ScanSummary } from '@/lib/server/analytics';

type DiffRow = {
  name: string;
  a: unknown;
  b: unknown;
  same: boolean;
};

type DiffResponse = {
  aId: string;
  bId: string;
  fields: DiffRow[];
  rawBlobDiff: {
    canvasSame: boolean;
    webglSame: boolean;
    audioSame: boolean;
    fontListJaccard: number;
  };
  similarityScore: number;
};

export function ScanCompare({ scanSummaries }: { scanSummaries: ScanSummary[] }) {
  const m = useMessages();
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function runCompare() {
    if (!aId || !bId || aId === bId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/detect/analytics/diff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aId, bId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? m.analytics.compare.failed);
        setDiff(null);
        return;
      }
      const data = (await res.json()) as DiffResponse;
      setDiff(data);
    } catch {
      setError(m.analytics.compare.failed);
      setDiff(null);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setAId('');
    setBId('');
    setDiff(null);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <ScanSelect
          label={m.analytics.compare.pickA}
          value={aId}
          onChange={setAId}
          options={scanSummaries}
          exclude={bId}
        />
        <ScanSelect
          label={m.analytics.compare.pickB}
          value={bId}
          onChange={setBId}
          options={scanSummaries}
          exclude={aId}
        />
        <Button
          type="button"
          onClick={runCompare}
          disabled={!aId || !bId || aId === bId || loading}
          size="sm"
        >
          {loading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> {m.analytics.compare.loading}
            </>
          ) : (
            m.analytics.compare.run
          )}
        </Button>
        {diff && (
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            {m.analytics.compare.reset}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {diff && <DiffView diff={diff} showAll={showAll} setShowAll={setShowAll} />}
      {!diff && !error && (
        <p className="text-sm text-muted-foreground">{m.analytics.compare.empty}</p>
      )}
    </div>
  );
}

function ScanSelect({
  label,
  value,
  onChange,
  options,
  exclude,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ScanSummary[];
  exclude: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 min-w-[200px] rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">—</option>
        {options
          .filter(o => o.id !== exclude)
          .map(o => (
            <option key={o.id} value={o.id}>
              {o.name ?? o.id.slice(0, 10)} · {new Date(o.createdAt).toLocaleDateString()}
            </option>
          ))}
      </select>
    </label>
  );
}

function DiffView({
  diff,
  showAll,
  setShowAll,
}: {
  diff: DiffResponse;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
}) {
  const m = useMessages();
  const same = diff.fields.filter(f => f.same).length;
  const visibleFields = showAll ? diff.fields : diff.fields.filter(f => !f.same);
  const scoreTone =
    diff.similarityScore >= 80
      ? 'text-destructive'
      : diff.similarityScore >= 50
        ? 'text-[hsl(var(--warning))]'
        : 'text-[hsl(var(--success))]';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={`text-lg font-semibold tabular-nums ${scoreTone}`}>
          {m.analytics.compare.similarity(diff.similarityScore)}
        </span>
        <span className="text-[12px] text-muted-foreground">
          {m.analytics.compare.sameSummary(same, diff.fields.length)}
        </span>
      </div>

      <div className="rounded-lg border border-border/40 bg-background/40 p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          {m.analytics.compare.rawBlobs}
        </div>
        <ul className="flex flex-wrap gap-2 text-[11px]">
          <li
            className={
              diff.rawBlobDiff.canvasSame ? 'text-destructive' : 'text-[hsl(var(--success))]'
            }
          >
            {diff.rawBlobDiff.canvasSame
              ? m.analytics.compare.canvasSame
              : m.analytics.compare.canvasDiff}
          </li>
          <li
            className={
              diff.rawBlobDiff.webglSame ? 'text-destructive' : 'text-[hsl(var(--success))]'
            }
          >
            {diff.rawBlobDiff.webglSame
              ? m.analytics.compare.webglSame
              : m.analytics.compare.webglDiff}
          </li>
          <li
            className={
              diff.rawBlobDiff.audioSame ? 'text-destructive' : 'text-[hsl(var(--success))]'
            }
          >
            {diff.rawBlobDiff.audioSame
              ? m.analytics.compare.audioSame
              : m.analytics.compare.audioDiff}
          </li>
          <li className="text-muted-foreground">
            {m.analytics.compare.fontJaccard(Math.round(diff.rawBlobDiff.fontListJaccard * 100))}
          </li>
        </ul>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {showAll ? `${diff.fields.length}` : `${diff.fields.length - same}`}
        </span>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={!showAll} onChange={e => setShowAll(!e.target.checked)} />
          {m.analytics.compare.diffOnly}
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/40">
        <table className="w-full border-collapse text-[12px]">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">field</th>
              <th className="px-2 py-1.5 text-left font-medium">A</th>
              <th className="px-2 py-1.5 text-left font-medium">B</th>
              <th className="px-2 py-1.5 text-left font-medium" />
            </tr>
          </thead>
          <tbody>
            {visibleFields.map(f => (
              <tr key={f.name} className="border-t border-border/30">
                <td className="px-2 py-1 font-mono text-[11px]">{f.name}</td>
                <td className="px-2 py-1 font-mono break-all">{formatVal(f.a)}</td>
                <td className="px-2 py-1 font-mono break-all">{formatVal(f.b)}</td>
                <td className="px-2 py-1">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      f.same
                        ? 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]'
                        : 'bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]'
                    }`}
                  >
                    {f.same ? m.analytics.compare.sameTag : m.analytics.compare.diffTag}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  return s.length > 64 ? `${s.slice(0, 32)}…${s.slice(-8)}` : s;
}
