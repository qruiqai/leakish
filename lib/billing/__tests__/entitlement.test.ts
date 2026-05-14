/**
 * @jest-environment node
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    subscription: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    detectScan: {
      count: jest.fn(),
    },
  },
}));

import prisma from '@/lib/prisma';
import { consumeScanQuota, getEntitlement, refundScanQuota } from '@/lib/billing/entitlement';

const mockPrisma = prisma as unknown as {
  subscription: { findUnique: jest.Mock; updateMany: jest.Mock };
  detectScan: { count: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getEntitlement', () => {
  it('returns Free + count(DetectScan) when no subscription exists', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    mockPrisma.detectScan.count.mockResolvedValue(2);

    const e = await getEntitlement('u1');
    expect(e.plan).toBe('free');
    expect(e.scansLimit).toBe(3);
    expect(e.retainCap).toBe(20);
    expect(e.scansUsed).toBe(2);
    expect(e.isPaid).toBe(false);
    expect(e.interval).toBeNull();
    // periodStart is UTC month start
    expect(e.periodStart.getUTCDate()).toBe(1);
    expect(e.periodStart.getUTCHours()).toBe(0);
  });

  it('returns Starter entitlement for an active subscription', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      plan: 'starter',
      interval: 'month',
      status: 'active',
      usageScansThisPeriod: 5,
      currentPeriodStart: new Date('2026-05-01'),
      currentPeriodEnd: new Date('2026-06-01'),
    });

    const e = await getEntitlement('u1');
    expect(e.plan).toBe('starter');
    expect(e.scansLimit).toBe(10);
    expect(e.retainCap).toBe(100);
    expect(e.scansUsed).toBe(5);
    expect(e.isPaid).toBe(true);
    expect(e.interval).toBe('month');
    // Free-mode count must not be queried when subscription is paid.
    expect(mockPrisma.detectScan.count).not.toHaveBeenCalled();
  });

  it('still grants paid entitlement when status is past_due', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      plan: 'pro',
      interval: 'year',
      status: 'past_due',
      usageScansThisPeriod: 12,
      currentPeriodStart: new Date('2026-01-01'),
      currentPeriodEnd: new Date('2027-01-01'),
    });

    const e = await getEntitlement('u1');
    expect(e.plan).toBe('pro');
    expect(e.scansLimit).toBe(200);
    expect(e.isPaid).toBe(true);
    expect(e.status).toBe('past_due');
  });

  it('falls back to Free when subscription is canceled', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      plan: 'starter',
      interval: 'month',
      status: 'canceled',
      usageScansThisPeriod: 0,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
    });
    mockPrisma.detectScan.count.mockResolvedValue(1);

    const e = await getEntitlement('u1');
    expect(e.plan).toBe('free');
    expect(e.isPaid).toBe(false);
    expect(e.scansLimit).toBe(3);
    expect(e.status).toBe('canceled');
  });
});

describe('consumeScanQuota', () => {
  it('admits a Free user under the limit without writes', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    mockPrisma.detectScan.count.mockResolvedValue(0);
    const r = await consumeScanQuota('u1');
    expect(r.ok).toBe(true);
    expect(mockPrisma.subscription.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a Free user at the limit', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    mockPrisma.detectScan.count.mockResolvedValue(3);
    const r = await consumeScanQuota('u1');
    expect(r.ok).toBe(false);
  });

  it('atomically reserves a slot for a paid user', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      plan: 'starter',
      interval: 'month',
      status: 'active',
      usageScansThisPeriod: 5,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
    });
    mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });

    const r = await consumeScanQuota('u1');
    expect(r.ok).toBe(true);
    expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          usageScansThisPeriod: { lt: 10 },
          status: { in: ['active', 'trialing', 'past_due'] },
        }),
        data: { usageScansThisPeriod: { increment: 1 } },
      })
    );
  });

  it('returns ok:false when the conditional update touches 0 rows (race)', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValueOnce({
      plan: 'starter',
      interval: 'month',
      status: 'active',
      usageScansThisPeriod: 9,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
    });
    mockPrisma.subscription.updateMany.mockResolvedValue({ count: 0 });
    // Re-read after the failed update — entitlement now shows 10 / 10.
    mockPrisma.subscription.findUnique.mockResolvedValueOnce({
      plan: 'starter',
      interval: 'month',
      status: 'active',
      usageScansThisPeriod: 10,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
    });

    const r = await consumeScanQuota('u1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.entitlement.scansUsed).toBe(10);
  });

  it('rejects a paid user at the quota cap before any write', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      plan: 'starter',
      interval: 'month',
      status: 'active',
      usageScansThisPeriod: 10,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
    });
    const r = await consumeScanQuota('u1');
    expect(r.ok).toBe(false);
    expect(mockPrisma.subscription.updateMany).not.toHaveBeenCalled();
  });
});

describe('refundScanQuota', () => {
  it('decrements only when current usage > 0', async () => {
    mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    await refundScanQuota('u1');
    expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', usageScansThisPeriod: { gt: 0 } },
        data: { usageScansThisPeriod: { decrement: 1 } },
      })
    );
  });
});
