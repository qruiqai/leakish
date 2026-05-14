/**
 * @jest-environment node
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    apiKey: { updateMany: jest.fn(), findFirst: jest.fn() },
  },
}));

// Inject a controlled user + source into withDetectAuth.
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
import { DELETE } from '../[id]/route';

const mockPrisma = prisma as unknown as {
  apiKey: { updateMany: jest.Mock; findFirst: jest.Mock };
};

function makeReq() {
  return {} as Parameters<typeof DELETE>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  authState.source = 'session';
});

describe('DELETE /api/integration/keys/[id]', () => {
  it('returns 403 when authenticated via api-key (compromised key cannot revoke other keys)', async () => {
    authState.source = 'api-key';
    const res = await DELETE(makeReq(), { params: { id: 'k1' } });
    expect(res.status).toBe(403);
    expect(mockPrisma.apiKey.updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 when the key belongs to a different user (cross-user isolation)', async () => {
    mockPrisma.apiKey.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.apiKey.findFirst.mockResolvedValue(null); // not this user's key
    const res = await DELETE(makeReq(), { params: { id: 'k1' } });
    expect(res.status).toBe(404);
  });

  it('returns 200 idempotently when the key was already revoked', async () => {
    // updateMany matched 0 rows (the where clause filters revokedAt: null)
    mockPrisma.apiKey.updateMany.mockResolvedValue({ count: 0 });
    // but findFirst finds the already-revoked key owned by this user
    mockPrisma.apiKey.findFirst.mockResolvedValue({ id: 'k1' });
    const res = await DELETE(makeReq(), { params: { id: 'k1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ revoked: true });
  });

  it('returns 200 with {revoked:true} on successful revocation', async () => {
    mockPrisma.apiKey.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(makeReq(), { params: { id: 'k1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ revoked: true });
    // The where clause MUST filter by userId — verify the call.
    expect(mockPrisma.apiKey.updateMany).toHaveBeenCalledWith({
      where: { id: 'k1', userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
