import { PrismaAdapter } from '@auth/prisma-adapter';
import type { NextAuthOptions, Session } from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import GoogleProvider from 'next-auth/providers/google';

import prisma from '@/lib/prisma';
import { getServerEnv } from '@/lib/env';
import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages } from '@/lib/i18n/messages';
import { sendEmail } from '@/lib/server/send-email';

const env = getServerEnv();

interface ExtendedSession extends Session {
  user: Session['user'] & { id?: string };
}

// PrismaAdapter expects the standard `@prisma/client` generic shape; the
// scoped detect client is structurally identical, so we cast at the boundary.
const adapter = PrismaAdapter(prisma as unknown as Parameters<typeof PrismaAdapter>[0]);

export const authOptions: NextAuthOptions = {
  adapter,

  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      // No need for offline access tokens — we only use Google for identity.
      authorization: { params: { prompt: 'select_account' } },
      // We deliberately do NOT set allowDangerousEmailAccountLinking. A Google
      // account whose verified email matches an existing magic-link User row
      // would otherwise silently take over that account. NextAuth will now
      // surface OAuthAccountNotLinked; the user must sign in with the method
      // they originally used (or revoke+re-link through a supported flow).
    }),

    // Magic-link email login. Uses our Mailgun-or-dev-console sender so we
    // don't require an SMTP server to be wired up.
    EmailProvider({
      // Required by the NextAuth contract but unused — we override sendVerificationRequest.
      server: { host: 'unused', port: 0, auth: { user: '', pass: '' } },
      from: env.EMAIL_FROM ?? 'noreply@localhost',
      // Magic-link validity window. NextAuth default is 24h; we tighten to 30 min.
      maxAge: 30 * 60,
      async sendVerificationRequest({ identifier: email, url }) {
        // Read locale at send time. The cookie set on the user's browser when
        // they hit "Send sign-in link" is the locale they'll prefer for the
        // email itself; we don't try to track preference per-account.
        const m = getMessages(getLocale());
        const v = m.email.verify;
        const subject = v.subject;
        const text = v.text(url);
        const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;color:#0f172a;">
            <h1 style="font-size:18px;margin:0 0 12px;">${v.heading}</h1>
            <p style="font-size:14px;line-height:1.6;color:#334155;margin:0 0 20px;">
              ${v.intro}
            </p>
            <p style="margin:0 0 24px;">
              <a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:600;padding:10px 20px;border-radius:8px;font-size:14px;">${v.button}</a>
            </p>
            <p style="font-size:12px;color:#64748b;margin:0 0 8px;">${v.fallbackHint}</p>
            <p style="font-size:12px;color:#64748b;word-break:break-all;margin:0 0 24px;">${url}</p>
            <p style="font-size:12px;color:#94a3b8;margin:0;border-top:1px solid #e2e8f0;padding-top:16px;">
              ${v.footer}
            </p>
          </div>
        `;

        await sendEmail({ to: email, subject, text, html });
      },
    }),
  ],

  // Database sessions (paired with PrismaAdapter) so we can revoke server-side.
  session: { strategy: 'database' },

  pages: {
    // /login is a thin redirect to `/app?login=1` which auto-opens the modal.
    signIn: '/login',
    // Same trick for errors: the detector modal renders the error inline.
    error: '/login',
  },

  callbacks: {
    async session({ session, user }): Promise<ExtendedSession> {
      const extended = session as ExtendedSession;
      if (extended.user) {
        extended.user.id = user.id;
      }
      return extended;
    },
  },

  // Enable verbose logs only in dev.
  debug: env.NODE_ENV === 'development',
};
