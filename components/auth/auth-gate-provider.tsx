'use client';

import { useSession } from 'next-auth/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { LoginDialog } from './login-dialog';

interface AuthGateState {
  /** Currently authenticated user (subset). */
  user: SessionUser | null;
  /** Auth probing finished — false during initial NextAuth bootstrap. */
  ready: boolean;
  /**
   * Run `action` only if the user is logged in. If not, opens the login modal
   * and queues `action` to run automatically after a successful login.
   *
   * Optional `redirectAfter` lets a caller send the user to a specific URL
   * after login instead of running an in-place callback.
   */
  requireAuth(opts: RequireAuthOpts): void;
  /** Open the login modal directly (no queued action). */
  openLogin(): void;
  /** Close the login modal (no-op when not open). */
  closeLogin(): void;
}

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

export type RequireAuthOpts =
  | { action: () => void; redirectAfter?: never }
  | { action?: never; redirectAfter: string };

const Ctx = createContext<AuthGateState | null>(null);

export function useAuthGate(): AuthGateState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuthGate called outside <AuthGateProvider>');
  return v;
}

/** Sentinel for "auto-open the login modal on mount", from URL or any caller. */
interface PendingAction {
  type: 'callback' | 'redirect';
  callback?: () => void;
  redirect?: string;
}

interface ProviderProps {
  children: ReactNode;
  /**
   * If true on initial mount, opens the login modal automatically — used by
   * `/scans/...` redirecting unauth users to `/?login=1&next=/scans`.
   */
  initialOpen?: boolean;
  initialNext?: string;
}

export function AuthGateProvider({ children, initialOpen = false, initialNext }: ProviderProps) {
  const { data, status } = useSession();
  const ready = status !== 'loading';
  const sessionUser = (data?.user ?? null) as SessionUser | null;

  const [open, setOpen] = useState<boolean>(initialOpen);
  const pendingRef = useRef<PendingAction | null>(
    initialOpen && initialNext ? { type: 'redirect', redirect: initialNext } : null
  );

  // When auth flips to logged-in, fire the queued action and close.
  useEffect(() => {
    if (status !== 'authenticated') return;

    const queued = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);

    if (!queued) return;
    if (queued.type === 'callback') {
      try {
        queued.callback?.();
      } catch (err) {
        // The queued action shouldn't crash the provider.
        // eslint-disable-next-line no-console
        console.error('Queued auth action threw:', err);
      }
    } else if (queued.type === 'redirect' && queued.redirect) {
      // Use a hard navigation to honor the destination's own server-side checks.
      window.location.href = queued.redirect;
    }
  }, [status]);

  const requireAuth = useCallback(
    (opts: RequireAuthOpts) => {
      if (status === 'authenticated') {
        if ('action' in opts && opts.action) opts.action();
        else if ('redirectAfter' in opts && opts.redirectAfter)
          window.location.href = opts.redirectAfter;
        return;
      }
      pendingRef.current =
        'action' in opts && opts.action
          ? { type: 'callback', callback: opts.action }
          : { type: 'redirect', redirect: opts.redirectAfter };
      setOpen(true);
    },
    [status]
  );

  const openLogin = useCallback(() => {
    pendingRef.current = null;
    setOpen(true);
  }, []);

  const closeLogin = useCallback(() => {
    pendingRef.current = null;
    setOpen(false);
  }, []);

  const value = useMemo<AuthGateState>(
    () => ({
      user: sessionUser,
      ready,
      requireAuth,
      openLogin,
      closeLogin,
    }),
    [sessionUser, ready, requireAuth, openLogin, closeLogin]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <LoginDialog open={open} onClose={closeLogin} />
    </Ctx.Provider>
  );
}
