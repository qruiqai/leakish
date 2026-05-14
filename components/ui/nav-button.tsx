'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { type ComponentProps, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { usePendingRouter } from '@/lib/client/use-pending-router';

type ButtonVisualProps = Omit<ComponentProps<typeof Button>, 'asChild' | 'onClick' | 'disabled'>;

interface Props extends ButtonVisualProps {
  href: string;
  /** When pending, replaces this icon with a spinner. */
  icon?: ReactNode;
  /** Force the button into the disabled state (e.g. when also doing a save). */
  disabled?: boolean;
  children: ReactNode;
  /** Pass-through to Next's Link prefetch behavior. */
  prefetch?: boolean;
}

/**
 * Button-styled link that:
 *   - acts like a `<a href>` (right-click / middle-click open in new tab)
 *   - on plain left-click, defers the URL flip until the destination is ready
 *   - shows a spinner inside the button while waiting
 *
 * Implementation: a real <Link> rendered as a Button via Slot pattern,
 * with the click intercepted by usePendingRouter for the transition behavior.
 */
export function NavButton({ href, icon, disabled, children, prefetch, className, ...rest }: Props) {
  const { pending, interceptClick } = usePendingRouter();
  const showSpinner = pending;

  return (
    <Button asChild disabled={disabled || pending} className={className} {...rest}>
      <Link href={href} prefetch={prefetch} onClick={interceptClick(href)}>
        {showSpinner ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
        ) : (
          icon
        )}
        {children}
      </Link>
    </Button>
  );
}
