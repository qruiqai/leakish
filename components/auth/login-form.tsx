'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMessages } from '@/lib/i18n/locale-client';
import type { Messages } from '@/lib/i18n/messages';

interface Props {
  callbackUrl?: string;
  errorCode?: string;
  /**
   * When true, the email "sent" state renders inline (used inside the modal),
   * with a "back" button to send another. When false (default), success
   * navigates to the dedicated `/login/check-email` page.
   */
  embedded?: boolean;
}

function resolveAuthError(m: Messages, code: string | undefined): string | null {
  if (!code) return null;
  const errors = m.auth.form.errors;
  return (errors as Record<string, string>)[code] ?? errors.Default;
}

export function LoginForm({ callbackUrl, errorCode, embedded = false }: Props) {
  const m = useMessages();
  const router = useRouter();
  const [googleLoading, setGoogleLoading] = useState(false);
  // Two-phase email loading:
  //   sending = waiting on /api/auth/signin/email
  //   transitioning = navigating to /login/check-email (only when !embedded)
  const [sending, setSending] = useState(false);
  const [transitioning, startTransition] = useTransition();
  const emailLoading = sending || transitioning;
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  // In embedded mode: after a successful send we flip into an inline "sent"
  // state instead of navigating away — the caller (LoginDialog) doesn't have
  // anywhere else to send the user.
  const [sentTo, setSentTo] = useState<string | null>(null);

  // API key login (power-user / CLI ops). Hidden behind a toggle so it
  // doesn't visually compete with the primary Google/email options.
  const [apiKeyMode, setApiKeyMode] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const errorMessage = resolveAuthError(m, errorCode);

  const onGoogle = async () => {
    setGoogleLoading(true);
    await signIn('google', { callbackUrl: callbackUrl || '/app' });
  };

  const onApiKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApiKeyError(null);
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setApiKeyError(m.auth.form.apiKeyRequired);
      return;
    }
    setApiKeyLoading(true);
    try {
      const res = await fetch('/api/auth/api-key-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Important: include credentials so the new session cookie sticks.
        credentials: 'include',
        body: JSON.stringify({ apiKey: trimmed }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        setApiKeyError(json.message ?? m.auth.form.apiKeyFailedFallback(res.status));
        return;
      }
      // Hard navigate so the new session cookie is read on the next request
      // (matches the post-Google-login UX). useSession would also pick it up,
      // but a full nav is the most reliable way to re-run server components
      // and any auth-gated pages on the destination.
      // Block `//evil.com` — it starts with `/` but resolves externally.
      const next =
        callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')
          ? callbackUrl
          : '/app';
      window.location.assign(next);
    } catch (err) {
      setApiKeyError(err instanceof Error ? err.message : m.auth.form.loginFailedGeneric);
    } finally {
      setApiKeyLoading(false);
    }
  };

  const onEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(null);
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError(m.auth.form.invalidEmail);
      return;
    }
    setSending(true);
    try {
      const res = await signIn('email', {
        email: trimmed,
        callbackUrl: callbackUrl || '/app',
        redirect: false,
      });
      if (!res || res.error) {
        setEmailError(
          res?.error === 'EmailSignin'
            ? m.auth.form.emailSendRetry
            : (res?.error ?? m.auth.form.sendFailedGeneric)
        );
        return;
      }

      if (embedded) {
        // Stay in the modal and show inline confirmation.
        setSentTo(trimmed);
      } else {
        // Standalone /login page — navigate to a dedicated confirmation route.
        // Keep the button in loading state until the new page mounts.
        startTransition(() => {
          router.push(`/login/check-email?email=${encodeURIComponent(trimmed)}`);
        });
      }
    } finally {
      setSending(false);
    }
  };

  if (embedded && sentTo) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.08)] px-3 py-3">
          <CheckCircle2
            className="h-4 w-4 mt-0.5 text-[hsl(var(--success))] shrink-0"
            aria-hidden="true"
          />
          <div className="text-xs leading-relaxed">
            <p className="font-medium text-foreground">{m.auth.form.sentTitle}</p>
            <p className="mt-0.5 text-muted-foreground">{m.auth.form.sentBody(sentTo)}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setSentTo(null);
            setEmail('');
            setEmailError(null);
          }}
          className="w-full text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          {m.auth.form.resendDifferent}
        </Button>
      </div>
    );
  }

  const anyLoading = googleLoading || emailLoading || apiKeyLoading;

  return (
    <div className="space-y-4">
      <Button
        type="button"
        onClick={onGoogle}
        disabled={anyLoading}
        className="w-full shadow-elevated"
        size="lg"
      >
        {googleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
        ) : (
          <GoogleMark className="h-4 w-4 mr-2" aria-hidden="true" />
        )}
        {m.auth.form.googleCta}
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-border/60" />
        </div>
        <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
          <span className="bg-background px-2 text-muted-foreground">{m.auth.form.orEmail}</span>
        </div>
      </div>

      <form onSubmit={onEmail} className="space-y-2" noValidate>
        <label htmlFor="login-email" className="sr-only">
          {m.auth.form.emailLabel}
        </label>
        <input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={m.auth.form.emailPlaceholder}
          disabled={anyLoading}
          aria-invalid={emailError ? 'true' : undefined}
          className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:opacity-50"
        />
        <Button type="submit" variant="outline" size="lg" disabled={anyLoading} className="w-full">
          {emailLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
          ) : (
            <Mail className="h-4 w-4 mr-2" aria-hidden="true" />
          )}
          {emailLoading ? m.auth.form.sendingLink : m.auth.form.sendLink}
        </Button>
        {emailError && (
          <p role="alert" className="text-xs text-destructive">
            {emailError}
          </p>
        )}
      </form>

      <div className="pt-1">
        {!apiKeyMode ? (
          <button
            type="button"
            onClick={() => {
              setApiKeyMode(true);
              setApiKeyError(null);
            }}
            disabled={anyLoading}
            className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <KeyRound className="h-3 w-3" aria-hidden="true" />
            {m.auth.form.apiKeyToggle}
          </button>
        ) : (
          <form onSubmit={onApiKey} className="space-y-2" noValidate>
            <div className="flex items-center justify-between">
              <label
                htmlFor="login-api-key"
                className="text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                {m.auth.form.apiKeyLabel}
              </label>
              <button
                type="button"
                onClick={() => {
                  setApiKeyMode(false);
                  setApiKey('');
                  setApiKeyError(null);
                }}
                disabled={apiKeyLoading}
                className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {m.auth.form.apiKeyCancel}
              </button>
            </div>
            <input
              id="login-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={m.auth.form.apiKeyPlaceholder}
              disabled={anyLoading}
              aria-invalid={apiKeyError ? 'true' : undefined}
              className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground placeholder:font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:opacity-50"
            />
            <Button
              type="submit"
              variant="outline"
              size="lg"
              disabled={anyLoading}
              className="w-full"
            >
              {apiKeyLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
              ) : (
                <KeyRound className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              {apiKeyLoading ? m.auth.form.apiKeyLoading : m.auth.form.apiKeyCta}
            </Button>
            {apiKeyError && (
              <p role="alert" className="text-xs text-destructive">
                {apiKeyError}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {m.auth.form.apiKeyHint}
            </p>
          </form>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="text-xs text-destructive text-center">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function isValidEmail(s: string): boolean {
  // Intentionally lax — RFC 5322 is too strict in practice.
  // Real validation happens server-side via the email send.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
