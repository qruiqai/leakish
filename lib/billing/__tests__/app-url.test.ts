/**
 * @jest-environment node
 */

jest.mock('@/lib/env', () => ({
  getServerEnv: jest.fn(),
}));

import { getServerEnv } from '@/lib/env';
import { getAppUrl } from '@/lib/billing/app-url';

const envMock = getServerEnv as jest.Mock;

describe('getAppUrl', () => {
  it('prefers NEXT_PUBLIC_APP_URL when both are set', () => {
    envMock.mockReturnValue({
      NEXT_PUBLIC_APP_URL: 'https://leakish.com',
      NEXTAUTH_URL: 'https://leakish.com/auth',
    });
    expect(getAppUrl()).toBe('https://leakish.com');
  });

  it('falls back to NEXTAUTH_URL when NEXT_PUBLIC_APP_URL is undefined', () => {
    envMock.mockReturnValue({
      NEXT_PUBLIC_APP_URL: undefined,
      NEXTAUTH_URL: 'https://leakish.com/auth',
    });
    expect(getAppUrl()).toBe('https://leakish.com/auth');
  });

  it('returns null when neither is set', () => {
    envMock.mockReturnValue({});
    expect(getAppUrl()).toBeNull();
  });

  it('strips trailing slashes (single and repeated)', () => {
    envMock.mockReturnValue({ NEXT_PUBLIC_APP_URL: 'https://leakish.com/' });
    expect(getAppUrl()).toBe('https://leakish.com');
    envMock.mockReturnValue({ NEXT_PUBLIC_APP_URL: 'https://leakish.com////' });
    expect(getAppUrl()).toBe('https://leakish.com');
  });
});
