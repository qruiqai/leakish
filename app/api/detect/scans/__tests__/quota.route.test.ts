/**
 * @jest-environment node
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    detectScan: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    subscription: { updateMany: jest.fn() },
  },
}));

const entitlementMock: jest.Mock = jest.fn();
const consumeMock: jest.Mock = jest.fn();
const refundMock: jest.Mock = jest.fn(async () => undefined);
jest.mock('@/lib/billing/entitlement', () => ({
  getEntitlement: (...args: unknown[]) => entitlementMock(...args),
  consumeScanQuota: (...args: unknown[]) => consumeMock(...args),
  refundScanQuota: (...args: unknown[]) => refundMock(...args),
}));

jest.mock('@/lib/server/network-probe', () => ({
  probeNetwork: jest.fn(async () => ({
    ip: '1.2.3.4',
    ipFamily: 'ipv4',
    country: 'US',
    region: null,
    city: null,
    asn: null,
    asOrg: null,
    isVpn: null,
    isProxy: null,
    isTor: null,
    isHosting: null,
    tlsJa3: null,
    tlsJa4: null,
    serverUserAgent: null,
    acceptLanguage: null,
    acceptEncoding: null,
  })),
}));

jest.mock('@/lib/server/rate-limit', () => ({
  saveScanLimiter: { consume: jest.fn(() => ({ allowed: true, remaining: 10, retryAfterSec: 0 })) },
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

import prisma from '@/lib/prisma';
import { POST } from '../route';

const mockPrisma = prisma as unknown as {
  detectScan: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
  subscription: { updateMany: jest.Mock };
};

function makeReq(body: Record<string, unknown>) {
  return {
    headers: { get: (_h: string) => null },
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

const validBody = {
  assessment: {
    score: 80,
    level: 'safe',
    counts: { critical: 0, warning: 0, safe: 1 },
    untestedModuleIds: [],
    perModule: [],
  },
  fingerprints: {},
  moduleSnapshot: {},
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.detectScan.findUnique.mockResolvedValue(null);
  mockPrisma.detectScan.findMany.mockResolvedValue([]);
});

describe('POST /api/detect/scans quota gate', () => {
  it('returns 402 quota_exceeded for a Free user past the limit', async () => {
    consumeMock.mockResolvedValue({
      ok: false,
      entitlement: {
        plan: 'free',
        interval: null,
        status: 'none',
        scansUsed: 3,
        scansLimit: 3,
        retainCap: 20,
        periodStart: new Date(),
        periodEnd: new Date('2099-01-01'),
        isPaid: false,
      },
    });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe('quota_exceeded');
    expect(body.plan).toBe('free');
    expect(body.limit).toBe(3);
    expect(body.upgradeUrl).toBe('/pricing');
    expect(mockPrisma.detectScan.create).not.toHaveBeenCalled();
  });

  it('returns 402 for a paid user past the cycle limit', async () => {
    consumeMock.mockResolvedValue({
      ok: false,
      entitlement: {
        plan: 'starter',
        interval: 'month',
        status: 'active',
        scansUsed: 10,
        scansLimit: 10,
        retainCap: 100,
        periodStart: new Date(),
        periodEnd: new Date('2099-01-01'),
        isPaid: true,
      },
    });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.plan).toBe('starter');
    expect(body.limit).toBe(10);
  });

  it('refunds the quota when DetectScan.create fails for a paid user', async () => {
    consumeMock.mockResolvedValue({
      ok: true,
      entitlement: {
        plan: 'starter',
        interval: 'month',
        status: 'active',
        scansUsed: 6,
        scansLimit: 10,
        retainCap: 100,
        periodStart: new Date(),
        periodEnd: new Date(),
        isPaid: true,
      },
    });
    mockPrisma.detectScan.create.mockRejectedValue(new Error('db down'));

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
    expect(refundMock).toHaveBeenCalledWith('u1');
  });

  it('refunds the quota when the idempotency P2002 catch hits a paid user', async () => {
    consumeMock.mockResolvedValue({
      ok: true,
      entitlement: {
        plan: 'starter',
        interval: 'month',
        status: 'active',
        scansUsed: 6,
        scansLimit: 10,
        retainCap: 100,
        periodStart: new Date(),
        periodEnd: new Date(),
        isPaid: true,
      },
    });
    mockPrisma.detectScan.create.mockRejectedValue(
      Object.assign(new Error('P2002'), { code: 'P2002' })
    );
    mockPrisma.detectScan.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 's-existing' });

    const req = {
      headers: { get: (h: string) => (h === 'idempotency-key' ? 'k1' : null) },
      json: async () => validBody,
    } as unknown as Parameters<typeof POST>[0];

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.idempotent).toBe(true);
    expect(refundMock).toHaveBeenCalledWith('u1');
  });

  it('does NOT refund for a Free user (no counter to roll back)', async () => {
    consumeMock.mockResolvedValue({
      ok: true,
      entitlement: {
        plan: 'free',
        interval: null,
        status: 'none',
        scansUsed: 0,
        scansLimit: 3,
        retainCap: 20,
        periodStart: new Date(),
        periodEnd: new Date(),
        isPaid: false,
      },
    });
    mockPrisma.detectScan.create.mockRejectedValue(new Error('db down'));

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
    expect(refundMock).not.toHaveBeenCalled();
  });

  // Regression: consumeScanQuota used to run BEFORE body parse / Zod
  // validation, so paid users sending malformed JSON or an invalid payload
  // burned a slot per request. These two tests pin the new ordering —
  // validation first, quota second.
  it('does NOT consume quota when the request body is malformed JSON', async () => {
    const req = {
      headers: { get: (_h: string) => null },
      json: async () => {
        throw new SyntaxError('invalid json');
      },
    } as unknown as Parameters<typeof POST>[0];

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
    expect(consumeMock).not.toHaveBeenCalled();
    expect(refundMock).not.toHaveBeenCalled();
  });

  it('does NOT consume quota when the payload fails Zod validation', async () => {
    // Missing required `assessment` / `fingerprints` / `moduleSnapshot`.
    const res = await POST(makeReq({ name: 'broken' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_payload');
    expect(consumeMock).not.toHaveBeenCalled();
    expect(refundMock).not.toHaveBeenCalled();
  });

  it('threads retainCap into the prune query', async () => {
    consumeMock.mockResolvedValue({
      ok: true,
      entitlement: {
        plan: 'pro',
        interval: 'month',
        status: 'active',
        scansUsed: 0,
        scansLimit: 200,
        retainCap: 500,
        periodStart: new Date(),
        periodEnd: new Date(),
        isPaid: true,
      },
    });
    mockPrisma.detectScan.create.mockResolvedValue({ id: 's1' });
    mockPrisma.detectScan.findMany.mockResolvedValue([{ createdAt: new Date('2020-01-01') }]);
    mockPrisma.detectScan.deleteMany.mockResolvedValue({ count: 0 });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(201);
    // pruneOldScansFor runs async and may not finish before response; wait a tick.
    await new Promise(r => setImmediate(r));
    expect(mockPrisma.detectScan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 500 })
    );
  });
});
