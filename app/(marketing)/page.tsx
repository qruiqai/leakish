import { getOptionalUser } from '@/lib/api/auth';
import { LandingContent } from './landing-content';

export const dynamic = 'force-dynamic';

/**
 * Public marketing landing. The interactive detector now lives at /app — this
 * page is what unauth visitors see at the root, and what we'd point ads /
 * inbound search traffic at.
 *
 * Rendering lives in <LandingContent /> (a Client Component) so it can call
 * `useMessages()` for locale-aware copy. `<Button asChild>` uses Radix Slot
 * (refs), which is illegal in a Server Component — so this page only resolves
 * server-side data and hands rendering off.
 */
export default async function Landing() {
  const user = await getOptionalUser();
  return <LandingContent signedIn={!!user} />;
}
