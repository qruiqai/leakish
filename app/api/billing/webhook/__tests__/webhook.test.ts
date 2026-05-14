/**
 * @jest-environment node
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    stripeEvent: { create: jest.fn(), delete: jest.fn() },
    subscription: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
  },
}));

jest.mock('@/lib/server/stripe', () => {
  const singleton = {
    webhooks: { constructEvent: jest.fn() },
    subscriptions: { retrieve: jest.fn() },
  };
  return { getStripe: () => singleton };
});

jest.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_PRICE_STARTER_MONTHLY: 'price_starter_m',
    STRIPE_PRICE_STARTER_YEARLY: 'price_starter_y',
    STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m',
    STRIPE_PRICE_PRO_YEARLY: 'price_pro_y',
  }),
}));

import prisma from '@/lib/prisma';
import { getStripe } from '@/lib/server/stripe';
import { POST } from '../route';

const mockPrisma = prisma as unknown as {
  stripeEvent: { create: jest.Mock; delete: jest.Mock };
  subscription: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
    updateMany: jest.Mock;
  };
  user: { findUnique: jest.Mock; findFirst: jest.Mock };
};
const subscriptionMock = mockPrisma.subscription;

const stripeMock = getStripe() as unknown as {
  webhooks: { constructEvent: jest.Mock };
  subscriptions: { retrieve: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
});

function fakeReq(body: string) {
  return {
    text: async () => body,
    headers: { get: (h: string) => (h === 'stripe-signature' ? 'sig_x' : null) },
  } as unknown as Parameters<typeof POST>[0];
}

// In API version 2026-04-22.dahlia, `current_period_start` / `current_period_end`
// moved from the top-level Subscription onto each SubscriptionItem.
function makeSub(
  overrides: Partial<Record<string, unknown>> & {
    current_period_start?: number;
    current_period_end?: number;
  } = {}
) {
  const { current_period_start = 1700000000, current_period_end = 1702592000, ...rest } = overrides;
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { userId: 'u1' },
    items: {
      data: [
        {
          current_period_start,
          current_period_end,
          price: {
            id: 'price_starter_m',
            recurring: { interval: 'month' },
          },
        },
      ],
    },
    ...rest,
  };
}

// In 2026-04-22.dahlia the invoice→subscription linkage moved to
// `invoice.parent.subscription_details.subscription`.
function makeInvoice(subId: string) {
  return {
    parent: {
      type: 'subscription_details',
      subscription_details: { subscription: subId },
    },
  };
}

describe('duplicate event idempotency', () => {
  it('returns 200 duplicate without dispatching when StripeEvent insert throws P2002', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: { object: makeSub() },
    });
    mockPrisma.stripeEvent.create.mockRejectedValue({ code: 'P2002' });

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, duplicate: true });
    expect(subscriptionMock.upsert).not.toHaveBeenCalled();
  });
});

describe('customer.subscription.updated', () => {
  it('resets usage when period_start advances', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_x',
      type: 'customer.subscription.updated',
      data: { object: makeSub({ current_period_start: 2_000_000_000 }) },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    subscriptionMock.findUnique.mockResolvedValue({
      currentPeriodStart: new Date(1_900_000_000 * 1000),
    });

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(200);
    expect(subscriptionMock.upsert).toHaveBeenCalledTimes(1);
    const call = subscriptionMock.upsert.mock.calls[0][0];
    expect(call.update.usageScansThisPeriod).toBe(0);
  });

  it('does NOT reset usage when period_start is unchanged', async () => {
    const ts = 1_900_000_000;
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_y',
      type: 'customer.subscription.updated',
      data: { object: makeSub({ current_period_start: ts }) },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    subscriptionMock.findUnique.mockResolvedValue({
      currentPeriodStart: new Date(ts * 1000),
    });

    await POST(fakeReq('payload'));
    const call = subscriptionMock.upsert.mock.calls[0][0];
    expect(call.update.usageScansThisPeriod).toBeUndefined();
  });
});

describe('customer.subscription.deleted', () => {
  it('removes the Subscription row', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_d',
      type: 'customer.subscription.deleted',
      data: { object: makeSub() },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    subscriptionMock.delete.mockResolvedValue({});

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(200);
    expect(subscriptionMock.delete).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});

describe('invoice.payment_failed', () => {
  it('flips status to past_due without touching usage', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_f',
      type: 'invoice.payment_failed',
      data: { object: makeInvoice('sub_1') },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});
    subscriptionMock.updateMany.mockResolvedValue({ count: 1 });

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(200);
    expect(subscriptionMock.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_1' },
      data: { status: 'past_due' },
    });
    expect(subscriptionMock.upsert).not.toHaveBeenCalled();
  });

  it('ignores invoices whose parent is not a subscription', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_f2',
      type: 'invoice.payment_failed',
      data: { object: { parent: { type: 'quote_details' } } },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(200);
    expect(subscriptionMock.updateMany).not.toHaveBeenCalled();
  });
});

describe('invalid signature', () => {
  it('returns 400 when constructEvent throws', async () => {
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('bad signature');
    });
    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(400);
    expect(mockPrisma.stripeEvent.create).not.toHaveBeenCalled();
  });

  it('returns 400 when the stripe-signature header is missing', async () => {
    const req = {
      text: async () => 'payload',
      headers: { get: () => null },
    } as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_signature');
    expect(stripeMock.webhooks.constructEvent).not.toHaveBeenCalled();
  });
});

describe('checkout.session.completed', () => {
  it('syncs the subscription when both subscription and userId are present', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_co',
      type: 'checkout.session.completed',
      data: {
        object: {
          subscription: 'sub_1',
          client_reference_id: 'u1',
          metadata: {},
        },
      },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeSub());
    subscriptionMock.findUnique.mockResolvedValue(null);

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
    expect(subscriptionMock.upsert).toHaveBeenCalledTimes(1);
  });

  it('falls back to session.metadata.userId when client_reference_id is absent', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_co2',
      type: 'checkout.session.completed',
      data: {
        object: {
          subscription: 'sub_1',
          client_reference_id: null,
          metadata: { userId: 'u-meta' },
        },
      },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeSub({ metadata: { userId: 'u-meta' } }));
    subscriptionMock.findUnique.mockResolvedValue(null);

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(200);
    const call = subscriptionMock.upsert.mock.calls[0][0];
    expect(call.where.userId).toBe('u-meta');
  });

  it('does nothing when both subscription and userId are missing', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_co3',
      type: 'checkout.session.completed',
      data: { object: { subscription: null, client_reference_id: null, metadata: {} } },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(subscriptionMock.upsert).not.toHaveBeenCalled();
  });
});

describe('invoice.payment_succeeded', () => {
  function makeInvoice(billingReason: string, subId: string | null = 'sub_1') {
    return {
      billing_reason: billingReason,
      parent: subId
        ? {
            type: 'subscription_details',
            subscription_details: { subscription: subId },
          }
        : null,
    };
  }

  it('skips invoices whose billing_reason is not a subscription cycle/update/create', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_inv_manual',
      type: 'invoice.payment_succeeded',
      data: { object: makeInvoice('manual') },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(subscriptionMock.upsert).not.toHaveBeenCalled();
  });

  it('refetches the subscription and syncs on subscription_cycle', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_inv_cycle',
      type: 'invoice.payment_succeeded',
      data: { object: makeInvoice('subscription_cycle') },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeSub());
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    subscriptionMock.findUnique.mockResolvedValue({
      currentPeriodStart: new Date(1500000000 * 1000),
    });

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
    expect(subscriptionMock.upsert).toHaveBeenCalledTimes(1);
    // Period advanced (different start) → usage reset to 0
    const call = subscriptionMock.upsert.mock.calls[0][0];
    expect(call.update.usageScansThisPeriod).toBe(0);
  });

  it('also handles subscription_create and subscription_update', async () => {
    for (const reason of ['subscription_create', 'subscription_update']) {
      jest.clearAllMocks();
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: `evt_inv_${reason}`,
        type: 'invoice.payment_succeeded',
        data: { object: makeInvoice(reason) },
      });
      mockPrisma.stripeEvent.create.mockResolvedValue({});
      stripeMock.subscriptions.retrieve.mockResolvedValue(makeSub());
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      subscriptionMock.findUnique.mockResolvedValue(null);

      const res = await POST(fakeReq('payload'));
      expect(res.status).toBe(200);
      expect(stripeMock.subscriptions.retrieve).toHaveBeenCalled();
    }
  });

  it('does nothing when invoice has no parent subscription', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_inv_noparent',
      type: 'invoice.payment_succeeded',
      data: { object: makeInvoice('subscription_cycle', null) },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
  });
});

describe('idempotency table write failure (non-P2002)', () => {
  it('returns 500 when StripeEvent.create fails for a non-unique reason', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_misc',
      type: 'customer.subscription.updated',
      data: { object: makeSub() },
    });
    mockPrisma.stripeEvent.create.mockRejectedValue(new Error('db down'));

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(500);
    expect(subscriptionMock.upsert).not.toHaveBeenCalled();
  });
});

describe('dispatch failure after idempotency row inserted', () => {
  // Regression: if dispatch threw and we left the StripeEvent row behind,
  // Stripe's retry would hit the duplicate gate, return 200, and the event
  // would be permanently lost. The handler must roll the row back.
  it('rolls back the idempotency row so Stripe retries are not collapsed', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_dispatch_fail',
      type: 'customer.subscription.updated',
      data: { object: makeSub() },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});
    mockPrisma.stripeEvent.delete.mockResolvedValue({});
    // Make resolveUserId succeed, then make the dispatched upsert throw.
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    subscriptionMock.findUnique.mockResolvedValue(null);
    subscriptionMock.upsert.mockRejectedValue(new Error('db blip'));

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(500);
    expect(mockPrisma.stripeEvent.delete).toHaveBeenCalledWith({
      where: { id: 'evt_dispatch_fail' },
    });
  });

  it('still returns 500 when the rollback delete itself fails', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_rollback_fail',
      type: 'customer.subscription.updated',
      data: { object: makeSub() },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});
    mockPrisma.stripeEvent.delete.mockRejectedValue(new Error('rollback db blip'));
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    subscriptionMock.findUnique.mockResolvedValue(null);
    subscriptionMock.upsert.mockRejectedValue(new Error('db blip'));

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(500);
    expect(mockPrisma.stripeEvent.delete).toHaveBeenCalled();
  });
});

describe('unknown event types', () => {
  it('returns 200 and does nothing for events we did not subscribe to handlers for', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_misc',
      type: 'invoice.created',
      data: { object: {} },
    });
    mockPrisma.stripeEvent.create.mockResolvedValue({});

    const res = await POST(fakeReq('payload'));
    expect(res.status).toBe(200);
    expect(subscriptionMock.upsert).not.toHaveBeenCalled();
    expect(subscriptionMock.delete).not.toHaveBeenCalled();
    expect(subscriptionMock.updateMany).not.toHaveBeenCalled();
  });
});
