'use client';

import { useRouter } from 'next/navigation';
import { useTransition, type MouseEvent } from 'react';

/**
 * Optimistic-but-pessimistic navigation: clicks STAY on the current page
 * (showing a spinner on the click target) until the destination's server
 * components and data are ready, only THEN does the URL flip.
 *
 * This is just `useTransition` + `router.push`. The transition keeps the
 * current page's React tree alive until the new tree is "thenable", which is
 * exactly the UX pattern the user asked for.
 *
 * Anchor click semantics we preserve in `interceptClick`:
 *   - Cmd/Ctrl/Shift/Alt + click  → let the browser open in a new tab
 *   - Middle/right click          → let the browser do its native thing
 *   - target=_blank               → don't intercept
 *   - explicit preventDefault()   → respect it
 *   - external (different origin) → don't intercept
 */

export interface PendingRouter {
  pending: boolean;
  /** Plain navigation. Use as `onClick` for buttons. */
  navigate(href: string): void;
  /**
   * Drop-in onClick for `<a>` / `<Link>` that preserves all the native
   * "open in new tab" semantics. Returns true if it intercepted, so the
   * caller can decide whether to render a pending overlay.
   */
  interceptClick(href: string): (event: MouseEvent<HTMLAnchorElement>) => void;
}

export function usePendingRouter(): PendingRouter {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const navigate = (href: string) => {
    startTransition(() => router.push(href));
  };

  const interceptClick = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    // Respect explicit preventDefault.
    if (event.defaultPrevented) return;
    // Respect modifier-clicks and non-primary buttons.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;
    // Respect target=_blank etc.
    const target = event.currentTarget.getAttribute('target');
    if (target && target !== '' && target !== '_self') return;
    // Respect external origins.
    try {
      const dest = new URL(href, window.location.origin);
      if (dest.origin !== window.location.origin) return;
    } catch {
      // Bad href — let the browser deal with it.
      return;
    }

    event.preventDefault();
    navigate(href);
  };

  return { pending, navigate, interceptClick };
}
