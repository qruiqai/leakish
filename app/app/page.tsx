import { ModularDetector } from '@/components/modular-detector';
import { AuthGateProvider } from '@/components/auth/auth-gate-provider';

interface Props {
  searchParams: { login?: string; next?: string };
}

/**
 * The detector lives at /app. It's still publicly viewable — anyone can land
 * here and see the UI shell. Actions that need auth (Run All on the network
 * probe, save scan, view history) trigger the login dialog via
 * `useAuthGate.requireAuth(...)`.
 *
 * The `?login=1` query param is set by protected-route server redirects when
 * an unauth user tries to access `/scans/...` or `/integrations`; the
 * AuthGateProvider auto-opens the modal and remembers `next` so the user
 * lands where they meant to after authenticating.
 */
export default function DetectorPage({ searchParams }: Props) {
  const initialOpen = searchParams.login === '1';
  // Block protocol-relative URLs (`//evil.com/x`) that start with `/` but
  // browsers resolve to an external origin — open-redirect prevention.
  const initialNext =
    initialOpen &&
    searchParams.next &&
    searchParams.next.startsWith('/') &&
    !searchParams.next.startsWith('//')
      ? searchParams.next
      : undefined;

  return (
    <AuthGateProvider initialOpen={initialOpen} initialNext={initialNext}>
      <main className="min-h-screen bg-background">
        <ModularDetector />
      </main>
    </AuthGateProvider>
  );
}
