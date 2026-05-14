/**
 * @jest-environment node
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { user: { findUnique: jest.fn() } },
}));

jest.mock('@/lib/server/stripe', () => {
  const singleton = {
    billingPortal: { sessions: { create: jest.fn() } },
  };
  return { getStripe: () => singleton };
});

const appUrlMock = jest.fn();
jest.mock('@/lib/billing/app-url', () => ({
  getAppUrl: () => appUrlMock(),
}));

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
import { POST } from '../route';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
};
const stripeMock = getStripe() as unknown as {
  billingPortal: { sessions: { create: jest.Mock } };
};

function makeReq() {
  return { headers: { get: () => null } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  authState.source = 'session';
  appUrlMock.mockReturnValue('https://leakish.com');
});

describe('POST /api/billing/portal', () => {
  it('rejects API-key auth — portal requires a browser session', async () => {
    authState.source = 'api-key';
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('api_key_cannot_subscribe');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 400 not_subscribed when user has no stripeCustomerId', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ stripeCustomerId: null });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('not_subscribed');
    expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('returns 500 not_configured when no app URL is set', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    appUrlMock.mockReturnValue(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('not_configured');
  });

  it('returns the Stripe portal URL on the happy path', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    stripeMock.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.com/session_xyz',
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://billing.stripe.com/session_xyz');
    expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://leakish.com/account/billing',
    });
  });

  it('returns 500 portal_failed when Stripe throws', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' });
    stripeMock.billingPortal.sessions.create.mockRejectedValue(new Error('stripe down'));

    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('portal_failed');
  });
});
