/**
 * @jest-environment node
 */

jest.mock('@/lib/env', () => ({
  getServerEnv: jest.fn(() => ({
    STRIPE_PRICE_STARTER_MONTHLY: 'price_starter_m',
    STRIPE_PRICE_STARTER_YEARLY: 'price_starter_y',
    STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m',
    STRIPE_PRICE_PRO_YEARLY: 'price_pro_y',
  })),
}));

import { getServerEnv } from '@/lib/env';
import { getPlanByPriceId, normalizeInterval, PLAN_DEFS, priceIdFor } from '@/lib/billing/plans';

const mockEnv = getServerEnv as jest.Mock;

beforeEach(() => {
  mockEnv.mockReturnValue({
    STRIPE_PRICE_STARTER_MONTHLY: 'price_starter_m',
    STRIPE_PRICE_STARTER_YEARLY: 'price_starter_y',
    STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m',
    STRIPE_PRICE_PRO_YEARLY: 'price_pro_y',
  });
});

describe('plan definitions match the pricing matrix', () => {
  it('Free is 3 saves / 20 retained, no listed price', () => {
    expect(PLAN_DEFS.free.scanQuota).toBe(3);
    expect(PLAN_DEFS.free.retainCap).toBe(20);
    expect(PLAN_DEFS.free.monthlyUsd).toBeUndefined();
    expect(PLAN_DEFS.free.yearlyUsd).toBeUndefined();
  });
  it('Starter is 10 saves / 100 retained, $9.90 / $95', () => {
    expect(PLAN_DEFS.starter.scanQuota).toBe(10);
    expect(PLAN_DEFS.starter.retainCap).toBe(100);
    expect(PLAN_DEFS.starter.monthlyUsd).toBe(9.9);
    expect(PLAN_DEFS.starter.yearlyUsd).toBe(95);
  });
  it('Pro is 200 saves / 500 retained, $99 / $950', () => {
    expect(PLAN_DEFS.pro.scanQuota).toBe(200);
    expect(PLAN_DEFS.pro.retainCap).toBe(500);
    expect(PLAN_DEFS.pro.monthlyUsd).toBe(99);
    expect(PLAN_DEFS.pro.yearlyUsd).toBe(950);
  });
  it('yearly pricing is within 8% of monthly × 12 × 0.8 (20% off)', () => {
    const target = (m: number) => m * 12 * 0.8;
    expect(Math.abs(PLAN_DEFS.starter.yearlyUsd! - target(9.9))).toBeLessThan(0.5);
    expect(Math.abs(PLAN_DEFS.pro.yearlyUsd! - target(99))).toBeLessThan(0.5);
  });
});

describe('priceIdFor', () => {
  it('returns configured ids', () => {
    expect(priceIdFor('starter', 'month')).toBe('price_starter_m');
    expect(priceIdFor('starter', 'year')).toBe('price_starter_y');
    expect(priceIdFor('pro', 'month')).toBe('price_pro_m');
    expect(priceIdFor('pro', 'year')).toBe('price_pro_y');
  });
  it('returns undefined when env is missing', () => {
    mockEnv.mockReturnValue({
      STRIPE_PRICE_STARTER_MONTHLY: undefined,
      STRIPE_PRICE_STARTER_YEARLY: undefined,
      STRIPE_PRICE_PRO_MONTHLY: undefined,
      STRIPE_PRICE_PRO_YEARLY: undefined,
    });
    expect(priceIdFor('starter', 'month')).toBeUndefined();
    expect(priceIdFor('pro', 'year')).toBeUndefined();
  });
});

describe('getPlanByPriceId', () => {
  it('reverses each known price id', () => {
    expect(getPlanByPriceId('price_starter_m')).toEqual({ plan: 'starter', interval: 'month' });
    expect(getPlanByPriceId('price_starter_y')).toEqual({ plan: 'starter', interval: 'year' });
    expect(getPlanByPriceId('price_pro_m')).toEqual({ plan: 'pro', interval: 'month' });
    expect(getPlanByPriceId('price_pro_y')).toEqual({ plan: 'pro', interval: 'year' });
  });
  it('returns null for unknown prices', () => {
    expect(getPlanByPriceId('price_unknown')).toBeNull();
  });
  it('returns null when env is empty (avoids matching "" === priceId)', () => {
    mockEnv.mockReturnValue({});
    expect(getPlanByPriceId('')).toBeNull();
    expect(getPlanByPriceId('any')).toBeNull();
  });
});

describe('normalizeInterval', () => {
  it('passes year through', () => {
    expect(normalizeInterval('year')).toBe('year');
  });
  it('defaults non-year inputs to month', () => {
    expect(normalizeInterval('month')).toBe('month');
    expect(normalizeInterval('week')).toBe('month');
    expect(normalizeInterval(null)).toBe('month');
    expect(normalizeInterval(undefined)).toBe('month');
  });
});
