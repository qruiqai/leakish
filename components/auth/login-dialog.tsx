'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X } from 'lucide-react';

import { LoginForm } from '@/components/auth/login-form';
import { useMessages } from '@/lib/i18n/locale-client';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Plain-DOM modal — backdrop + centered card. We avoid pulling in a Dialog
 * primitive (radix-ui/react-dialog isn't already in detect's deps) since the
 * surface area we need is small enough to roll by hand:
 *
 *   - ESC closes
 *   - clicking the backdrop closes
 *   - body scroll locked while open
 *   - portal target = document.body so it escapes any positioning ancestor
 */
export function LoginDialog({ open, onClose }: Props) {
  const m = useMessages();
  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Avoid SSR issues with createPortal — only render after mount.
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-elevated animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={m.auth.close}
          className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="px-6 pt-7 pb-6">
          <div className="text-center mb-5">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--cat-network))] to-[hsl(var(--cat-browser))] shadow-elevated">
              <ShieldCheck className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <h2 id="login-dialog-title" className="text-base font-semibold tracking-tight">
              {m.auth.loginToContinue}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{m.app.subtitle}</p>
          </div>

          <LoginForm embedded />

          <p className="mt-5 text-center text-[11px] text-muted-foreground leading-relaxed">
            {m.auth.loginDisclaimer}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
