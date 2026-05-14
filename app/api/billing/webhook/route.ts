import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';

import { resolveUserId, syncSubscription } from '@/lib/billing/sync';
import { getServerEnv } from '@/lib/env';
import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages } from '@/lib/i18n/messages';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { getStripe } from '@/lib/server/stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PRISMA_UNIQUE_VIOLATION = 'P2002';

function isPrismaCode(err: unknown, code: string): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === code;
}

/**
 * Stripe webhook receiver. Public — auth is via the signed `stripe-signature`
 * header which we verify against `STRIPE_WEBHOOK_SECRET`.
 *
 * Idempotency: every event id is first inserted into `StripeEvent`. A
 * duplicate (P2002) means we already handled this delivery, so we ack 200
 * without re-applying side effects.
 */
export async function POST(req: NextRequest) {
  const m = getMessages(getLocale());
  const env = getServerEnv();
  const sig = req.headers.get('stripe-signature');
  const raw = await req.text();

  if (!env.STRIPE_WEBHOOK_SECRET) {
    logger.warn('billing webhook hit but STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json(
      { error: 'not_configured', message: m.apiErrors.billingNotConfigured },
      { status: 500 }
    );
  }
  if (!sig) {
    return NextResponse.json(
      { error: 'missing_signature', message: m.apiErrors.billingWebhookSignatureInvalid },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    logger.warn('stripe webhook signature verification failed:', error);
    return NextResponse.json(
      { error: 'invalid_signature', message: m.apiErrors.billingWebhookSignatureInvalid },
      { status: 400 }
    );
  }

  // Idempotency gate. We insert the row first to claim the event id, then
  // dispatch. If dispatch fails we MUST delete the claim row, otherwise the
  // retry from Stripe sees a duplicate, returns 200, and the event is
  // permanently lost. Storing claim-then-delete (rather than insert after
  // success) preserves cheap duplicate-collapse semantics for near-simultaneous
  // retries while keeping the failure path recoverable.
  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (error) {
    if (isPrismaCode(error, PRISMA_UNIQUE_VIOLATION)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    logger.warn('stripe webhook idempotency insert failed:', error);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }

  try {
    await dispatch(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.warn(`stripe webhook handler failed for ${event.type}:`, error);
    // Roll back the idempotency claim so Stripe's retry actually re-runs us.
    // Best-effort: if the delete itself fails the event is still orphaned,
    // but the reconcile cron will eventually catch period-tick state — log
    // loudly so on-call sees the gap.
    await prisma.stripeEvent
      .delete({ where: { id: event.id } })
      .catch(deleteErr =>
        logger.warn(`stripe webhook rollback delete failed for ${event.id}:`, deleteErr)
      );
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
  }
}

async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const subId = typeof session.subscription === 'string' ? session.subscription : null;
      const userId = session.client_reference_id ?? session.metadata?.userId ?? null;
      if (subId && userId) await syncSubscription(subId, userId);
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserId(sub);
      if (!userId) {
        logger.warn(`subscription event ${event.type} could not be linked to a user`, {
          subId: sub.id,
          customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
        });
        return;
      }
      if (event.type === 'customer.subscription.deleted') {
        await prisma.subscription
          .delete({ where: { userId } })
          .catch(err => logger.warn('subscription delete failed (possibly already gone):', err));
        return;
      }
      // The webhook delivers a full subscription object, so we don't need to
      // re-fetch it from Stripe (saves a round-trip).
      await syncSubscription(sub.id, userId, sub);
      return;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const reason = invoice.billing_reason ?? '';
      if (
        reason !== 'subscription_cycle' &&
        reason !== 'subscription_update' &&
        reason !== 'subscription_create'
      ) {
        return;
      }
      const subId = subscriptionIdFromInvoice(invoice);
      if (!subId) return;
      const fresh = await getStripe().subscriptions.retrieve(subId);
      const userId = await resolveUserId(fresh);
      if (userId) await syncSubscription(subId, userId, fresh);
      return;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = subscriptionIdFromInvoice(invoice);
      if (!subId) return;
      await prisma.subscription
        .updateMany({
          where: { stripeSubscriptionId: subId },
          data: { status: 'past_due' },
        })
        .catch(err => logger.warn('subscription past_due flag failed:', err));
      return;
    }
    default:
      // Many event types are subscribed to in Stripe but ignored here on
      // purpose (e.g. invoice.created). 200 OK keeps Stripe quiet.
      return;
  }
}

/**
 * Pull the parent subscription id off an Invoice. In the 2026-04-22.dahlia
 * API version the top-level `invoice.subscription` was removed; the linkage
 * now lives under `invoice.parent.subscription_details.subscription` and is
 * only present when `parent.type === 'subscription_details'`.
 */
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (!parent || parent.type !== 'subscription_details') return null;
  const sub = parent.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}
