import 'server-only';

import { cookies } from 'next/headers';

import { LOCALE_COOKIE, defaultLocale, normalizeLocale, type Locale } from './messages';

/**
 * Read the user's locale from the `leakish.locale` cookie. Returns the default
 * locale if no cookie is set, or if called outside an active request scope
 * (jest tests, RSC build-time prerender). Doesn't throw so callers can use it
 * unconditionally at the top of a route handler.
 */
export function getLocale(): Locale {
  try {
    return normalizeLocale(cookies().get(LOCALE_COOKIE)?.value);
  } catch {
    return defaultLocale;
  }
}
