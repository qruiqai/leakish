'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useMessages } from '@/lib/i18n/locale-client';
import type { Messages } from '@/lib/i18n/messages';

import {
  PLAN_DEFS,
  PLAN_ORDER,
  type Interval,
  type PaidPlanId,
  type PlanId,
} from '@/lib/billing/plans';

export interface PlanAvailability {
  starter: { month: boolean; year: boolean };
  pro: { month: boolean; year: boolean };
}

export interface PricingTableProps {
  signedIn: boolean;
  currentPlan?: PlanId;
  availability: PlanAvailability;
}

const FEATURE_KEYS = [
  'savesPerCycle',
  'retainHistory',
  'analytics',
  'apiAccess',
  'prioritySupport',
] as const;

type FeatureKey = (typeof FEATURE_KEYS)[number];

function renderFeature(
  m: Messages,
  feature: FeatureKey,
  plan: { scanQuota: number; retainCap: number }
): string {
  switch (feature) {
    case 'savesPerCycle':
      return m.pricing.features.savesPerCycle(plan.scanQuota);
    case 'retainHistory':
      return m.pricing.features.retainHistory(plan.retainCap);
    case 'analytics':
      return m.pricing.features.analytics;
    case 'apiAccess':
      return m.pricing.features.apiAccess;
    case 'prioritySupport':
      return m.pricing.features.prioritySupport;
  }
}

function priceLabel(m: Messages, plan: PaidPlanId, interval: Interval): string {
  const def = PLAN_DEFS[plan];
  if (interval === 'year' && def.yearlyUsd !== undefined) {
    return `$${formatAmount(def.yearlyUsd)}`;
  }
  if (def.monthlyUsd !== undefined) {
    return `$${formatAmount(def.monthlyUsd)}`;
  }
  return '';
}

function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function PricingTable({ signedIn, currentPlan, availability }: PricingTableProps) {
  const m = useMessages();
  const router = useRouter();
  const [interval, setInterval] = useState<Interval>('month');
  const [busyPlan, setBusyPlan] = useState<PaidPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // True when the user already has a paid Stripe subscription. In that case
  // any click on a *different* paid plan must NOT go through Checkout — that
  // mints a parallel subscription, double-billing. We route them to our
  // change-plan endpoint, which:
  //   - Upgrade  → `subscriptions.update` with `proration_behavior:
  //                'always_invoice'` (immediate + prorated charge)
  //   - Downgrade → `subscriptionSchedules.create` (scheduled to period end,
  //                user keeps paid features through the rest of the cycle)
  const alreadySubscribed = !!currentPlan && currentPlan !== 'free';

  const changePlan = async (plan: PaidPlanId) => {
    setBusyPlan(plan);
    setError(null);
    try {
      const res = await fetch('/api/billing/change-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, interval }),
      });
      const data = (await res.json()) as {
        mode?: 'upgrade-immediate' | 'downgrade-scheduled' | 'noop';
        message?: string;
      };
      if (!res.ok) {
        setError(data.message ?? m.billing.actionFailed);
        return;
      }
      // Either path is settled — bounce to /account/billing where the user
      // sees the new state (or scheduled-change banner for downgrades).
      router.push('/account/billing?change=' + (data.mode ?? 'noop'));
      router.refresh();
    } catch {
      setError(m.billing.actionFailed);
    } finally {
      setBusyPlan(null);
    }
  };

  const handleSubscribe = async (plan: PaidPlanId) => {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent('/pricing')}`);
      return;
    }
    if (alreadySubscribed) {
      return changePlan(plan);
    }
    setBusyPlan(plan);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, interval }),
      });
      const data = (await res.json()) as {
        url?: string;
        message?: string;
        switchInPortal?: boolean;
      };
      // Backstop: a stale tab can still POST checkout after a paid sub
      // landed in the DB. The route now answers 409 with switchInPortal=true
      // — route through change-plan instead of leaving the user stuck.
      if (res.status === 409 && data.switchInPortal) {
        return changePlan(plan);
      }
      if (!res.ok || !data.url) {
        setError(data.message ?? m.billing.actionFailed);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(m.billing.actionFailed);
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <div>
      <IntervalToggle interval={interval} onChange={setInterval} m={m} />

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <ul role="list" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLAN_ORDER.map(planId => {
          const def = PLAN_DEFS[planId];
          const isCurrent = currentPlan === planId;
          const planCopy = m.pricing.plans[planId as keyof typeof m.pricing.plans];
          const features = def.features as FeatureKey[];

          const isPaidPlan = planId !== 'free';
          const planAvail =
            isPaidPlan && (availability[planId as PaidPlanId] as { month: boolean; year: boolean });
          const enabledForInterval = !isPaidPlan || (planAvail && planAvail[interval]);
          const showAlternativeNotice = isPaidPlan && planAvail && !enabledForInterval;

          let priceBlock: React.ReactNode;
          if (!isPaidPlan) {
            priceBlock = (
              <div>
                <span className="text-3xl font-semibold tracking-tight">{m.pricing.free}</span>
              </div>
            );
          } else {
            const price = priceLabel(m, planId as PaidPlanId, interval);
            priceBlock = (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight">{price}</span>
                <span className="text-sm text-muted-foreground">
                  {interval === 'month' ? m.pricing.perMonth : m.pricing.perYear}
                </span>
              </div>
            );
          }

          return (
            <li
              key={planId}
              className={`flex flex-col rounded-2xl border bg-card p-6 shadow-elevated transition-colors ${
                planId === 'starter' ? 'border-[hsl(var(--cat-network)/0.45)]' : 'border-border/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold tracking-tight">{planCopy.name}</h3>
                {planId === 'starter' && (
                  <span className="rounded-full bg-[hsl(var(--cat-network)/0.15)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--cat-network))]">
                    {m.pricing.badgeRecommended}
                  </span>
                )}
                {isCurrent && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {m.pricing.badgeCurrent}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{planCopy.blurb}</p>

              <div className="mt-5">{priceBlock}</div>

              <ul role="list" className="mt-5 space-y-2 text-sm">
                {features.map(featureKey => (
                  <li key={featureKey} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--success))]"
                      aria-hidden="true"
                    />
                    <span>{renderFeature(m, featureKey, def)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-6">
                {!isPaidPlan ? (
                  <Button asChild variant={isCurrent ? 'outline' : 'default'} className="w-full">
                    <Link href={signedIn ? '/app' : '/login?next=/app'}>{planCopy.cta}</Link>
                  </Button>
                ) : isCurrent ? (
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/account/billing">{m.pricing.ctaManage}</Link>
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    // When switching between paid plans the user is bounced to
                    // the Customer Portal — interval availability doesn't gate
                    // that path (portal lists every configured price itself).
                    disabled={
                      (!enabledForInterval && !alreadySubscribed) || busyPlan !== null
                    }
                    onClick={() => handleSubscribe(planId as PaidPlanId)}
                  >
                    {busyPlan === planId ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        {alreadySubscribed
                          ? m.pricing.ctaSwitchTo(planCopy.name)
                          : planCopy.cta}
                      </>
                    ) : !signedIn ? (
                      m.pricing.ctaSignInRequired
                    ) : alreadySubscribed ? (
                      m.pricing.ctaSwitchTo(planCopy.name)
                    ) : enabledForInterval ? (
                      planCopy.cta
                    ) : (
                      m.pricing.unavailable
                    )}
                  </Button>
                )}
                {showAlternativeNotice && (
                  <p className="mt-2 text-xs text-muted-foreground">{m.pricing.unavailable}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function IntervalToggle({
  interval,
  onChange,
  m,
}: {
  interval: Interval;
  onChange: (i: Interval) => void;
  m: Messages;
}) {
  return (
    <div className="mb-6 flex justify-center">
      <div className="inline-flex rounded-full border border-border/60 bg-card p-1 text-sm">
        <button
          type="button"
          onClick={() => onChange('month')}
          className={`rounded-full px-4 py-1.5 transition-colors ${
            interval === 'month'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {m.pricing.monthly}
        </button>
        <button
          type="button"
          onClick={() => onChange('year')}
          className={`rounded-full px-4 py-1.5 transition-colors flex items-center gap-1.5 ${
            interval === 'year'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {m.pricing.yearly}
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              interval === 'year'
                ? 'bg-background/20 text-background'
                : 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]'
            }`}
          >
            {m.pricing.yearlyBadge}
          </span>
        </button>
      </div>
    </div>
  );
}
