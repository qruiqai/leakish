import Link from 'next/link';

import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages } from '@/lib/i18n/messages';

export default function NotFound() {
  const m = getMessages(getLocale());
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-3xl font-bold">404</h1>
        <p className="text-sm text-muted-foreground">{m.errors.pageNotFound}</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          {m.errors.returnHome}
        </Link>
      </div>
    </div>
  );
}
