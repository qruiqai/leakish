'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLocale, useMessages } from '@/lib/i18n/locale-client';
import { htmlLang, type Locale, type Messages } from '@/lib/i18n/messages';

interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

interface Props {
  initialKeys: ApiKeySummary[];
}

interface CreatedKey extends ApiKeySummary {
  /** Plaintext token, shown ONCE. */
  token: string;
}

export function IntegrationManager({ initialKeys }: Props) {
  const m = useMessages();
  const locale = useLocale();
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKeySummary[]>(initialKeys);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedKey | null>(null);

  const onCreate = async (name: string) => {
    const res = await fetch('/api/integration/keys', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(json.message ?? m.integrations.createFailedFallback(res.status));
    }
    const next = (await res.json()) as CreatedKey;
    setCreated(next);
    setKeys(prev => [next, ...prev]);
    setCreating(false);
  };

  const onRevoke = async (id: string) => {
    if (!window.confirm(m.integrations.revokeConfirm)) {
      return;
    }
    const res = await fetch(`/api/integration/keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      window.alert(m.integrations.revokeFailed);
      return;
    }
    // Optimistic refresh — the row's `revokedAt` will be set after a router refresh.
    router.refresh();
    setKeys(prev =>
      prev.map(k => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k))
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <Button onClick={() => setCreating(true)} size="sm" className="shadow-elevated">
          <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
          {m.integrations.newKey}
        </Button>
      </div>

      {created && <CreatedKeyBanner created={created} onDismiss={() => setCreated(null)} />}

      {creating && <CreateForm onSubmit={onCreate} onCancel={() => setCreating(false)} />}

      <KeyList keys={keys} onRevoke={onRevoke} locale={locale} />

      <UsageDocs />
    </div>
  );
}

/* ---------------- subcomponents ---------------- */

function CreateForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const m = useMessages();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError(m.integrations.nameRequired);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.integrations.createFailedGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium">{m.integrations.newKey}</span>
      </div>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={m.integrations.formPlaceholder}
        autoFocus
        disabled={submitting}
        className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:opacity-50"
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          {m.integrations.cancel}
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
          )}
          {m.integrations.create}
        </Button>
      </div>
    </form>
  );
}

function CreatedKeyBanner({ created, onDismiss }: { created: CreatedKey; onDismiss: () => void }) {
  const m = useMessages();
  const [revealed, setRevealed] = useState(true);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  const onCopy = () => {
    void navigator.clipboard.writeText(created.token).then(() => {
      setCopied(true);
      startTransition(() => {
        setTimeout(() => setCopied(false), 1500);
      });
    });
  };

  return (
    <div className="rounded-xl border border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.06)] p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2">
          <ShieldAlert
            className="h-4 w-4 mt-0.5 text-[hsl(var(--success))] shrink-0"
            aria-hidden="true"
          />
          <div className="text-sm">
            <p className="font-medium text-foreground">{m.integrations.bannerHeading}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{m.integrations.bannerBody}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={m.integrations.bannerDismissAria}
          className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 rounded-md bg-muted/60 px-3 py-2 text-xs font-mono break-all">
          {revealed ? created.token : '•'.repeat(Math.min(48, created.token.length))}
        </code>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setRevealed(r => !r)}
          aria-label={revealed ? m.integrations.hide : m.integrations.reveal}
        >
          {revealed ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCopy}>
          {copied ? (
            <Check className="h-4 w-4 mr-1.5" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4 mr-1.5" aria-hidden="true" />
          )}
          {copied ? m.integrations.copied : m.integrations.copy}
        </Button>
      </div>
    </div>
  );
}

function KeyList({
  keys,
  onRevoke,
  locale,
}: {
  keys: ApiKeySummary[];
  onRevoke: (id: string) => void | Promise<void>;
  locale: Locale;
}) {
  const m = useMessages();
  if (keys.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card px-4 py-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="text-sm font-semibold">{m.integrations.empty}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{m.integrations.emptyHint}</p>
      </div>
    );
  }

  return (
    <ul role="list" className="space-y-2">
      {keys.map(k => (
        <KeyRow key={k.id} keyData={k} onRevoke={onRevoke} locale={locale} />
      ))}
    </ul>
  );
}

function KeyRow({
  keyData,
  onRevoke,
  locale,
}: {
  keyData: ApiKeySummary;
  onRevoke: (id: string) => void | Promise<void>;
  locale: Locale;
}) {
  const m = useMessages();
  const isRevoked = !!keyData.revokedAt;
  const isExpired = keyData.expiresAt ? new Date(keyData.expiresAt) <= new Date() : false;
  const isInactive = isRevoked || isExpired;

  return (
    <li
      className={`flex items-start gap-3 rounded-xl border bg-card px-4 py-3 transition-colors ${
        isInactive ? 'border-border/40 opacity-60' : 'border-border/60'
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50">
        <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{keyData.name}</span>
          {isRevoked && (
            <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {m.integrations.revoked}
            </span>
          )}
          {isExpired && !isRevoked && (
            <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-destructive">
              {m.integrations.expired}
            </span>
          )}
        </div>
        <code className="mt-1 inline-block font-mono text-xs text-muted-foreground">
          {keyData.prefix}
        </code>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <span>{m.integrations.createdAt(formatTime(keyData.createdAt, locale))}</span>
          <span>·</span>
          <span>
            {keyData.lastUsedAt
              ? m.integrations.lastUsed(formatTime(keyData.lastUsedAt, locale))
              : m.integrations.neverUsed}
          </span>
          {keyData.expiresAt && (
            <>
              <span>·</span>
              <span>
                {isExpired
                  ? m.integrations.expiredAt(formatTime(keyData.expiresAt, locale))
                  : m.integrations.expiresAt(formatTime(keyData.expiresAt, locale))}
              </span>
            </>
          )}
        </div>
      </div>

      {!isInactive && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onRevoke(keyData.id)}
          className="text-muted-foreground hover:text-destructive hover:border-destructive"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          {m.integrations.revokeCta}
        </Button>
      )}
    </li>
  );
}

function UsageDocs() {
  const m = useMessages();
  return (
    <details className="rounded-xl border border-border/60 bg-card overflow-hidden group">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium select-none flex items-center justify-between hover:bg-muted/20">
        <span>{m.integrations.howTo}</span>
        <span className="text-xs text-muted-foreground group-open:hidden">
          {m.integrations.howToExpand}
        </span>
        <span className="text-xs text-muted-foreground hidden group-open:inline">
          {m.integrations.howToCollapse}
        </span>
      </summary>
      <div className="border-t border-border/60 px-4 py-4 space-y-4 text-xs">
        <div>
          <p className="font-medium mb-1">{m.integrations.docsBearerHeading}</p>
          <p className="text-muted-foreground leading-relaxed">
            {m.integrations.docsBearerPrefix}
            <code className="font-mono bg-muted/60 px-1 py-0.5 rounded">
              Authorization: Bearer det_xxxxxx
            </code>
            {m.integrations.docsBearerSuffix}
          </p>
        </div>

        <CodeBlock title={m.integrations.docsNetworkTitle}>
          {`curl -H "Authorization: Bearer \\$DETECT_API_KEY" \\
  https://leakish.com/api/detect/network`}
        </CodeBlock>

        <CodeBlock title={m.integrations.docsSaveScanTitle}>
          {`curl -X POST \\
  -H "Authorization: Bearer \\$DETECT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Chrome default","assessment":{...},"fingerprints":{...}}' \\
  https://leakish.com/api/detect/scans`}
        </CodeBlock>

        <CodeBlock title={m.integrations.docsListTitle}>
          {`curl -H "Authorization: Bearer \\$DETECT_API_KEY" \\
  https://leakish.com/api/detect/scans`}
        </CodeBlock>

        <p className="text-muted-foreground leading-relaxed">{m.integrations.docsRestriction}</p>
      </div>
    </details>
  );
}

function CodeBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium mb-1">{title}</p>
      <pre className="overflow-x-auto rounded-md bg-muted/40 px-3 py-2 text-[11px] font-mono leading-relaxed whitespace-pre">
        {children}
      </pre>
    </div>
  );
}

function formatTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  return d.toLocaleString(htmlLang[locale], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
