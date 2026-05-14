/**
 * @jest-environment node
 */
import type { NextRequest } from 'next/server';

import { withDetectAuth } from '../auth';

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    apiKey: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue(undefined) },
    user: { findUnique: jest.fn() },
  },
}));
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/app/api/auth/[...nextauth]/options', () => ({ authOptions: {} }));

// Pull the mocks in typed form.
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';

const mockPrisma = prisma as unknown as {
  apiKey: { findUnique: jest.Mock; update: jest.Mock };
  user: { findUnique: jest.Mock };
};
const mockGetServerSession = getServerSession as unknown as jest.Mock;

/**
 * Construct a minimal NextRequest-like object. withDetectAuth only reads
 * `headers.get('authorization')` from it.
 */
function makeReq(headers: Record<string, string> = {}): NextRequest {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as NextRequest;
}

// Typed as 1-arg so `handler.mock.calls[i][0]` type-checks on TS strict.
const handler: jest.Mock<Promise<Response>, [unknown]> = jest.fn(
  async (_ctx: unknown) => new Response(JSON.stringify({ ok: true }), { status: 200 })
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('withDetectAuth — Bearer API key path', () => {
  it('returns 401 when the API key is not found', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue(null);
    const res = await withDetectAuth(
      makeReq({ authorization: 'Bearer det_deadbeefdeadbeef' }),
      handler
    );
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when the API key is revoked', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'k1',
      revokedAt: new Date(),
      expiresAt: null,
      user: { id: 'u1', email: 'u@x.com', name: null, image: null },
    });
    const res = await withDetectAuth(
      makeReq({ authorization: 'Bearer det_xxxxxxxxxxxxxxxx' }),
      handler
    );
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when the API key is expired', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'k1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      user: { id: 'u1', email: 'u@x.com', name: null, image: null },
    });
    const res = await withDetectAuth(
      makeReq({ authorization: 'Bearer det_xxxxxxxxxxxxxxxx' }),
      handler
    );
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when the API key user has no email', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'k1',
      revokedAt: null,
      expiresAt: null,
      user: { id: 'u1', email: null, name: null, image: null },
    });
    const res = await withDetectAuth(
      makeReq({ authorization: 'Bearer det_xxxxxxxxxxxxxxxx' }),
      handler
    );
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls the handler with source=api-key for a valid Bearer token', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'k1',
      revokedAt: null,
      expiresAt: null,
      user: { id: 'u1', email: 'u@x.com', name: 'U', image: null },
    });
    await withDetectAuth(makeReq({ authorization: 'Bearer det_xxxxxxxxxxxxxxxx' }), handler);
    expect(handler).toHaveBeenCalledTimes(1);
    const arg = handler.mock.calls[0][0] as {
      source: 'session' | 'api-key';
      user: { id: string; email: string };
    };
    expect(arg.source).toBe('api-key');
    expect(arg.user.id).toBe('u1');
    expect(arg.user.email).toBe('u@x.com');
  });
});

describe('withDetectAuth — session cookie path', () => {
  it('returns 401 when no Bearer token and no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await withDetectAuth(makeReq(), handler);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when the session user cannot be found in DB', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'u1', email: 'u@x.com' } });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await withDetectAuth(makeReq(), handler);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when the session user has no email on file', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'u1', email: 'u@x.com' } });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: null,
      name: null,
      image: null,
    });
    const res = await withDetectAuth(makeReq(), handler);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls the handler with source=session for a valid session', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'u1', email: 'u@x.com' } });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'u@x.com',
      name: 'U',
      image: null,
    });
    await withDetectAuth(makeReq(), handler);
    expect(handler).toHaveBeenCalledTimes(1);
    const arg = handler.mock.calls[0][0] as {
      source: 'session' | 'api-key';
      user: { id: string };
    };
    expect(arg.source).toBe('session');
    expect(arg.user.id).toBe('u1');
  });
});
