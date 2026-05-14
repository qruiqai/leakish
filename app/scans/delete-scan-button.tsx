'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMessages } from '@/lib/i18n/locale-client';

interface Props {
  scanId: string;
  /**
   * After successful delete:
   *   'refresh' — re-fetch current route (used on the list page)
   *   'redirect' — navigate to /scans (used on the detail page)
   */
  afterDelete: 'refresh' | 'redirect';
  /** Visual variant. */
  variant?: 'icon' | 'full';
}

export function DeleteScanButton({ scanId, afterDelete, variant = 'icon' }: Props) {
  const m = useMessages();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (pending) return;
    setError(null);
    if (typeof window !== 'undefined' && !window.confirm(m.scans.deleteConfirm)) {
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/detect/scans/${encodeURIComponent(scanId)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(json.message ?? m.scans.deleteFailedFallback(res.status));
        }
        if (afterDelete === 'redirect') {
          router.push('/scans');
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : m.scans.deleteFailedGeneric);
      }
    });
  };

  if (variant === 'icon') {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
          }}
          disabled={pending}
          aria-label={m.scans.deleteAria}
          title={m.scans.deleteAria}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={pending}
        className="text-muted-foreground hover:text-destructive hover:border-destructive"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
        )}
        {m.scans.deleteCta}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
