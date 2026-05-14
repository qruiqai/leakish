'use client';

import { Languages } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLocale, useMessages, useSetLocale } from '@/lib/i18n/locale-client';

export function LocaleToggle() {
  const m = useMessages();
  const locale = useLocale();
  const setLocale = useSetLocale();

  const next = locale === 'en' ? 'zh' : 'en';
  const nextLabel = next === 'en' ? m.locale.en : m.locale.zh;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setLocale(next)}
      aria-label={`${m.locale.switcher}: ${nextLabel}`}
      title={nextLabel}
      className="h-9 w-9 text-muted-foreground hover:text-foreground"
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
