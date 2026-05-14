import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

import { PricingTable, type PlanAvailability } from '@/components/billing/pricing-table';
import { BackLink } from '@/components/ui/back-link';
import { getOptionalUser } from '@/lib/api/auth';
import { priceIdFor } from '@/lib/billing/plans';
import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages } from '@/lib/i18n/messages';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function PricingPage() {
  const user = await getOptionalUser();
  const m = getMessages(getLocale());

  let currentPlan: 'free' | 'starter' | 'pro' | undefined;
  if (user) {
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { plan: true, status: true },
    });
    if (sub && ['active', 'trialing', 'past_due'].includes(sub.status)) {
      currentPlan = sub.plan === 'pro' ? 'pro' : 'starter';
    } else {
      currentPlan = 'free';
    }
  }

  const availability: PlanAvailability = {
    starter: {
      month: !!priceIdFor('starter', 'month'),
      year: !!priceIdFor('starter', 'year'),
    },
    pro: {
      month: !!priceIdFor('pro', 'month'),
      year: !!priceIdFor('pro', 'year'),
    },
  };

  const faqOrder = ['cycleReset', 'alipayWechat', 'refund', 'changePlan'] as const;

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <BackLink href="/">{m.scans.backToDetector}</BackLink>
        </div>

        <header className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.pricing.heading}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            {m.pricing.subheading}
          </p>
        </header>

        <PricingTable signedIn={!!user} currentPlan={currentPlan} availability={availability} />

        <section className="mx-auto mt-16 max-w-3xl">
          <h2 className="mb-6 text-center text-2xl font-semibold tracking-tight">
            {m.pricing.faq.heading}
          </h2>
          <div className="space-y-2">
            {faqOrder.map(key => {
              const item = m.pricing.faq[key];
              return (
                <details
                  key={key}
                  className="group overflow-hidden rounded-xl border border-border/60 bg-card"
                >
                  <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium hover:bg-muted/30">
                    <span>{item.q}</span>
                    <ChevronDown
                      className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="border-t border-border/60 px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <div className="mt-10 text-center text-xs text-muted-foreground">
          <Link href="/account/billing" className="underline-offset-2 hover:underline">
            {m.billing.manage}
          </Link>
        </div>
      </div>
    </main>
  );
}
