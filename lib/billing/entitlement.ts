import prisma from '@/lib/prisma';

import { PLAN_DEFS, type Interval, type PlanId } from './plans';

/**
 * Statuses that grant paid access. `past_due` is included on purpose:
 * Stripe retries failed invoices for ~3 weeks, and locking the user out
 * during that window is a worse UX than letting them save while the
 * pastDueBanner prompts them to update their card. `unpaid` / `canceled`
 * / `incomplete` all fall back to Free.
 */
export const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

export interface Entitlement {
  plan: PlanId;
  interval: Interval | null;
  status: string;
  scansUsed: number;
  scansLimit: number;
  retainCap: number;
  periodStart: Date;
  periodEnd: Date;
  isPaid: boolean;
}

/** UTC month boundary that resets on the 1st 00:00. */
function freePeriodStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function freePeriodEnd(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Return the user's current entitlement (plan, quota, retention, period window).
 *
 * For paid users the period is the Stripe billing cycle and `scansUsed` is the
 * subscription counter. For free users we synthesize a UTC-month window and
 * count the user's DetectScan rows inside it.
 */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      plan: true,
      interval: true,
      status: true,
      usageScansThisPeriod: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
    },
  });

  if (sub && PAID_STATUSES.has(sub.status)) {
    const plan = (sub.plan === 'pro' ? 'pro' : 'starter') as PlanId;
    const def = PLAN_DEFS[plan];
    return {
      plan,
      interval: sub.interval === 'year' ? 'year' : 'month',
      status: sub.status,
      scansUsed: sub.usageScansThisPeriod,
      scansLimit: def.scanQuota,
      retainCap: def.retainCap,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      isPaid: true,
    };
  }

  const periodStart = freePeriodStart();
  const periodEnd = freePeriodEnd();
  const scansUsed = await prisma.detectScan.count({
    where: { userId, createdAt: { gte: periodStart } },
  });

  return {
    plan: 'free',
    interval: null,
    status: sub?.status ?? 'none',
    scansUsed,
    scansLimit: PLAN_DEFS.free.scanQuota,
    retainCap: PLAN_DEFS.free.retainCap,
    periodStart,
    periodEnd,
    isPaid: false,
  };
}

export type ConsumeResult =
  | { ok: true; entitlement: Entitlement }
  | { ok: false; entitlement: Entitlement };

/**
 * Decide whether the user can save another scan in the current period, and
 * for paid users atomically reserve the slot.
 *
 * **Paid users** — a conditional `update` (`where usageScansThisPeriod < limit`)
 * returns affected-row count 0 when the quota is already drained, so two
 * concurrent saves can't both succeed.
 *
 * **Free users** — we just check `count(DetectScan)`. There's a small race
 * (two parallel calls could both pass the check and write), but the
 * saveScanLimiter (10/hour) bounds the damage, and Free quota is small
 * enough that an extra free save isn't worth the overhead of a counter.
 */
export async function consumeScanQuota(userId: string): Promise<ConsumeResult> {
  const entitlement = await getEntitlement(userId);

  if (entitlement.scansUsed >= entitlement.scansLimit) {
    return { ok: false, entitlement };
  }

  if (!entitlement.isPaid) {
    return { ok: true, entitlement };
  }

  const updated = await prisma.subscription.updateMany({
    where: {
      userId,
      status: { in: ['active', 'trialing', 'past_due'] },
      usageScansThisPeriod: { lt: entitlement.scansLimit },
    },
    data: { usageScansThisPeriod: { increment: 1 } },
  });

  if (updated.count === 0) {
    // Lost the race to another concurrent save (or status flipped between
    // read and write). Re-read so callers see the latest state.
    const fresh = await getEntitlement(userId);
    return { ok: false, entitlement: fresh };
  }

  return {
    ok: true,
    entitlement: { ...entitlement, scansUsed: entitlement.scansUsed + 1 },
  };
}

/**
 * Roll back a paid user's increment when the subsequent DetectScan.create
 * fails (and the failure isn't an idempotency hit, which is harmless). Free
 * users have no counter to roll back.
 */
export async function refundScanQuota(userId: string): Promise<void> {
  await prisma.subscription.updateMany({
    where: { userId, usageScansThisPeriod: { gt: 0 } },
    data: { usageScansThisPeriod: { decrement: 1 } },
  });
}
