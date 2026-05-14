import type { Metadata, Viewport } from 'next';
import './globals.css';

import { AppSessionProvider } from '@/components/providers/session-provider';
import { fontMono, fontSans } from '@/lib/fonts';
import { LocaleProvider } from '@/lib/i18n/locale-client';
import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages, htmlLang, ogLocale } from '@/lib/i18n/messages';

// Auth-gated app: SessionProvider relies on a runtime session context that's
// null during static prerender, which breaks `useSession()` and cascades into
// the pages-router _error fallback. Opt every route into dynamic rendering.
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  const locale = getLocale();
  const m = getMessages(locale);
  return {
    title: {
      default: m.app.title,
      template: `%s · ${m.app.title}`,
    },
    description: m.app.metaDescription,
    keywords: [
      'WebRTC',
      'browser fingerprint',
      'Canvas fingerprint',
      'DNS leak',
      'privacy detection',
      'privacy',
      'fingerprint',
      'leak detection',
    ],
    openGraph: {
      title: m.app.title,
      description: m.app.metaDescription,
      type: 'website',
      locale: ogLocale[locale],
    },
    twitter: {
      card: 'summary_large_image',
      title: m.app.title,
      description: m.app.metaDescription,
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0b' },
  ],
};

// Inline script that runs before paint to avoid a flash of light/dark theme.
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('detect.theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (_) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  return (
    <html lang={htmlLang[locale]} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}>
        <LocaleProvider locale={locale}>
          <AppSessionProvider>{children}</AppSessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
