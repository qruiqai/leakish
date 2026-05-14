import { NextResponse, type NextRequest } from 'next/server';

import { withDetectAuth } from '@/lib/api/auth';
import { getEntitlement } from '@/lib/billing/entitlement';
import { PLAN_DEFS, priceIdFor } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return withDetectAuth(req, async ({ user }) => {
    const entitlement = await getEntitlement(user.id);
    return NextResponse.json({
      plan: entitlement.plan,
      interval: entitlement.interval,
      status: entitlement.status,
      isPaid: entitlement.isPaid,
      scansUsed: entitlement.scansUsed,
      scansLimit: entitlement.scansLimit,
      retainCap: entitlement.retainCap,
      periodStart: entitlement.periodStart.toISOString(),
      periodEnd: entitlement.periodEnd.toISOString(),
      availability: {
        starter: {
          month: !!priceIdFor('starter', 'month'),
          year: !!priceIdFor('starter', 'year'),
        },
        pro: {
          month: !!priceIdFor('pro', 'month'),
          year: !!priceIdFor('pro', 'year'),
        },
      },
      definitions: {
        free: { scanQuota: PLAN_DEFS.free.scanQuota, retainCap: PLAN_DEFS.free.retainCap },
        starter: {
          scanQuota: PLAN_DEFS.starter.scanQuota,
          retainCap: PLAN_DEFS.starter.retainCap,
        },
        pro: { scanQuota: PLAN_DEFS.pro.scanQuota, retainCap: PLAN_DEFS.pro.retainCap },
      },
    });
  });
}
