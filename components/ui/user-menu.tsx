'use client';

import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { History, KeyRound, Loader2, LogOut, User as UserIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { usePendingRouter } from '@/lib/client/use-pending-router';
import { useMessages } from '@/lib/i18n/locale-client';

export function UserMenu() {
  const m = useMessages();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (status !== 'authenticated' || !session?.user) {
    return null;
  }

  const user = session.user;
  const initial = (user.name ?? user.email ?? '?').slice(0, 1).toUpperCase();

  const onSignOut = () => {
    if (signingOut) return;
    setSigningOut(true);
    // signOut() resolves AFTER the full redirect happens, so we just leave
    // the spinner up; we never get back to render the idle state.
    void signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground/80 ring-1 ring-border hover:ring-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-hidden"
      >
        {user.image ? (
          <img
            src={user.image}
            alt={user.name ?? user.email ?? ''}
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-popover p-2 shadow-elevated z-50"
        >
          <div className="px-3 py-2 border-b border-border/60 mb-1">
            <div className="flex items-center gap-2 text-sm">
              <UserIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="font-medium truncate">{user.name ?? m.userMenu.unnamed}</span>
            </div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</div>
          </div>

          <MenuLink
            href="/scans"
            icon={<History className="h-4 w-4 mr-2" aria-hidden="true" />}
            onNavigate={() => setOpen(false)}
          >
            {m.userMenu.history}
          </MenuLink>
          <MenuLink
            href="/integrations"
            icon={<KeyRound className="h-4 w-4 mr-2" aria-hidden="true" />}
            onNavigate={() => setOpen(false)}
          >
            {m.userMenu.integrations}
          </MenuLink>

          <div className="my-1 h-px bg-border/60" aria-hidden="true" />

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={onSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            {signingOut ? m.userMenu.signingOut : m.userMenu.signOut}
          </Button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  const { pending, interceptClick } = usePendingRouter();
  return (
    <Link
      href={href}
      onClick={e => {
        onNavigate();
        interceptClick(href)(e);
      }}
      role="menuitem"
      className="flex items-center w-full rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
    >
      {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </Link>
  );
}
