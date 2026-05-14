'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMessages } from '@/lib/i18n/locale-client';
import { logger } from '@/lib/logger';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const m = useMessages();
  useEffect(() => {
    logger.warn('app/error boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-bold">{m.errors.detectorTitle}</h1>
        <p className="text-sm text-muted-foreground">{m.errors.detectorBody}</p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            {m.errors.errorIdLabel}: {error.digest}
          </p>
        )}
        <Button onClick={reset} size="sm">
          <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
          {m.errors.retry}
        </Button>
      </div>
    </div>
  );
}
