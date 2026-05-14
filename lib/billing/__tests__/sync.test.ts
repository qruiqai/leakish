/**
 * @jest-environment node
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
    subscription: { findUnique: jest.fn(), upsert: jest.fn() },
  },
}));

jest.mock('@/lib/server/stripe', () => {
  const singleton = {
    subscriptions: { retrieve: jest.fn() },
  };
  return { getStripe: () => singleton };
});

jest.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    STRIPE_PRICE_STARTER_MONTHLY: 'price_starter_m',
    STRIPE_PRICE_STARTER_YEARLY: 'price_starter_y',
    STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m',
    STRIPE_PRICE_PRO_YEARLY: 'price_pro_y',
  }),
}));

import prisma from '@/lib/prisma';
import { getStripe } from '@/lib/server/stripe';
import { resolveUserId, syncSubscription } from '@/lib/billing/sync';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; findFirst: jest.Mock };
  subscription: { findUnique: jest.Mock; upsert: jest.Mock };
};
const stripeMock = getStripe() as unknown as {
  subscriptions: { retrieve: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveUserId', () => {
  it('returns metadata.userId when that user exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-meta' });
    const id = await resolveUserId({
      metadata: { userId: 'u-meta' },
      customer: 'cus_1',
    } as never);
    expect(id).toBe('u-meta');
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to stripeCustomerId lookup when metadata.userId is missing', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u-byCustomer' });
    const id = await resolveUserId({
      metadata: {},
      customer: 'cus_42',
    } as never);
    expect(id).toBe('u-byCustomer');
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_42' },
      select: { id: true },
    });
  });

  it('falls back to stripeCustomerId lookup when metadata.userId does NOT resolve', async () => {
    // The webhook-arrives-before-DB-write-commits race: metadata exists but
    // the user row isn't visible yet. Stripe customer linkage saves us.
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u-byCustomer' });
    const id = await resolveUserId({
      metadata: { userId: 'u-meta-stale' },
      customer: 'cus_42',
    } as never);
    expect(id).toBe('u-byCustomer');
  });

  it('returns null when neither metadata nor customer linkage resolves', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const id = await resolveUserId({
      metadata: { userId: 'u-ghost' },
      customer: 'cus_ghost',
    } as never);
    expect(id).toBeNull();
  });

  it('handles customer being an expanded object rather than an id string', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u-x' });
    await resolveUserId({
      metadata: {},
      customer: { id: 'cus_expanded' },
    } as never);
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_expanded' },
      select: { id: true },
    });
  });
});

describe('syncSubscription edge cases', () => {
  function makeSub(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      metadata: { userId: 'u1' },
      items: {
        data: [
          {
            current_period_start: 1763000000,
            current_period_end: 1765678400,
            price: { id: 'price_starter_m', recurring: { interval: 'month' } },
          },
        ],
      },
      ...over,
    };
  }

  it('skips when the subscription has no items (defensive, real-world: never)', async () => {
    await syncSubscription('sub_x', 'u1', makeSub({ items: { data: [] } }) as never);
    expect(mockPrisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it('skips when the price id is not one we recognize', async () => {
    const sub = makeSub({
      items: {
        data: [
          {
            current_period_start: 1763000000,
            current_period_end: 1765678400,
            price: { id: 'price_random_legacy', recurring: { interval: 'month' } },
          },
        ],
      },
    });
    await syncSubscription('sub_x', 'u1', sub as never);
    expect(mockPrisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it('falls back to `subscriptions.retrieve` when no preloaded sub is passed', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeSub());
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    mockPrisma.subscription.upsert.mockResolvedValue({});

    await syncSubscription('sub_1', 'u1');

    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
    expect(mockPrisma.subscription.upsert).toHaveBeenCalledTimes(1);
    // create-branch (no existing row) always seeds usage at 0
    const call = mockPrisma.subscription.upsert.mock.calls[0][0];
    expect(call.create.usageScansThisPeriod).toBe(0);
  });

  it('handles customer field being an expanded object', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(
      makeSub({ customer: { id: 'cus_expanded' } })
    );
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    mockPrisma.subscription.upsert.mockResolvedValue({});

    await syncSubscription('sub_1', 'u1');

    const call = mockPrisma.subscription.upsert.mock.calls[0][0];
    expect(call.create.stripeCustomerId).toBe('cus_expanded');
  });
});
