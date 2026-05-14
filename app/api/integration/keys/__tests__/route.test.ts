/**
 * @jest-environment node
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    apiKey: { count: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  },
}));
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/server/rate-limit', () => ({
  keyCreateLimiter: {
    consume: jest.fn(() => ({ allowed: true, remaining: 9, retryAfterSec: 0 })),
  },
}));
jest.mock('@/lib/server/api-key', () => ({
  generateApiKey: () => ({
    token: 'det_' + 'a'.repeat(64),
    hash: 'h'.repeat(64),
    prefix: 'det_aaaa…aaaa',
  }),
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
import { keyCreateLimiter } from '@/lib/server/rate-limit';
import { POST } from '../route';

const mockPrisma = prisma as unknown as {
  apiKey: { count: jest.Mock; create: jest.Mock; findMany: jest.Mock };
};
const mockLimiter = keyCreateLimiter as unknown as { consume: jest.Mock };

function makeReq(body: unknown) {
  return {
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  authState.source = 'session';
  mockLimiter.consume.mockReturnValue({ allowed: true, remaining: 9, retryAfterSec: 0 });
});

describe('POST /api/integration/keys — security guards', () => {
  it('returns 403 when authenticated via api-key (privilege-escalation prevention)', async () => {
    authState.source = 'api-key';
    const res = await POST(makeReq({ name: 'test' }));
    expect(res.status).toBe(403);
    expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
  });

  it('returns 429 when key-create rate limit is exhausted', async () => {
    mockLimiter.consume.mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSec: 300,
    });
    const res = await POST(makeReq({ name: 'test' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('300');
    expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when name exceeds 60 chars', async () => {
    const res = await POST(makeReq({ name: 'x'.repeat(61) }));
    expect(res.status).toBe(400);
  });

  it('returns 409 when the active-key cap is reached', async () => {
    mockPrisma.apiKey.count.mockResolvedValue(20);
    const res = await POST(makeReq({ name: 'test' }));
    expect(res.status).toBe(409);
    expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
  });

  it('returns 201 with plaintext token on success (hash never exposed)', async () => {
    mockPrisma.apiKey.count.mockResolvedValue(5);
    mockPrisma.apiKey.create.mockResolvedValue({
      id: 'k1',
      name: 'test',
      prefix: 'det_aaaa…aaaa',
      createdAt: new Date(),
      expiresAt: null,
    });
    const res = await POST(makeReq({ name: 'test' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toMatch(/^det_/);
    expect(body).not.toHaveProperty('hash');
  });

  it('returns 500 when prisma.apiKey.create throws', async () => {
    mockPrisma.apiKey.count.mockResolvedValue(5);
    mockPrisma.apiKey.create.mockRejectedValue(new Error('db fail'));
    const res = await POST(makeReq({ name: 'test' }));
    expect(res.status).toBe(500);
  });
});
