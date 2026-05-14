/**
 * @jest-environment node
 *
 * Covers `GET /api/detect/scans` — cursor pagination + clampInt bounds.
 * The POST handler (save + quota) is exercised in quota.route.test.ts.
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    detectScan: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  },
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
import { GET } from '../route';

const mockPrisma = prisma as unknown as {
  detectScan: { findFirst: jest.Mock; findMany: jest.Mock };
};

function makeReq(query: string = '') {
  return {
    nextUrl: { searchParams: new URLSearchParams(query) },
  } as unknown as Parameters<typeof GET>[0];
}

function row(id: string, createdAt: Date = new Date('2026-05-01T00:00:00Z')) {
  return { id, createdAt };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/detect/scans — basic listing', () => {
  it('returns empty list + null nextCursor when user has no scans', async () => {
    mockPrisma.detectScan.findMany.mockResolvedValue([]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scans).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it('scopes the query to the authenticated user', async () => {
    mockPrisma.detectScan.findMany.mockResolvedValue([]);
    await GET(makeReq());
    const call = mockPrisma.detectScan.findMany.mock.calls[0][0];
    expect(call.where.userId).toBe('u1');
  });

  it('orders results createdAt desc then id desc (stable under ties)', async () => {
    mockPrisma.detectScan.findMany.mockResolvedValue([]);
    await GET(makeReq());
    const call = mockPrisma.detectScan.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });
});

describe('GET /api/detect/scans — limit clamping', () => {
  it('defaults limit to 50 when not provided', async () => {
    mockPrisma.detectScan.findMany.mockResolvedValue([]);
    await GET(makeReq());
    expect(mockPrisma.detectScan.findMany.mock.calls[0][0].take).toBe(50);
  });

  it('respects an explicit valid limit', async () => {
    mockPrisma.detectScan.findMany.mockResolvedValue([]);
    await GET(makeReq('limit=10'));
    expect(mockPrisma.detectScan.findMany.mock.calls[0][0].take).toBe(10);
  });

  it('caps limit at 100 (max)', async () => {
    mockPrisma.detectScan.findMany.mockResolvedValue([]);
    await GET(makeReq('limit=999'));
    expect(mockPrisma.detectScan.findMany.mock.calls[0][0].take).toBe(100);
  });

  it.each(['abc', '0', '-5', ''])(
    'falls back to default 50 when limit is invalid (%s)',
    async raw => {
      mockPrisma.detectScan.findMany.mockResolvedValue([]);
      await GET(makeReq(`limit=${raw}`));
      expect(mockPrisma.detectScan.findMany.mock.calls[0][0].take).toBe(50);
    }
  );
});

describe('GET /api/detect/scans — cursor pagination', () => {
  it('returns null nextCursor when the page has fewer rows than the limit', async () => {
    mockPrisma.detectScan.findMany.mockResolvedValue([row('s1'), row('s2')]);
    const res = await GET(makeReq('limit=10'));
    const body = await res.json();
    expect(body.nextCursor).toBeNull();
  });

  it('returns the last row id as nextCursor when the page is exactly the limit', async () => {
    mockPrisma.detectScan.findMany.mockResolvedValue([
      row('s1'),
      row('s2'),
      row('s3'),
    ]);
    const res = await GET(makeReq('limit=3'));
    const body = await res.json();
    expect(body.nextCursor).toBe('s3');
  });

  it('applies a stable (createdAt, id) cursor when `before` resolves to a real scan', async () => {
    const anchorAt = new Date('2026-05-01T00:00:00Z');
    mockPrisma.detectScan.findFirst.mockResolvedValue({ id: 's-anchor', createdAt: anchorAt });
    mockPrisma.detectScan.findMany.mockResolvedValue([]);

    await GET(makeReq('before=s-anchor'));

    expect(mockPrisma.detectScan.findFirst).toHaveBeenCalledWith({
      where: { id: 's-anchor', userId: 'u1' },
      select: { id: true, createdAt: true },
    });
    const call = mockPrisma.detectScan.findMany.mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { createdAt: { lt: anchorAt } },
      { createdAt: anchorAt, id: { lt: 's-anchor' } },
    ]);
  });

  it('silently returns the newest page when `before` does not resolve (bad id)', async () => {
    mockPrisma.detectScan.findFirst.mockResolvedValue(null);
    mockPrisma.detectScan.findMany.mockResolvedValue([]);

    await GET(makeReq('before=does-not-exist'));

    const call = mockPrisma.detectScan.findMany.mock.calls[0][0];
    // No cursor filter — just the user scope.
    expect(call.where).toEqual({ userId: 'u1' });
  });

  it('refuses to leak: `before` from another user is not honored', async () => {
    // findFirst scopes by userId — a foreign id returns null, so we fall
    // through to the newest page (same as bad id). The mock here proves the
    // call shape includes our user filter.
    mockPrisma.detectScan.findFirst.mockResolvedValue(null);
    mockPrisma.detectScan.findMany.mockResolvedValue([]);

    await GET(makeReq('before=s-foreign'));

    expect(mockPrisma.detectScan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's-foreign', userId: 'u1' },
      })
    );
  });

  it('does NOT call findFirst when `before` is absent', async () => {
    mockPrisma.detectScan.findMany.mockResolvedValue([]);
    await GET(makeReq());
    expect(mockPrisma.detectScan.findFirst).not.toHaveBeenCalled();
  });
});
