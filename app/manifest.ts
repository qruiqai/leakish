import type { MetadataRoute } from 'next';

import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages } from '@/lib/i18n/messages';

export default function manifest(): MetadataRoute.Manifest {
  const m = getMessages(getLocale());
  return {
    name: m.app.title,
    short_name: m.app.shortTitle,
    description: m.app.metaDescription,
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0b0b',
    theme_color: '#3b82f6',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
