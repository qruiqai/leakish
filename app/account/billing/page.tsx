import { redirect } from 'next/navigation';

import { getOptionalUser } from '@/lib/api/auth';
import { getPendingChange } from '@/lib/billing/change-plan';
import { getEntitlement, PAID_STATUSES } from '@/lib/billing/entitlement';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

import { BillingContent } from './billing-content';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type StatusKey = 'active' | 'trialing' | 'pastDue' | 'canceled' | 'incomplete' | 'unpaid' | 'none';

function statusLabel(status: string): StatusKey {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'pastDue';
    case 'canceled':
      return 'canceled';
    case 'incomplete':
      return 'incomplete';
    case 'unpaid':
      return 'unpaid';
    default:
      return 'none';
  }
}

/**
 * `<Button asChild>` uses Radix Slot (refs), which is illegal in a Server
 * Component — so this page only resolves server-side data and hands rendering
 * off to <BillingContent />.
 */
export default async function AccountBillingPage({
  searchParams,
}: {
  searchParams?: { checkout?: string; change?: string };
}) {
  const user = await getOptionalUser();
  if (!user) {
    redirect('/login?next=/account/billing');
  }

  const entitlement = await getEntitlement(user.id);

  const sub = await prisma.subscription.findUnique({
    where: { userId: user.id },
    select: {
      cancelAtPeriodEnd: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      status: true,
    },
  });

  // Surface any scheduled-downgrade phase. Pulled live from Stripe rather than
  // mirrored locally — these read once on page load (rare), and skipping the
  // schema-mirror keeps state authoritative on Stripe's side.
  let pendingChange: { plan: 'starter' | 'pro'; interval: 'month' | 'year'; effectiveAtIso: string } | null = null;
  if (sub && PAID_STATUSES.has(sub.status)) {
    try {
      const pc = await getPendingChange(sub.stripeSubscriptionId);
      if (pc) {
        pendingChange = {
          plan: pc.plan,
          interval: pc.interval,
          effectiveAtIso: pc.effectiveAt.toISOString(),
        };
      }
    } catch (err) {
      logger.warn(`/account/billing: getPendingChange failed for ${user.id}:`, err);
    }
  }

  const checkoutRaw = searchParams?.checkout;
  const checkout: 'success' | 'cancel' | null =
    checkoutRaw === 'success' || checkoutRaw === 'cancel' ? checkoutRaw : null;

  const changeRaw = searchParams?.change;
  const change: 'upgrade-immediate' | 'downgrade-scheduled' | null =
    changeRaw === 'upgrade-immediate' || changeRaw === 'downgrade-scheduled' ? changeRaw : null;

  return (
    <BillingContent
      planId={entitlement.plan}
      statusKey={statusLabel(entitlement.status)}
      interval={entitlement.interval}
      cancelAtPeriodEnd={!!sub?.cancelAtPeriodEnd}
      canManage={!!sub?.stripeCustomerId}
      periodEndIso={entitlement.periodEnd.toISOString()}
      checkout={checkout}
      change={change}
      pendingChange={pendingChange}
      initialUsage={{
        plan: entitlement.plan,
        status: entitlement.status,
        scansUsed: entitlement.scansUsed,
        scansLimit: entitlement.scansLimit,
        retainCap: entitlement.retainCap,
        periodEnd: entitlement.periodEnd.toISOString(),
        isPaid: entitlement.isPaid,
      }}
    />
  );
}
