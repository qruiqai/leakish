/**
 * @jest-environment node
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    detectScan: { findFirst: jest.fn(), deleteMany: jest.fn() },
  },
}));

const authState = {
  user: { id: 'u1', email: 'u@x.com', name: null, image: null },
  source: 'session' as 'session' | 'api-key',
};
jest.mock('@/lib/api/auth', () => {
  const { getMessages } = jest.requireActual('@/lib/i18n/messages');
  return {
    withDetectAuth: jest.fn(async (_req: unknown, handler: (ctx: unknown) => Promise<Response>) =>
      handler({
        req: _req,
        user: authState.user,
        source: authState.source,
        m: getMessages('en'),
      })
    ),
  };
});

import prisma from '@/lib/prisma';
import { DELETE, GET } from '../[id]/route';

const mockPrisma = prisma as unknown as {
  detectScan: { findFirst: jest.Mock; deleteMany: jest.Mock };
};

function makeReq() {
  return {} as Parameters<typeof GET>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/detect/scans/[id] — cross-user isolation', () => {
  it('returns 404 when the scan belongs to another user', async () => {
    // The route filters on { id, userId } so findFirst returns null even if
    // a scan with that id exists under a different userId.
    mockPrisma.detectScan.findFirst.mockResolvedValue(null);
    const res = await GET(makeReq(), { params: { id: 'scan-of-u2' } });
    expect(res.status).toBe(404);
    // Verify the where clause includes the caller's userId.
    expect(mockPrisma.detectScan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'scan-of-u2', userId: 'u1' },
      })
    );
  });

  it('returns the scan when owned by the caller', async () => {
    const scan = {
      id: 's1',
      createdAt: new Date(),
      score: 80,
      level: 'safe',
      ipCountry: 'US',
      ipRegion: null,
      ipCity: null,
      ipAsn: null,
      ipIsVpn: null,
      tlsJa3: null,
      tlsJa4: null,
      serverUserAgent: null,
      acceptLanguage: null,
      payload: { assessment: {} },
    };
    mockPrisma.detectScan.findFirst.mockResolvedValue(scan);
    const res = await GET(makeReq(), { params: { id: 's1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('s1');
  });
});

describe('DELETE /api/detect/scans/[id] — cross-user isolation', () => {
  it('returns 404 when the scan belongs to another user (count=0)', async () => {
    mockPrisma.detectScan.deleteMany.mockResolvedValue({ count: 0 });
    const res = await DELETE(makeReq(), { params: { id: 'scan-of-u2' } });
    expect(res.status).toBe(404);
    expect(mockPrisma.detectScan.deleteMany).toHaveBeenCalledWith({
      where: { id: 'scan-of-u2', userId: 'u1' },
    });
  });

  it('returns 200 with {deleted:true} when the scan is owned by the caller', async () => {
    mockPrisma.detectScan.deleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(makeReq(), { params: { id: 's1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ deleted: true });
  });
});
