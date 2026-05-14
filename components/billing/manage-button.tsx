'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useMessages } from '@/lib/i18n/locale-client';

export function ManageSubscriptionButton({ disabled }: { disabled?: boolean }) {
  const m = useMessages();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = (await res.json()) as { url?: string; message?: string };
      if (!res.ok || !data.url) {
        setError(data.message ?? m.billing.actionFailed);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(m.billing.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Button onClick={onClick} disabled={disabled || busy}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {m.billing.manage}
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
