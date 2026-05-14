import { redirect } from 'next/navigation';

import { getOptionalUser } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

interface SearchParams {
  callbackUrl?: string;
  error?: string;
}

/**
 * Login is an in-place modal on the detector page (`/app`). We keep this
 * route as a thin redirect so:
 *   - existing bookmarks still work
 *   - NextAuth's `pages.signIn = '/login'` config still resolves
 *   - error-code redirects (`/login?error=OAuthCallback`) land somewhere sane
 *
 * If the user is already authed we send them to the original callback (or `/app`).
 * Otherwise we open the dialog on the detector page via `?login=1`.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getOptionalUser();
  // Must start with `/` AND NOT `//` — the latter is a protocol-relative URL
  // (`//evil.com/x`) that the browser resolves to an external origin.
  const next =
    searchParams.callbackUrl &&
    searchParams.callbackUrl.startsWith('/') &&
    !searchParams.callbackUrl.startsWith('//')
      ? searchParams.callbackUrl
      : '/app';

  if (user) redirect(next);

  const params = new URLSearchParams({ login: '1' });
  if (next !== '/app') params.set('next', next);
  // Preserve NextAuth-style error codes so the dialog can show them inline.
  if (searchParams.error) params.set('loginError', searchParams.error);
  redirect(`/app?${params.toString()}`);
}
