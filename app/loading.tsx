import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages } from '@/lib/i18n/messages';

export default function Loading() {
  const m = getMessages(getLocale());
  return (
    <div className="h-screen flex flex-col bg-background" aria-busy="true" aria-live="polite">
      <div className="border-b px-6 py-3">
        <div className="h-5 w-48 bg-muted animate-pulse rounded" />
        <div className="h-3 w-72 bg-muted animate-pulse rounded mt-2" />
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r bg-muted/30 p-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        </div>
      </div>
      <span className="sr-only">{m.errors.loading}</span>
    </div>
  );
}
