/**
 * @jest-environment node
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    subscription: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/server/stripe', () => {
  const singleton = {
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
  };
  return { getStripe: () => singleton };
});

const appUrlMock = jest.fn();
jest.mock('@/lib/billing/app-url', () => ({
  getAppUrl: () => appUrlMock(),
}));

jest.mock('@/lib/billing/plans', () => {
  const priceIdFor = jest.fn();
  return {
    priceIdFor,
    // Force a deterministic env-less resolution path in the route's call.
    __priceIdForMock: priceIdFor,
  };
});

const authState: {
  user: { id: string; email: string; name: null; image: null };
  source: 'session' | 'api-key';
} = {
  user: { id: 'u1', email: 'u@x.com', name: null, image: null },
  source: 'session',
};
jest.mock('@/lib/api/auth', () => {
  const { getMessages } = jest.requireActual('@/lib/i18n/messages');
  return {
    withDetectAuth: jest.fn(async (req: unknown, handler: (ctx: unknown) => Promise<Response>) =>
      handler({ req, user: authState.user, source: authState.source, m: getMessages('en') })
    ),
  };
});

import prisma from '@/lib/prisma';
import { getStripe } from '@/lib/server/stripe';
import { priceIdFor } from '@/lib/billing/plans';
import { POST } from '../route';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
  subscription: { findUnique: jest.Mock };
};
const stripeMock = getStripe() as unknown as {
  customers: { create: jest.Mock };
  checkout: { sessions: { create: jest.Mock } };
};
const priceIdForMock = priceIdFor as unknown as jest.Mock;

function makeReq(body: unknown) {
  return {
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  authState.source = 'session';
  appUrlMock.mockReturnValue('https://leakish.com');
  priceIdForMock.mockImplementation((plan: string, interval: string) =>
    plan === 'starter' && interval === 'month' ? 'price_starter_m' : 'price_unknown'
  );
  // Default: user has no existing Subscription row → checkout proceeds.
  // Individual tests can override for the already_subscribed path.
  mockPrisma.subscription.findUnique.mockResolvedValue(null);
});

describe('POST /api/billing/checkout', () => {
  it('rejects API-key auth — subscribing requires a browser session', async () => {
    authState.source = 'api-key';
    const res = await POST(makeReq({ plan: 'starter', interval: 'month' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('api_key_cannot_subscribe');
  });

  it('rejects invalid JSON body with invalid_json', async () => {
    const req = {
      headers: { get: () => null },
      json: async () => {
        throw new SyntaxError('not json');
      },
    } as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('rejects payload that fails schema validation', async () => {
    const res = await POST(makeReq({ plan: 'free', interval: 'forever' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_payload');
  });

  it('rejects (plan, interval) whose price id is not configured', async () => {
    priceIdForMock.mockReturnValue(undefined);
    const res = await POST(makeReq({ plan: 'pro', interval: 'year' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('plan_invalid');
  });

  it('returns 500 not_configured when no app URL is set', async () => {
    appUrlMock.mockReturnValue(null);
    const res = await POST(makeReq({ plan: 'starter', interval: 'month' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('not_configured');
  });

  it('creates a new Stripe customer when the user does not have one yet', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ stripeCustomerId: null });
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' });
    mockPrisma.user.update.mockResolvedValue({});
    stripeMock.checkout.sessions.create.mockResolvedValue({
      url: 'https://checkout.stripe.com/session_x',
    });

    const res = await POST(makeReq({ plan: 'starter', interval: 'month' }));
    expect(res.status).toBe(200);
    expect(stripeMock.customers.create).toHaveBeenCalledWith({
      email: 'u@x.com',
      metadata: { userId: 'u1' },
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { stripeCustomerId: 'cus_new' },
    });
    // Checkout session created with the right shape.
    const call = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(call.mode).toBe('subscription');
    expect(call.customer).toBe('cus_new');
    expect(call.line_items).toEqual([{ price: 'price_starter_m', quantity: 1 }]);
    expect(call.client_reference_id).toBe('u1');
    expect(call.subscription_data).toEqual({ metadata: { userId: 'u1' } });
    expect(call.allow_promotion_codes).toBe(true);
    // Dynamic payment methods — payment_method_types must NOT be set.
    expect(call.payment_method_types).toBeUndefined();
  });

  it('reuses an existing Stripe customer on subsequent checkouts', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_existing' });
    stripeMock.checkout.sessions.create.mockResolvedValue({
      url: 'https://checkout.stripe.com/session_y',
    });

    const res = await POST(makeReq({ plan: 'starter', interval: 'month' }));
    expect(res.status).toBe(200);
    expect(stripeMock.customers.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    const call = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(call.customer).toBe('cus_existing');
  });

  it('returns 500 checkout_failed when Stripe throws or session has no URL', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_existing' });
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: null });
    const res = await POST(makeReq({ plan: 'starter', interval: 'month' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('checkout_failed');
  });
});

describe('POST /api/billing/checkout — already_subscribed guard', () => {
  it.each([['active'], ['trialing'], ['past_due']])(
    'returns 409 already_subscribed when an existing sub is in %s status',
    async status => {
      mockPrisma.subscription.findUnique.mockResolvedValue({ status });

      const res = await POST(makeReq({ plan: 'pro', interval: 'month' }));
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe('already_subscribed');
      expect(body.switchInPortal).toBe(true);
      // Refused before any Stripe call — this is the whole point.
      expect(stripeMock.customers.create).not.toHaveBeenCalled();
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    }
  );

  it.each([['canceled'], ['incomplete'], ['incomplete_expired'], ['unpaid']])(
    'allows re-subscribing when prior sub is %s (not in PAID_STATUSES)',
    async status => {
      mockPrisma.subscription.findUnique.mockResolvedValue({ status });
      mockPrisma.user.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_existing' });
      stripeMock.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/session_resub',
      });

      const res = await POST(makeReq({ plan: 'starter', interval: 'month' }));
      expect(res.status).toBe(200);
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalled();
    }
  );

  it('lets the original (no prior sub) path through unchanged', async () => {
    // Sanity check that the new guard didn't accidentally break first-time
    // subscribers — `findUnique` returning null is the common case.
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ stripeCustomerId: null });
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' });
    mockPrisma.user.update.mockResolvedValue({});
    stripeMock.checkout.sessions.create.mockResolvedValue({
      url: 'https://checkout.stripe.com/session_first',
    });

    const res = await POST(makeReq({ plan: 'starter', interval: 'month' }));
    expect(res.status).toBe(200);
    expect(stripeMock.customers.create).toHaveBeenCalled();
  });
});
