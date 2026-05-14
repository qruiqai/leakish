/**
 * @jest-environment node
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    apiKey: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue(undefined) },
    session: { create: jest.fn() },
  },
}));
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/env', () => ({
  getServerEnv: () => ({ NEXTAUTH_URL: 'https://app.example.com' }),
}));
jest.mock('@/lib/server/rate-limit', () => ({
  // Always-allow limiter for the happy path. Individual tests can override.
  apiKeyLoginLimiter: {
    consume: jest.fn(() => ({ allowed: true, remaining: 9, retryAfterSec: 0 })),
  },
}));

import prisma from '@/lib/prisma';
import { apiKeyLoginLimiter } from '@/lib/server/rate-limit';
import { POST } from '../api-key-login/route';

const mockPrisma = prisma as unknown as {
  apiKey: { findUnique: jest.Mock };
  session: { create: jest.Mock };
};
const mockLimiter = apiKeyLoginLimiter as unknown as { consume: jest.Mock };

/** Minimal NextRequest-shape for this route — reads headers.get, json(), nextUrl.protocol. */
function makeReq(opts: { headers?: Record<string, string>; body?: unknown; protocol?: string }) {
  const headers = opts.headers ?? {};
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    nextUrl: { protocol: opts.protocol ?? 'https:' },
    json: async () => {
      if (opts.body === undefined) throw new Error('no body');
      return opts.body;
    },
  } as Parameters<typeof POST>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLimiter.consume.mockReturnValue({ allowed: true, remaining: 9, retryAfterSec: 0 });
});

describe('POST /api/auth/api-key-login', () => {
  it('returns 403 when Origin does not match NEXTAUTH_URL', async () => {
    const res = await POST(
      makeReq({
        headers: { origin: 'https://evil.com', 'content-type': 'application/json' },
        body: { apiKey: 'det_xxx' },
      })
    );
    expect(res.status).toBe(403);
  });

  it('allows request with no Origin header (CLI tools)', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ body: { apiKey: 'det_nomatch' } }));
    // 401 because no matching key — but we got past the Origin check.
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limit is exhausted', async () => {
    mockLimiter.consume.mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSec: 42,
    });
    const res = await POST(makeReq({ body: { apiKey: 'det_xxx' } }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('42');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await POST(makeReq({})); // no body triggers json() throw
    expect(res.status).toBe(400);
  });

  it('returns 400 when apiKey field is missing', async () => {
    const res = await POST(makeReq({ body: {} }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when token does not start with det_', async () => {
    const res = await POST(makeReq({ body: { apiKey: 'jwt.abc.def' } }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the key is revoked', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'k1',
      revokedAt: new Date(),
      expiresAt: null,
      userId: 'u1',
      user: { id: 'u1', email: 'u@x.com' },
    });
    const res = await POST(makeReq({ body: { apiKey: 'det_xxxxxxxx' } }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the key is expired', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'k1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      userId: 'u1',
      user: { id: 'u1', email: 'u@x.com' },
    });
    const res = await POST(makeReq({ body: { apiKey: 'det_xxxxxxxx' } }));
    expect(res.status).toBe(401);
  });

  it('returns 500 when session.create fails', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'k1',
      revokedAt: null,
      expiresAt: null,
      userId: 'u1',
      user: { id: 'u1', email: 'u@x.com' },
    });
    mockPrisma.session.create.mockRejectedValue(new Error('db down'));
    const res = await POST(makeReq({ body: { apiKey: 'det_xxxxxxxx' } }));
    expect(res.status).toBe(500);
  });

  it('sets the __Secure- cookie name over HTTPS', async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'k1',
      revokedAt: null,
      expiresAt: null,
      userId: 'u1',
      user: { id: 'u1', email: 'u@x.com' },
    });
    mockPrisma.session.create.mockResolvedValue({ sessionToken: 'tok' });
    const res = await POST(makeReq({ body: { apiKey: 'det_xxxxxxxx' }, protocol: 'https:' }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/__Secure-next-auth\.session-token/);
  });
});
