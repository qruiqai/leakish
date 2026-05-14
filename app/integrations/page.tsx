import { redirect } from 'next/navigation';
import { Key } from 'lucide-react';

import { BackLink } from '@/components/ui/back-link';
import { getOptionalUser } from '@/lib/api/auth';
import { getLocale } from '@/lib/i18n/locale-server';
import { getMessages } from '@/lib/i18n/messages';
import prisma from '@/lib/prisma';
import { IntegrationManager } from './integration-manager';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const user = await getOptionalUser();
  if (!user) redirect('/app?login=1&next=/integrations');

  const m = getMessages(getLocale());

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: [{ revokedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  // Keys are serialized to ISO strings before crossing the client boundary.
  const initialKeys = keys.map(k => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
  }));

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <BackLink href="/">{m.integrations.backToDetector}</BackLink>
        </div>

        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--cat-network)/0.15)] to-[hsl(var(--cat-browser)/0.15)] ring-1 ring-border">
            <Key className="h-5 w-5 text-foreground/70" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{m.integrations.heading}</h1>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              {m.integrations.intro}
            </p>
          </div>
        </div>

        <IntegrationManager initialKeys={initialKeys} />
      </div>
    </main>
  );
}
