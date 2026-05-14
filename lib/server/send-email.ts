import { logger } from '@/lib/logger';
import { getServerEnv } from '@/lib/env';

/**
 * Mailgun-backed transactional email.
 *
 * Configuration is *optional* by design:
 *
 *   - `MAILGUN_API_KEY` + `MAILGUN_DOMAIN` + `EMAIL_FROM` all set
 *       → real email goes out via Mailgun
 *
 *   - missing in dev (`NODE_ENV !== 'production'`)
 *       → email is logged to the server console; the magic link is right there
 *         so local dev works without any SMTP / vendor setup
 *
 *   - missing in prod
 *       → throw — we'd rather show "send failed, check ops" to the user than
 *         silently swallow a login attempt
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const env = getServerEnv();
  const configured = !!env.MAILGUN_API_KEY && !!env.MAILGUN_DOMAIN && !!env.EMAIL_FROM;

  if (!configured) {
    if (env.NODE_ENV === 'production') {
      // Developer-facing error message — surfaces in server logs and (worst
      // case) bubbles up as a generic 500 to the user. Kept English so it
      // remains parseable in ops dashboards regardless of locale.
      throw new Error(
        'Email service not configured: set MAILGUN_API_KEY / MAILGUN_DOMAIN / EMAIL_FROM'
      );
    }
    // Dev fallback. Print the magic link prominently so it's easy to spot.
    logger.warn('=========================================================');
    logger.warn(`[email:dev] Would send email to: ${msg.to}`);
    logger.warn(`[email:dev] Subject: ${msg.subject}`);
    logger.warn(`[email:dev] ----- text body -----`);
    logger.warn(msg.text);
    logger.warn(`[email:dev] ---------------------`);
    logger.warn('[email:dev] Mailgun not configured; copy the link above into a browser.');
    logger.warn('=========================================================');
    return;
  }

  const region = env.MAILGUN_REGION ?? 'us';
  const endpoint =
    region === 'eu'
      ? `https://api.eu.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`
      : `https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`;

  const auth = 'Basic ' + Buffer.from(`api:${env.MAILGUN_API_KEY}`).toString('base64');

  const body = new URLSearchParams({
    from: env.EMAIL_FROM ?? '',
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  }).toString();

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    // Don't let a slow Mailgun stall the request indefinitely.
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Mailgun send failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}
