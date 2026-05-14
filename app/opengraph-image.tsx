import { ImageResponse } from 'next/og';

import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages } from '@/lib/i18n/messages';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Leakish — Privacy Leak Detector';

export default function OpenGraphImage() {
  const m = getMessages(getLocale());
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b0b0b',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          // Satori (next/og's renderer) doesn't accept 4-arg hsl(h,s,l,a)
          // legacy syntax. Use rgba so alpha is unambiguous to its parser.
          background:
            'radial-gradient(circle at 15% 10%, rgba(59, 130, 246, 0.25), transparent 55%), radial-gradient(circle at 90% 90%, rgba(168, 85, 247, 0.22), transparent 55%)',
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 168,
          height: 168,
          borderRadius: 36,
          background: 'linear-gradient(135deg, rgb(59, 130, 246) 0%, rgb(168, 85, 247) 100%)',
          boxShadow: '0 24px 64px rgba(59, 130, 246, 0.35)',
        }}
      >
        <svg
          width="96"
          height="96"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>
      <div
        style={{
          marginTop: 48,
          fontSize: 88,
          fontWeight: 700,
          letterSpacing: -2,
        }}
      >
        {m.app.title}
      </div>
      <div
        style={{
          marginTop: 20,
          fontSize: 32,
          color: 'rgba(255, 255, 255, 0.72)',
          maxWidth: 880,
          textAlign: 'center',
          lineHeight: 1.35,
        }}
      >
        {m.app.metaDescription}
      </div>
    </div>,
    size
  );
}
