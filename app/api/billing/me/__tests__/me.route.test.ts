/**
 * @jest-environment node
 */

const entitlementMock = jest.fn();
jest.mock('@/lib/billing/entitlement', () => ({
  getEntitlement: (...args: unknown[]) => entitlementMock(...args),
}));

jest.mock('@/lib/env', () => ({
  getServerEnv: jest.fn(),
}));

const authState = {
  user: { id: 'u1', email: 'u@x.com', name: null, image: null },
  source: 'session' as 'session' | 'api-key',
};
jest.mock('@/lib/api/auth', () => {
  const { getMessages } = jest.requireActual('@/lib/i18n/messages');
  return {
    withDetectAuth: jest.fn(async (req: unknown, handler: (ctx: unknown) => Promise<Response>) =>
      handler({ req, user: authState.user, source: authState.source, m: getMessages('en') })
    ),
  };
});

import { getServerEnv } from '@/lib/env';
import { GET } from '../route';

const envMock = getServerEnv as jest.Mock;

function makeReq() {
  return { headers: { get: () => null } } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/billing/me', () => {
  it('returns the entitlement + plan definitions + availability flags', async () => {
    envMock.mockReturnValue({
      STRIPE_PRICE_STARTER_MONTHLY: 'price_starter_m',
      STRIPE_PRICE_STARTER_YEARLY: 'price_starter_y',
      STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m',
      STRIPE_PRICE_PRO_YEARLY: 'price_pro_y',
    });
    entitlementMock.mockResolvedValue({
      plan: 'starter',
      interval: 'month',
      status: 'active',
      isPaid: true,
      scansUsed: 4,
      scansLimit: 10,
      retainCap: 100,
      periodStart: new Date('2026-05-01T00:00:00Z'),
      periodEnd: new Date('2026-06-01T00:00:00Z'),
    });

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe('starter');
    expect(body.interval).toBe('month');
    expect(body.scansUsed).toBe(4);
    expect(body.scansLimit).toBe(10);
    expect(body.retainCap).toBe(100);
    expect(body.isPaid).toBe(true);
    expect(body.periodEnd).toBe('2026-06-01T00:00:00.000Z');
    expect(body.availability).toEqual({
      starter: { month: true, year: true },
      pro: { month: true, year: true },
    });
    // Definitions come from the static plan table — sanity-check one entry.
    expect(body.definitions.starter).toEqual({ scanQuota: 10, retainCap: 100 });
  });

  it('reports an unavailable (plan, interval) cell when its env price is missing', async () => {
    // Pro yearly disabled — pricing UI should fall back to monthly.
    envMock.mockReturnValue({
      STRIPE_PRICE_STARTER_MONTHLY: 'price_starter_m',
      STRIPE_PRICE_STARTER_YEARLY: 'price_starter_y',
      STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m',
      STRIPE_PRICE_PRO_YEARLY: undefined,
    });
    entitlementMock.mockResolvedValue({
      plan: 'free',
      interval: null,
      status: 'none',
      isPaid: false,
      scansUsed: 0,
      scansLimit: 3,
      retainCap: 20,
      periodStart: new Date('2026-05-01T00:00:00Z'),
      periodEnd: new Date('2026-06-01T00:00:00Z'),
    });

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.availability.pro).toEqual({ month: true, year: false });
  });
});
