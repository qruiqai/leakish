/**
 * @jest-environment node
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    subscription: {
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@/lib/server/stripe', () => {
  const singleton = {
    subscriptions: { retrieve: jest.fn() },
  };
  return { getStripe: () => singleton };
});

const syncMock: jest.Mock = jest.fn(async () => undefined);
jest.mock('@/lib/billing/sync', () => ({
  syncSubscription: (...args: unknown[]) => syncMock(...args),
}));

import prisma from '@/lib/prisma';
import { getStripe } from '@/lib/server/stripe';
import { reconcileExpiredSubscriptions } from '@/lib/billing/reconcile';

const mockPrisma = prisma as unknown as {
  subscription: { findMany: jest.Mock; delete: jest.Mock };
};
const stripeMock = getStripe() as unknown as {
  subscriptions: { retrieve: jest.Mock };
};

const NOW = new Date('2026-05-13T12:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reconcileExpiredSubscriptions', () => {
  it('returns zeros when nothing is overdue', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);
    const summary = await reconcileExpiredSubscriptions({ now: NOW });
    expect(summary).toEqual({
      scanned: 0,
      synced: 0,
      deleted: 0,
      errors: 0,
      errorIds: [],
    });
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('queries with currentPeriodEnd <= now and paid statuses only', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([]);
    await reconcileExpiredSubscriptions({ now: NOW, limit: 25 });
    const call = mockPrisma.subscription.findMany.mock.calls[0][0];
    expect(call.where.currentPeriodEnd).toEqual({ lte: NOW });
    expect(call.where.status.in).toEqual(
      expect.arrayContaining(['active', 'trialing', 'past_due'])
    );
    expect(call.take).toBe(25);
    expect(call.orderBy).toEqual({ currentPeriodEnd: 'asc' });
  });

  it('syncs a healthy overdue row', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([
      { userId: 'u1', stripeSubscriptionId: 'sub_1' },
    ]);
    const fresh = { id: 'sub_1', items: { data: [] }, customer: 'cus_1' };
    stripeMock.subscriptions.retrieve.mockResolvedValue(fresh);

    const summary = await reconcileExpiredSubscriptions({ now: NOW });
    expect(summary.scanned).toBe(1);
    expect(summary.synced).toBe(1);
    expect(summary.deleted).toBe(0);
    expect(syncMock).toHaveBeenCalledWith('sub_1', 'u1', fresh);
  });

  it('deletes the row when Stripe returns 404', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([
      { userId: 'u-gone', stripeSubscriptionId: 'sub_gone' },
    ]);
    stripeMock.subscriptions.retrieve.mockRejectedValue({
      statusCode: 404,
      message: 'No such subscription',
    });
    mockPrisma.subscription.delete.mockResolvedValue({});

    const summary = await reconcileExpiredSubscriptions({ now: NOW });
    expect(summary.deleted).toBe(1);
    expect(summary.synced).toBe(0);
    expect(syncMock).not.toHaveBeenCalled();
    expect(mockPrisma.subscription.delete).toHaveBeenCalledWith({
      where: { userId: 'u-gone' },
    });
  });

  it('counts an error and keeps going when Stripe returns 500', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([
      { userId: 'u-flaky', stripeSubscriptionId: 'sub_flaky' },
      { userId: 'u-ok', stripeSubscriptionId: 'sub_ok' },
    ]);
    stripeMock.subscriptions.retrieve
      .mockRejectedValueOnce({ statusCode: 500, message: 'transient' })
      .mockResolvedValueOnce({ id: 'sub_ok', items: { data: [] }, customer: 'cus_ok' });

    const summary = await reconcileExpiredSubscriptions({ now: NOW });
    expect(summary.scanned).toBe(2);
    expect(summary.errors).toBe(1);
    expect(summary.errorIds).toEqual(['sub_flaky']);
    expect(summary.synced).toBe(1);
    expect(summary.deleted).toBe(0);
  });

  it('mixes sync + delete + error in one batch', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([
      { userId: 'u1', stripeSubscriptionId: 'sub_alive' },
      { userId: 'u2', stripeSubscriptionId: 'sub_gone' },
      { userId: 'u3', stripeSubscriptionId: 'sub_flaky' },
    ]);
    stripeMock.subscriptions.retrieve
      .mockResolvedValueOnce({ id: 'sub_alive', items: { data: [] }, customer: 'cus_1' })
      .mockRejectedValueOnce({ statusCode: 404 })
      .mockRejectedValueOnce({ statusCode: 503 });
    mockPrisma.subscription.delete.mockResolvedValue({});

    const summary = await reconcileExpiredSubscriptions({ now: NOW });
    expect(summary).toEqual({
      scanned: 3,
      synced: 1,
      deleted: 1,
      errors: 1,
      errorIds: ['sub_flaky'],
    });
  });

  it('survives a prisma delete failure during 404 cleanup', async () => {
    mockPrisma.subscription.findMany.mockResolvedValue([
      { userId: 'u-gone', stripeSubscriptionId: 'sub_gone' },
    ]);
    stripeMock.subscriptions.retrieve.mockRejectedValue({ statusCode: 404 });
    mockPrisma.subscription.delete.mockRejectedValue(new Error('db down'));

    const summary = await reconcileExpiredSubscriptions({ now: NOW });
    // Still counted as deleted from the cron's POV — the row's row will be
    // retried next run since it stays overdue.
    expect(summary.deleted).toBe(1);
    expect(summary.errors).toBe(0);
  });
});
