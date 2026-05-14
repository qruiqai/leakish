'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, RefreshCw, Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { NavButton } from '@/components/ui/nav-button';
import { findScansByName, type ScanListItem } from '@/lib/client/scan-api';
import { logger } from '@/lib/logger';
import { useMessages } from '@/lib/i18n/locale-client';
import type { SaveStatus } from '@/components/overview/overview-panel';

interface Props {
  open: boolean;
  status: SaveStatus;
  onClose: () => void;
  onSave: (name: string) => void;
}

/**
 * Centered modal for naming and persisting a scan. Mirrors `LoginDialog` —
 * plain-DOM, portaled to body, ESC/backdrop to dismiss. On submit it first
 * asks the API whether the current user already has a scan under this exact
 * name; if so it surfaces a confirmation step (links to the existing rows)
 * before falling through to the real save. The duplicate check is advisory:
 * the user can always click "Save anyway".
 */
export function SaveScanDialog({ open, status, onClose, onSave }: Props) {
  const m = useMessages();
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [duplicates, setDuplicates] = useState<ScanListItem[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset internal state every time the dialog (re)opens so a previous
  // session's name/error doesn't leak in.
  useEffect(() => {
    if (open) {
      setName('');
      setLocalError(null);
      setChecking(false);
      setDuplicates(null);
    }
  }, [open]);

  // Auto-dismiss once the parent reports the save succeeded.
  useEffect(() => {
    if (open && status.kind === 'saved') onClose();
  }, [open, status.kind, onClose]);

  // Focus the input on open / after a duplicate prompt is dismissed back.
  useEffect(() => {
    if (open && !duplicates && status.kind !== 'saving') {
      inputRef.current?.focus();
    }
  }, [open, duplicates, status.kind]);

  // ESC dismisses — but not while saving (avoid orphaning an in-flight POST
  // visually; the request itself still completes).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status.kind !== 'saving') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, status.kind, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const trimmed = name.trim();
  const saving = status.kind === 'saving';
  const errorMessage = localError ?? (status.kind === 'error' ? status.message : null);

  const handleSubmit = async () => {
    if (!trimmed) {
      setLocalError(m.overview.saveNameRequired);
      return;
    }
    if (trimmed.length > 80) {
      setLocalError(m.overview.saveNameTooLong);
      return;
    }
    setLocalError(null);

    // Best-effort duplicate check. If the lookup fails (network, 5xx) we
    // proceed with the save rather than blocking — the warning is advisory.
    setChecking(true);
    try {
      const hits = await findScansByName(trimmed);
      if (hits.length > 0) {
        setDuplicates(hits);
        return;
      }
    } catch (err) {
      logger.warn('duplicate-name check failed:', err);
    } finally {
      setChecking(false);
    }
    onSave(trimmed);
  };

  const confirmDuplicate = () => {
    setDuplicates(null);
    onSave(trimmed);
  };

  const backToEditing = () => {
    setDuplicates(null);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-scan-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => {
          if (!saving) onClose();
        }}
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-elevated animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          aria-label={m.overview.saveCancel}
          className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        {duplicates ? (
          <DuplicateConfirm
            name={trimmed}
            duplicates={duplicates}
            saving={saving}
            errorMessage={errorMessage}
            onContinue={confirmDuplicate}
            onBack={backToEditing}
          />
        ) : (
          <div className="px-6 pt-7 pb-6">
            <div className="mb-5">
              <h2
                id="save-scan-dialog-title"
                className="text-base font-semibold tracking-tight"
              >
                {m.overview.saveDialogTitle}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {m.overview.saveDialogHint}
              </p>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                handleSubmit();
              }}
              className="space-y-3"
            >
              <div>
                <label
                  htmlFor="save-scan-name"
                  className="block text-xs font-medium text-foreground mb-1.5"
                >
                  {m.overview.saveNameLabel}
                </label>
                <input
                  ref={inputRef}
                  id="save-scan-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={saving || checking}
                  maxLength={80}
                  placeholder={m.overview.saveNamePlaceholder}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                />
                {errorMessage && (
                  <p className="mt-1.5 text-[11px] text-destructive">{errorMessage}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  disabled={saving}
                >
                  {m.overview.saveCancel}
                </Button>
                <Button type="submit" size="sm" disabled={saving || checking}>
                  {saving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
                      {m.overview.saving}
                    </>
                  ) : checking ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
                      {m.overview.saveCheckingDuplicates}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
                      {m.overview.saveConfirm}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function DuplicateConfirm({
  name,
  duplicates,
  saving,
  errorMessage,
  onContinue,
  onBack,
}: {
  name: string;
  duplicates: ScanListItem[];
  saving: boolean;
  errorMessage: string | null;
  onContinue: () => void;
  onBack: () => void;
}) {
  const m = useMessages();
  return (
    <div className="px-6 pt-7 pb-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--warning)/0.12)]">
          <AlertTriangle
            className="h-5 w-5 text-[hsl(var(--warning))]"
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">
            {m.overview.saveDuplicateHeading}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.overview.saveDuplicateBody(duplicates.length)}
          </p>
        </div>
      </div>

      <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        “{name}”
      </p>
      <ul
        className="mb-4 max-h-40 overflow-y-auto rounded-lg border border-border/60 bg-muted/30 divide-y divide-border/60"
        role="list"
      >
        {duplicates.map(d => (
          <li key={d.id}>
            <NavButton
              href={`/scans/${d.id}`}
              variant="ghost"
              size="sm"
              className="w-full justify-between rounded-none px-3 py-2 text-xs"
            >
              <span className="truncate">{d.name ?? '—'}</span>
              <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                {new Date(d.createdAt).toLocaleString()}
              </span>
            </NavButton>
          </li>
        ))}
      </ul>

      {errorMessage && (
        <p className="mb-3 text-[11px] text-destructive">{errorMessage}</p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={saving}
        >
          {m.overview.saveDuplicateGoBack}
        </Button>
        <Button type="button" size="sm" onClick={onContinue} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
              {m.overview.saving}
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {m.overview.saveDuplicateContinue}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
