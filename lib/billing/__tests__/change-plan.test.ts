/**
 * @jest-environment node
 */

jest.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    STRIPE_PRICE_STARTER_MONTHLY: 'price_starter_m',
    STRIPE_PRICE_STARTER_YEARLY: 'price_starter_y',
    STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m',
    STRIPE_PRICE_PRO_YEARLY: 'price_pro_y',
  }),
}));

jest.mock('@/lib/server/stripe', () => {
  const singleton = {
    subscriptions: { retrieve: jest.fn(), update: jest.fn() },
    subscriptionSchedules: {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
      release: jest.fn(),
    },
  };
  return { getStripe: () => singleton };
});

const syncSubscriptionMock: jest.Mock = jest.fn(async () => undefined);
jest.mock('@/lib/billing/sync', () => ({
  syncSubscription: (...args: unknown[]) => syncSubscriptionMock(...args),
}));

import { getStripe } from '@/lib/server/stripe';
import {
  applyChange,
  cancelPendingChange,
  classify,
  getPendingChange,
} from '@/lib/billing/change-plan';

const stripeMock = getStripe() as unknown as {
  subscriptions: { retrieve: jest.Mock; update: jest.Mock };
  subscriptionSchedules: {
    create: jest.Mock;
    retrieve: jest.Mock;
    update: jest.Mock;
    release: jest.Mock;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('classify', () => {
  it('Starter → Pro is an upgrade', () => {
    expect(
      classify({
        currentPlan: 'starter',
        currentInterval: 'month',
        targetPlan: 'pro',
        targetInterval: 'month',
      })
    ).toBe('upgrade-immediate');
  });

  it('Pro → Starter is a downgrade', () => {
    expect(
      classify({
        currentPlan: 'pro',
        currentInterval: 'month',
        targetPlan: 'starter',
        targetInterval: 'month',
      })
    ).toBe('downgrade-scheduled');
  });

  it('same plan + same interval is a noop', () => {
    expect(
      classify({
        currentPlan: 'starter',
        currentInterval: 'month',
        targetPlan: 'starter',
        targetInterval: 'month',
      })
    ).toBe('noop');
  });

  it('same plan monthly → yearly is an upgrade (longer commitment)', () => {
    expect(
      classify({
        currentPlan: 'starter',
        currentInterval: 'month',
        targetPlan: 'starter',
        targetInterval: 'year',
      })
    ).toBe('upgrade-immediate');
  });

  it('same plan yearly → monthly is a downgrade (release commitment)', () => {
    expect(
      classify({
        currentPlan: 'pro',
        currentInterval: 'year',
        targetPlan: 'pro',
        targetInterval: 'month',
      })
    ).toBe('downgrade-scheduled');
  });

  it('cross-plan + cross-interval respects plan tier first', () => {
    expect(
      classify({
        currentPlan: 'starter',
        currentInterval: 'year',
        targetPlan: 'pro',
        targetInterval: 'month',
      })
    ).toBe('upgrade-immediate');
    expect(
      classify({
        currentPlan: 'pro',
        currentInterval: 'month',
        targetPlan: 'starter',
        targetInterval: 'year',
      })
    ).toBe('downgrade-scheduled');
  });
});

function makeSub(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    items: {
      data: [
        {
          id: 'si_1',
          price: { id: 'price_starter_m' },
          current_period_end: 1768356800,
        },
      ],
    },
    ...over,
  };
}

describe('applyChange — upgrade path', () => {
  it('calls subscriptions.update with proration_behavior=always_invoice', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeSub());
    stripeMock.subscriptions.update.mockResolvedValue(makeSub());

    const r = await applyChange({
      userId: 'u1',
      stripeSubscriptionId: 'sub_1',
      currentPlan: 'starter',
      currentInterval: 'month',
      targetPlan: 'pro',
      targetInterval: 'month',
    });
    expect(r.mode).toBe('upgrade-immediate');
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith('sub_1', {
      items: [{ id: 'si_1', price: 'price_pro_m' }],
      proration_behavior: 'always_invoice',
    });
  });

  it('synchronously calls syncSubscription so SSR after the request sees the new plan', async () => {
    // The bug this guards against: `customer.subscription.updated` lands ~1s
    // later than the route response; without an inline sync, the client's
    // `router.refresh()` lands before the DB row is updated and the user
    // sees stale "Starter" until they manually refresh again.
    const updated = makeSub({ id: 'sub_1' });
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeSub());
    stripeMock.subscriptions.update.mockResolvedValue(updated);

    await applyChange({
      userId: 'u-sync',
      stripeSubscriptionId: 'sub_1',
      currentPlan: 'starter',
      currentInterval: 'month',
      targetPlan: 'pro',
      targetInterval: 'month',
    });
    expect(syncSubscriptionMock).toHaveBeenCalledWith('sub_1', 'u-sync', updated);
  });

  it('does NOT call syncSubscription on the downgrade path (current sub is unchanged)', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(
      makeSub({
        items: {
          data: [
            { id: 'si_1', price: { id: 'price_pro_m' }, current_period_end: 1768356800 },
          ],
        },
      })
    );
    stripeMock.subscriptionSchedules.create.mockResolvedValue({ id: 'sub_sched_x' });
    stripeMock.subscriptionSchedules.retrieve.mockResolvedValue({
      id: 'sub_sched_x',
      phases: [{ start_date: 1765678400 }],
    });
    stripeMock.subscriptionSchedules.update.mockResolvedValue({});

    await applyChange({
      userId: 'u1',
      stripeSubscriptionId: 'sub_1',
      currentPlan: 'pro',
      currentInterval: 'month',
      targetPlan: 'starter',
      targetInterval: 'month',
    });
    expect(syncSubscriptionMock).not.toHaveBeenCalled();
  });

  it('releases a pending downgrade schedule before applying the upgrade', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeSub({ schedule: 'sub_sched_1' }));
    stripeMock.subscriptionSchedules.release.mockResolvedValue({});
    stripeMock.subscriptions.update.mockResolvedValue({});

    await applyChange({
      userId: 'u1',
      stripeSubscriptionId: 'sub_1',
      currentPlan: 'starter',
      currentInterval: 'month',
      targetPlan: 'pro',
      targetInterval: 'month',
    });
    expect(stripeMock.subscriptionSchedules.release).toHaveBeenCalledWith('sub_sched_1');
    expect(stripeMock.subscriptions.update).toHaveBeenCalled();
  });

  it('continues even if release fails (race / already released)', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeSub({ schedule: 'sub_sched_2' }));
    stripeMock.subscriptionSchedules.release.mockRejectedValue(new Error('already released'));
    stripeMock.subscriptions.update.mockResolvedValue({});

    const r = await applyChange({
      userId: 'u1',
      stripeSubscriptionId: 'sub_1',
      currentPlan: 'starter',
      currentInterval: 'month',
      targetPlan: 'pro',
      targetInterval: 'month',
    });
    expect(r.mode).toBe('upgrade-immediate');
    expect(stripeMock.subscriptions.update).toHaveBeenCalled();
  });
});

describe('applyChange — downgrade path', () => {
  it('creates a schedule and adds a phase ending at current_period_end', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(makeSub({ items: { data: [{
      id: 'si_1',
      price: { id: 'price_pro_m' },
      current_period_end: 1768356800,
    }] } }));
    stripeMock.subscriptionSchedules.create.mockResolvedValue({ id: 'sub_sched_new' });
    stripeMock.subscriptionSchedules.retrieve.mockResolvedValue({
      id: 'sub_sched_new',
      phases: [{ start_date: 1765678400 }],
    });
    stripeMock.subscriptionSchedules.update.mockResolvedValue({});

    const r = await applyChange({
      userId: 'u1',
      stripeSubscriptionId: 'sub_1',
      currentPlan: 'pro',
      currentInterval: 'month',
      targetPlan: 'starter',
      targetInterval: 'month',
    });
    expect(r.mode).toBe('downgrade-scheduled');
    expect(r.effectiveAt).toEqual(new Date(1768356800 * 1000));

    expect(stripeMock.subscriptionSchedules.create).toHaveBeenCalledWith({
      from_subscription: 'sub_1',
    });
    const call = stripeMock.subscriptionSchedules.update.mock.calls[0];
    expect(call[0]).toBe('sub_sched_new');
    expect(call[1].end_behavior).toBe('release');
    expect(call[1].phases).toHaveLength(2);
    expect(call[1].phases[0]).toEqual({
      items: [{ price: 'price_pro_m', quantity: 1 }],
      start_date: 1765678400,
      end_date: 1768356800,
    });
    expect(call[1].phases[1]).toEqual({
      items: [{ price: 'price_starter_m', quantity: 1 }],
      duration: { interval: 'month', interval_count: 1 },
    });
  });

  it('reuses the existing schedule instead of creating a new one', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(
      makeSub({
        schedule: 'sub_sched_existing',
        items: {
          data: [
            {
              id: 'si_1',
              price: { id: 'price_pro_y' },
              current_period_end: 1800000000,
            },
          ],
        },
      })
    );
    stripeMock.subscriptionSchedules.retrieve.mockResolvedValue({
      id: 'sub_sched_existing',
      phases: [{ start_date: 1700000000 }],
    });
    stripeMock.subscriptionSchedules.update.mockResolvedValue({});

    await applyChange({
      userId: 'u1',
      stripeSubscriptionId: 'sub_1',
      currentPlan: 'pro',
      currentInterval: 'year',
      targetPlan: 'starter',
      targetInterval: 'year',
    });

    expect(stripeMock.subscriptionSchedules.create).not.toHaveBeenCalled();
    const call = stripeMock.subscriptionSchedules.update.mock.calls[0];
    expect(call[0]).toBe('sub_sched_existing');
    // Yearly target → phase 2 duration uses 'year'
    expect(call[1].phases[1].duration).toEqual({ interval: 'year', interval_count: 1 });
  });
});

describe('applyChange — noop', () => {
  it('skips all Stripe calls when target plan + interval match current', async () => {
    const r = await applyChange({
      userId: 'u1',
      stripeSubscriptionId: 'sub_1',
      currentPlan: 'starter',
      currentInterval: 'month',
      targetPlan: 'starter',
      targetInterval: 'month',
    });
    expect(r.mode).toBe('noop');
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    expect(stripeMock.subscriptionSchedules.create).not.toHaveBeenCalled();
  });
});

describe('cancelPendingChange', () => {
  it('releases the schedule when one exists', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue({ schedule: 'sub_sched_3' });
    stripeMock.subscriptionSchedules.release.mockResolvedValue({});
    const r = await cancelPendingChange('sub_1');
    expect(r).toBe(true);
    expect(stripeMock.subscriptionSchedules.release).toHaveBeenCalledWith('sub_sched_3');
  });

  it('returns false when no schedule is attached', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue({ schedule: null });
    const r = await cancelPendingChange('sub_1');
    expect(r).toBe(false);
    expect(stripeMock.subscriptionSchedules.release).not.toHaveBeenCalled();
  });

  it('handles schedule provided as an expanded object', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      schedule: { id: 'sub_sched_obj' },
    });
    stripeMock.subscriptionSchedules.release.mockResolvedValue({});
    await cancelPendingChange('sub_1');
    expect(stripeMock.subscriptionSchedules.release).toHaveBeenCalledWith('sub_sched_obj');
  });
});

describe('getPendingChange', () => {
  it('returns null when subscription has no schedule', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue({ schedule: null });
    expect(await getPendingChange('sub_1')).toBeNull();
  });

  it('returns null when no upcoming phase exists', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue({ schedule: 'sub_sched_4' });
    stripeMock.subscriptionSchedules.retrieve.mockResolvedValue({
      phases: [{ start_date: Math.floor(Date.now() / 1000) - 60 }],
    });
    expect(await getPendingChange('sub_1')).toBeNull();
  });

  it('returns the upcoming phase price as { plan, interval, effectiveAt }', async () => {
    const future = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    stripeMock.subscriptions.retrieve.mockResolvedValue({ schedule: 'sub_sched_5' });
    stripeMock.subscriptionSchedules.retrieve.mockResolvedValue({
      phases: [
        { start_date: Math.floor(Date.now() / 1000) - 60 },
        {
          start_date: future,
          items: [{ price: 'price_starter_m' }],
        },
      ],
    });

    const r = await getPendingChange('sub_1');
    expect(r).toEqual({
      effectiveAt: new Date(future * 1000),
      plan: 'starter',
      interval: 'month',
    });
  });

  it('returns null when upcoming phase references an unknown price', async () => {
    const future = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    stripeMock.subscriptions.retrieve.mockResolvedValue({ schedule: 'sub_sched_6' });
    stripeMock.subscriptionSchedules.retrieve.mockResolvedValue({
      phases: [{ start_date: future, items: [{ price: 'price_unknown_xyz' }] }],
    });
    expect(await getPendingChange('sub_1')).toBeNull();
  });
});
