/**
 * @jest-environment node
 */

const envMock = jest.fn();
jest.mock('@/lib/env', () => ({
  getServerEnv: () => envMock(),
}));

describe('getStripe', () => {
  beforeEach(() => {
    jest.resetModules();
    envMock.mockReset();
  });

  it('throws a friendly error when STRIPE_SECRET_KEY is missing', () => {
    envMock.mockReturnValue({ STRIPE_SECRET_KEY: undefined });
    // Re-require so the module-level cache is fresh per test.
    const { getStripe } = require('@/lib/server/stripe');
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY is not configured/);
  });

  it('returns a Stripe instance when the key is present', () => {
    envMock.mockReturnValue({ STRIPE_SECRET_KEY: 'sk_test_dummy' });
    const { getStripe } = require('@/lib/server/stripe');
    const client = getStripe();
    expect(client).toBeDefined();
    // The SDK exposes a `subscriptions` namespace; this is a contract our
    // webhook + reconcile rely on, so we sanity-check it surfaces.
    expect(typeof client.subscriptions.retrieve).toBe('function');
  });

  it('caches the client across calls', () => {
    envMock.mockReturnValue({ STRIPE_SECRET_KEY: 'sk_test_dummy' });
    const { getStripe } = require('@/lib/server/stripe');
    expect(getStripe()).toBe(getStripe());
  });
});
