'use client';

import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { usePendingRouter } from '@/lib/client/use-pending-router';

interface Props {
  href: string;
  children: ReactNode;
  className?: string;
}

/**
 * Compact "← 返回 X" link with built-in pending feedback. Stays on the current
 * page (replacing the arrow with a spinner) until the destination is ready.
 */
export function BackLink({ href, children, className }: Props) {
  const { pending, interceptClick } = usePendingRouter();

  return (
    <Link
      href={href}
      onClick={interceptClick(href)}
      aria-busy={pending || undefined}
      className={
        className ??
        `inline-flex items-center gap-1.5 text-sm transition-colors ${
          pending
            ? 'text-foreground cursor-progress'
            : 'text-muted-foreground hover:text-foreground'
        }`
      }
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      )}
      {children}
    </Link>
  );
}
