/**
 * @jest-environment node
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    subscription: { findUnique: jest.fn() },
  },
}));

const applyChangeMock = jest.fn();
const cancelPendingChangeMock = jest.fn();
jest.mock('@/lib/billing/change-plan', () => ({
  applyChange: (...args: unknown[]) => applyChangeMock(...args),
  cancelPendingChange: (...args: unknown[]) => cancelPendingChangeMock(...args),
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
import { POST, DELETE } from '../route';

const mockPrisma = prisma as unknown as {
  subscription: { findUnique: jest.Mock };
};

function makeReq(body: unknown) {
  return {
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

function makeReqEmpty() {
  return { headers: { get: () => null } } as unknown as Parameters<typeof DELETE>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  authState.source = 'session';
  // Default: user is on Starter monthly — overridable per test.
  mockPrisma.subscription.findUnique.mockResolvedValue({
    plan: 'starter',
    interval: 'month',
    status: 'active',
    stripeSubscriptionId: 'sub_1',
  });
});

describe('POST /api/billing/change-plan', () => {
  it('rejects API-key auth', async () => {
    authState.source = 'api-key';
    const res = await POST(makeReq({ plan: 'pro', interval: 'month' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('api_key_cannot_subscribe');
    expect(applyChangeMock).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON body', async () => {
    const req = {
      headers: { get: () => null },
      json: async () => {
        throw new SyntaxError('not json');
      },
    } as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_json');
  });

  it('rejects a payload that fails schema validation', async () => {
    const res = await POST(makeReq({ plan: 'free', interval: 'forever' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_payload');
  });

  it('rejects 400 when the user is not on a paid subscription', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ plan: 'pro', interval: 'month' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('not_subscribed');
  });

  it.each([['canceled'], ['incomplete'], ['unpaid']])(
    'rejects 400 when prior sub is %s (not in PAID_STATUSES)',
    async status => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        plan: 'starter',
        interval: 'month',
        status,
        stripeSubscriptionId: 'sub_1',
      });
      const res = await POST(makeReq({ plan: 'pro', interval: 'month' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('not_subscribed');
    }
  );

  it('calls applyChange and returns mode + effectiveAt on a downgrade', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      plan: 'pro',
      interval: 'month',
      status: 'active',
      stripeSubscriptionId: 'sub_1',
    });
    const effectiveAt = new Date('2026-06-13T15:12:06.000Z');
    applyChangeMock.mockResolvedValue({ mode: 'downgrade-scheduled', effectiveAt });

    const res = await POST(makeReq({ plan: 'starter', interval: 'month' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('downgrade-scheduled');
    expect(body.effectiveAt).toBe(effectiveAt.toISOString());
    expect(applyChangeMock).toHaveBeenCalledWith({
      userId: 'u1',
      stripeSubscriptionId: 'sub_1',
      currentPlan: 'pro',
      currentInterval: 'month',
      targetPlan: 'starter',
      targetInterval: 'month',
    });
  });

  it('returns mode=upgrade-immediate with effectiveAt=null on an upgrade', async () => {
    applyChangeMock.mockResolvedValue({ mode: 'upgrade-immediate' });
    const res = await POST(makeReq({ plan: 'pro', interval: 'month' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('upgrade-immediate');
    expect(body.effectiveAt).toBeNull();
  });

  it('surfaces a 500 change_failed when applyChange throws', async () => {
    applyChangeMock.mockRejectedValue(new Error('stripe boom'));
    const res = await POST(makeReq({ plan: 'pro', interval: 'month' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('change_failed');
  });
});

describe('DELETE /api/billing/change-plan', () => {
  it('rejects API-key auth', async () => {
    authState.source = 'api-key';
    const res = await DELETE(makeReqEmpty());
    expect(res.status).toBe(403);
    expect(cancelPendingChangeMock).not.toHaveBeenCalled();
  });

  it('rejects when user has no active subscription', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeReqEmpty());
    expect(res.status).toBe(400);
  });

  it('returns released:true when a schedule was canceled', async () => {
    cancelPendingChangeMock.mockResolvedValue(true);
    const res = await DELETE(makeReqEmpty());
    expect(res.status).toBe(200);
    expect((await res.json()).released).toBe(true);
    expect(cancelPendingChangeMock).toHaveBeenCalledWith('sub_1');
  });

  it('returns released:false when nothing was pending (idempotent)', async () => {
    cancelPendingChangeMock.mockResolvedValue(false);
    const res = await DELETE(makeReqEmpty());
    expect(res.status).toBe(200);
    expect((await res.json()).released).toBe(false);
  });

  it('surfaces a 500 change_failed when release throws', async () => {
    cancelPendingChangeMock.mockRejectedValue(new Error('stripe boom'));
    const res = await DELETE(makeReqEmpty());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('change_failed');
  });
});
