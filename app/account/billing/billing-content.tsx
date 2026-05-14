'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { ManageSubscriptionButton } from '@/components/billing/manage-button';
import { UsageMeter, type UsageMeterData } from '@/components/billing/usage-meter';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { useLocale, useMessages } from '@/lib/i18n/locale-client';
import { htmlLang } from '@/lib/i18n/messages';

type StatusKey = 'active' | 'trialing' | 'pastDue' | 'canceled' | 'incomplete' | 'unpaid' | 'none';

export interface BillingContentProps {
  planId: 'free' | 'starter' | 'pro';
  statusKey: StatusKey;
  interval: 'month' | 'year' | null;
  cancelAtPeriodEnd: boolean;
  canManage: boolean;
  /** ISO string — formatted with the locale on the client. */
  periodEndIso: string;
  checkout: 'success' | 'cancel' | null;
  change: 'upgrade-immediate' | 'downgrade-scheduled' | null;
  pendingChange: { plan: 'starter' | 'pro'; interval: 'month' | 'year'; effectiveAtIso: string } | null;
  initialUsage: UsageMeterData;
}

export function BillingContent({
  planId,
  statusKey,
  interval,
  cancelAtPeriodEnd,
  canManage,
  periodEndIso,
  checkout,
  change,
  pendingChange,
  initialUsage,
}: BillingContentProps) {
  const m = useMessages();
  const locale = useLocale();
  const router = useRouter();

  const planName = m.pricing.plans[planId].name;
  const periodEndDisplay = new Date(periodEndIso).toLocaleDateString(htmlLang[locale]);

  const [cancelingChange, setCancelingChange] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const cancelScheduled = async () => {
    if (cancelingChange) return;
    setCancelingChange(true);
    setCancelError(null);
    try {
      const res = await fetch('/api/billing/change-plan', { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setCancelError(data.message ?? m.billing.actionFailed);
        return;
      }
      router.refresh();
    } catch {
      setCancelError(m.billing.actionFailed);
    } finally {
      setCancelingChange(false);
    }
  };

  const pendingPlanName = pendingChange ? m.pricing.plans[pendingChange.plan].name : null;
  const pendingDate = pendingChange
    ? new Date(pendingChange.effectiveAtIso).toLocaleDateString(htmlLang[locale])
    : null;

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <BackLink href="/scans">{m.scans.returnToList}</BackLink>
        </div>

        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{m.billing.heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{m.billing.subtitle}</p>
        </header>

        {checkout === 'success' && (
          <div className="mb-4 rounded-md border border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.1)] px-3 py-2 text-sm text-[hsl(var(--success))]">
            {m.billing.checkoutSuccess}
          </div>
        )}
        {checkout === 'cancel' && (
          <div className="mb-4 rounded-md border border-border/60 bg-muted px-3 py-2 text-sm text-muted-foreground">
            {m.billing.checkoutCancelled}
          </div>
        )}
        {change === 'upgrade-immediate' && (
          <div className="mb-4 rounded-md border border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.1)] px-3 py-2 text-sm text-[hsl(var(--success))]">
            {m.billing.upgradeApplied}
          </div>
        )}

        {pendingChange && pendingPlanName && pendingDate && (
          <div className="mb-4 flex flex-col gap-2 rounded-md border border-[hsl(var(--cat-network)/0.4)] bg-[hsl(var(--cat-network)/0.08)] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span>{m.billing.scheduledChange(pendingPlanName, pendingDate)}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={cancelScheduled}
                disabled={cancelingChange}
              >
                {cancelingChange && (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                )}
                {m.billing.cancelScheduledChange}
              </Button>
            </div>
          </div>
        )}
        {cancelError && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {cancelError}
          </div>
        )}

        {statusKey === 'pastDue' && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {m.billing.pastDueBanner}
          </div>
        )}

        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {m.billing.currentPlanLabel}
              </div>
              <div className="mt-1 text-xl font-semibold tracking-tight">{planName}</div>
              {interval && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {interval === 'year' ? m.billing.intervalYearly : m.billing.intervalMonthly}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {m.billing.statusLabel}
              </div>
              <div className="mt-1 text-sm font-medium">{m.billing.status[statusKey]}</div>
            </div>
          </div>
          {cancelAtPeriodEnd && (
            <p className="mt-3 text-xs text-muted-foreground">
              {m.billing.cancelNotice(periodEndDisplay)}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {canManage ? (
              <ManageSubscriptionButton />
            ) : (
              <Button asChild>
                <Link href="/pricing">{m.billing.pickPlan}</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/pricing">{m.billing.changePlan}</Link>
            </Button>
          </div>
        </section>

        <div className="mt-6">
          <UsageMeter initial={initialUsage} />
        </div>
      </div>
    </main>
  );
}
