'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bug,
  ChevronDown,
  Globe,
  Image as ImageIcon,
  Monitor,
  Network,
  Play,
  ShieldCheck,
  Type,
  Volume2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { LocaleToggle } from '@/components/ui/locale-toggle';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useMessages } from '@/lib/i18n/locale-client';

export function LandingContent({ signedIn }: { signedIn: boolean }) {
  const m = useMessages();
  const L = m.landing;

  return (
    <main className="min-h-screen bg-background flex flex-col">
      <Navbar nav={L.nav} appTitle={m.app.title} signedIn={signedIn} />

      <Hero hero={L.hero} />

      <Stats stats={L.stats} />

      <Features features={L.features} />

      <HowItWorks how={L.howItWorks} />

      <Faq faq={L.faq} />

      <FinalCta cta={L.cta} />

      <Footer footer={L.footer} appTitle={m.app.title} />
    </main>
  );
}

/* ---------------- sections ---------------- */

function Navbar({
  nav,
  appTitle,
  signedIn,
}: {
  nav: { tryNow: string; signIn: string; goToApp: string };
  appTitle: string;
  signedIn: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[hsl(var(--cat-network))] to-[hsl(var(--cat-browser))] flex items-center justify-center shadow-elevated">
            <ShieldCheck className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <span className="text-base font-semibold tracking-tight truncate">{appTitle}</span>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <LocaleToggle />
          <ThemeToggle />
          {signedIn ? (
            <Button asChild size="sm">
              <Link href="/app">
                {nav.goToApp}
                <ArrowRight className="h-4 w-4 ml-1.5" aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href="/login">{nav.signIn}</Link>
              </Button>
              <Button asChild size="sm" className="shadow-elevated">
                <Link href="/app">{nav.tryNow}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({
  hero,
}: {
  hero: {
    eyebrow: string;
    headline: string;
    subheadline: string;
    ctaPrimary: string;
    ctaSecondary: string;
    trust: string;
    scanLabel: string;
    scanTitle: string;
    scanFooter: string;
  };
}) {
  return (
    <section className="relative overflow-hidden">
      <AuroraBackdrop />
      <div className="mx-auto max-w-6xl px-6 pt-20 pb-20 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] items-center gap-12 lg:gap-16">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 backdrop-blur px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {hero.eyebrow}
          </span>
          <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
            {hero.headline}
          </h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0">
            {hero.subheadline}
          </p>

          <div className="mt-8 flex items-center justify-center lg:justify-start gap-3 flex-wrap">
            <Button asChild size="lg" className="shadow-elevated">
              <Link href="/app">
                <Play className="h-4 w-4 mr-2" aria-hidden="true" />
                {hero.ctaPrimary}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#how-it-works">
                {hero.ctaSecondary}
                <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">{hero.trust}</p>
        </div>

        <ScanPreview label={hero.scanLabel} title={hero.scanTitle} footer={hero.scanFooter} />
      </div>
    </section>
  );
}

/**
 * Ambient aurora behind the hero — three slow-pulsing color blobs (network /
 * privacy / browser accents) over a faint dot grid. Pure decoration, marked
 * aria-hidden and zero-interactive. The blobs use `blur` + low opacity so the
 * effect reads as atmosphere rather than competing with the copy.
 */
function AuroraBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute -top-32 -left-24 h-[460px] w-[460px] rounded-full bg-[hsl(var(--cat-network)/0.22)] blur-[110px]"
        animate={{ x: [0, 60, 0], y: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-40 -right-32 h-[520px] w-[520px] rounded-full bg-[hsl(var(--cat-privacy)/0.22)] blur-[120px]"
        animate={{ x: [0, -50, 0], y: [0, -40, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/3 left-1/2 h-[340px] w-[340px] -translate-x-1/2 rounded-full bg-[hsl(var(--cat-browser)/0.18)] blur-[100px]"
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="absolute inset-0 [background-image:radial-gradient(hsl(var(--foreground)/0.045)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_85%)]" />
    </div>
  );
}

type ScanStatus = 'safe' | 'warning' | 'critical';

// Mock fingerprint samples that look plausible across locales. The values are
// deliberately specific (real hash prefixes, realistic IPs, real timezone IDs)
// because abstract placeholders read as decoration — concrete ones read as
// proof.
const SCAN_SAMPLES: Array<{ key: string; value: string; status: ScanStatus }> = [
  { key: 'canvas2d', value: 'a4f9c7e2b1…', status: 'critical' },
  { key: 'webrtc.local', value: '172.16.0.42', status: 'warning' },
  { key: 'webrtc.public', value: '203.0.113.42', status: 'critical' },
  { key: 'audio', value: '124.04347611…', status: 'warning' },
  { key: 'fonts', value: '142 installed', status: 'warning' },
  { key: 'webgl', value: 'Apple GPU · M2', status: 'critical' },
  { key: 'timezone', value: 'Asia/Singapore', status: 'safe' },
  { key: 'ja4', value: 't13d1517h2…', status: 'safe' },
  { key: 'dns', value: '1.1.1.1 · Cloudflare', status: 'safe' },
  { key: 'ua-cpu', value: 'arm64 · 10 cores', status: 'warning' },
];

const STATUS_TONE: Record<ScanStatus, { dot: string; text: string }> = {
  safe: { dot: 'bg-[hsl(var(--success))]', text: 'text-[hsl(var(--success))]' },
  warning: { dot: 'bg-[hsl(var(--warning))]', text: 'text-[hsl(var(--warning))]' },
  critical: { dot: 'bg-destructive', text: 'text-destructive' },
};

/**
 * Hero centerpiece — a "live" terminal-style readout that rotates mock
 * fingerprint values. The visible window is always 4 rows; every ~1.7s the
 * window advances by one, so it reads like a scan is actively running. Pure
 * decoration: nothing here matches the user's real browser. Rotation only
 * kicks in after mount so SSR markup stays deterministic.
 */
function ScanPreview({ label, title, footer }: { label: string; title: string; footer: string }) {
  const [offset, setOffset] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const id = window.setInterval(() => {
      setOffset(o => (o + 1) % SCAN_SAMPLES.length);
    }, 1700);
    return () => window.clearInterval(id);
  }, []);

  const visible = Array.from({ length: 4 }, (_, i) => {
    const idx = (offset + i) % SCAN_SAMPLES.length;
    return { ...SCAN_SAMPLES[idx], idx };
  });

  return (
    <div className="relative">
      {/* Glow under the card so it feels like it's emitting light */}
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-[hsl(var(--cat-network)/0.25)] via-transparent to-[hsl(var(--cat-privacy)/0.2)] blur-2xl"
      />
      <div className="relative rounded-2xl border border-border/60 bg-card/85 backdrop-blur shadow-elevated ring-1 ring-foreground/5 overflow-hidden">
        {/* Header strip */}
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 bg-muted/30">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-[hsl(var(--success))] animate-ping opacity-60" />
            <span className="relative h-2 w-2 rounded-full bg-[hsl(var(--success))]" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </span>
          <span className="ml-auto inline-flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-border" />
            <span className="h-2 w-2 rounded-full bg-border" />
            <span className="h-2 w-2 rounded-full bg-border" />
          </span>
        </div>

        {/* Title row */}
        <div className="px-4 pt-4 pb-2 flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground">{title}</span>
          <DotFlasher />
        </div>

        {/* Rotating rows. The list height is locked and clipped so a transient
            exit/enter never causes layout reflow on the rest of the page.
            Keys are sample-id only (not tied to offset), so when the window
            advances by one, only the row that left exits and only the row
            that entered animates in — the three persisting rows just `layout`
            up by one slot. */}
        {/* Decorative mock data — aria-hidden so the rotating rows don't
            re-announce on screen readers every ~1.7s. */}
        <ul
          aria-hidden="true"
          className="px-4 pb-3 font-mono text-xs space-y-1 h-[10rem] overflow-hidden"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map(sample => {
              const tone = STATUS_TONE[sample.status];
              return (
                <motion.li
                  key={sample.idx}
                  layout
                  initial={mounted ? { opacity: 0, y: 16 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`}
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground tabular-nums w-[7.5rem] truncate">
                    {sample.key}
                  </span>
                  <span className={`tabular-nums truncate ${tone.text}`}>{sample.value}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        {/* Footer note */}
        <div className="border-t border-border/60 bg-muted/20 px-4 py-2 text-[10px] tracking-wide text-muted-foreground">
          {footer}
        </div>
      </div>
    </div>
  );
}

function DotFlasher() {
  return (
    <span className="inline-flex gap-0.5 text-muted-foreground" aria-hidden="true">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-current"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 }}
        />
      ))}
    </span>
  );
}

function Stats({
  stats,
}: {
  stats: {
    modules: { value: string; label: string; hint: string };
    local: { value: string; label: string; hint: string };
    shared: { value: string; label: string; hint: string };
  };
}) {
  const cells = [stats.modules, stats.local, stats.shared];
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <ul
          role="list"
          className="grid grid-cols-1 sm:grid-cols-3 rounded-2xl border border-border/60 bg-card overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-border/60"
        >
          {cells.map((cell, i) => (
            <li key={i} className="px-6 py-7 text-center sm:text-left relative group">
              <div
                aria-hidden="true"
                className="absolute inset-0 -z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-[hsl(var(--cat-network)/0.07)] via-transparent to-transparent"
              />
              <div className="text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                {cell.value}
              </div>
              <div className="mt-2 text-sm font-medium tracking-tight">{cell.label}</div>
              <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{cell.hint}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Features({
  features,
}: {
  features: {
    eyebrow: string;
    heading: string;
    subheading: string;
    items: Record<
      'network' | 'webrtc' | 'browser' | 'canvas' | 'audio' | 'font' | 'dns' | 'cdp',
      { title: string; body: string }
    >;
  };
}) {
  const accents = {
    network: {
      tint: 'bg-[hsl(var(--cat-network)/0.12)]',
      text: 'text-[hsl(var(--cat-network))]',
      glow: 'hover:border-[hsl(var(--cat-network)/0.45)] hover:shadow-[0_30px_60px_-30px_hsl(var(--cat-network)/0.55)]',
    },
    browser: {
      tint: 'bg-[hsl(var(--cat-browser)/0.12)]',
      text: 'text-[hsl(var(--cat-browser))]',
      glow: 'hover:border-[hsl(var(--cat-browser)/0.45)] hover:shadow-[0_30px_60px_-30px_hsl(var(--cat-browser)/0.55)]',
    },
    privacy: {
      tint: 'bg-[hsl(var(--cat-privacy)/0.12)]',
      text: 'text-[hsl(var(--cat-privacy))]',
      glow: 'hover:border-[hsl(var(--cat-privacy)/0.45)] hover:shadow-[0_30px_60px_-30px_hsl(var(--cat-privacy)/0.55)]',
    },
  } as const;
  const items = [
    { key: 'network' as const, icon: Network, accent: 'network' as const },
    { key: 'webrtc' as const, icon: Globe, accent: 'network' as const },
    { key: 'browser' as const, icon: Monitor, accent: 'browser' as const },
    { key: 'canvas' as const, icon: ImageIcon, accent: 'browser' as const },
    { key: 'audio' as const, icon: Volume2, accent: 'browser' as const },
    { key: 'font' as const, icon: Type, accent: 'browser' as const },
    { key: 'dns' as const, icon: Globe, accent: 'network' as const },
    { key: 'cdp' as const, icon: Bug, accent: 'privacy' as const },
  ];

  return (
    <section id="features" className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl mb-12">
          <span className="inline-flex items-center rounded-full bg-muted/60 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {features.eyebrow}
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight">
            {features.heading}
          </h2>
          <p className="mt-3 text-base text-muted-foreground leading-relaxed">
            {features.subheading}
          </p>
        </div>

        <ul role="list" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map(({ key, icon: Icon, accent }) => {
            const item = features.items[key];
            const tone = accents[accent];
            return (
              <li
                key={key}
                className={`group rounded-2xl border border-border/60 bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 ${tone.glow}`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone.tint}`}
                >
                  <Icon className={`h-5 w-5 ${tone.text}`} aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-sm font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{item.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function HowItWorks({
  how,
}: {
  how: {
    eyebrow: string;
    heading: string;
    steps: Record<'one' | 'two' | 'three', { title: string; body: string }>;
  };
}) {
  const stepOrder = ['one', 'two', 'three'] as const;
  return (
    <section id="how-it-works" className="border-t border-border/60 bg-muted/20">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl mb-12">
          <span className="inline-flex items-center rounded-full bg-muted/60 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {how.eyebrow}
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight">{how.heading}</h2>
        </div>

        <ol role="list" className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stepOrder.map((key, idx) => {
            const step = how.steps[key];
            return (
              <li
                key={key}
                className="rounded-2xl border border-border/60 bg-background p-6 shadow-elevated"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--cat-network)/0.15)] text-xs font-semibold text-[hsl(var(--cat-network))] tabular-nums">
                    {idx + 1}
                  </span>
                  <h3 className="text-sm font-semibold tracking-tight">{step.title}</h3>
                </div>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Faq({
  faq,
}: {
  faq: {
    eyebrow: string;
    heading: string;
    items: Record<
      'privacy' | 'accuracy' | 'login' | 'opensource' | 'api',
      { q: string; a: string }
    >;
  };
}) {
  const order = ['privacy', 'accuracy', 'login', 'opensource', 'api'] as const;
  return (
    <section id="faq" className="border-t border-border/60">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="mb-10 text-center">
          <span className="inline-flex items-center rounded-full bg-muted/60 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {faq.eyebrow}
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight">{faq.heading}</h2>
        </div>

        <div className="space-y-2">
          {order.map(key => {
            const item = faq.items[key];
            return (
              <details
                key={key}
                className="group rounded-xl border border-border/60 bg-card open:bg-card overflow-hidden"
              >
                <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium select-none flex items-center justify-between gap-4 hover:bg-muted/30">
                  <span>{item.q}</span>
                  <ChevronDown
                    className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="border-t border-border/60 px-5 py-4 text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ cta }: { cta: { heading: string; subheading: string; button: string } }) {
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">{cta.heading}</h2>
        <p className="mt-3 text-base text-muted-foreground leading-relaxed">{cta.subheading}</p>
        <div className="mt-7 flex items-center justify-center">
          <Button asChild size="lg" className="shadow-elevated">
            <Link href="/app">
              <Play className="h-4 w-4 mr-2" aria-hidden="true" />
              {cta.button}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer({
  footer,
  appTitle,
}: {
  footer: {
    tagline: string;
    copyright: (year: number) => string;
    productHeading: string;
    productCheck: string;
    productHistory: string;
    productApi: string;
    legalHeading: string;
    legalPrivacy: string;
    legalTerms: string;
  };
  appTitle: string;
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border/60 bg-muted/20 mt-auto">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[hsl(var(--cat-network))] to-[hsl(var(--cat-browser))] flex items-center justify-center">
                <ShieldCheck className="h-4 w-4 text-white" aria-hidden="true" />
              </div>
              <span className="text-sm font-semibold tracking-tight">{appTitle}</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed max-w-xs">
              {footer.tagline}
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {footer.productHeading}
            </h3>
            <ul role="list" className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/app" className="text-foreground hover:text-foreground/80">
                  {footer.productCheck}
                </Link>
              </li>
              <li>
                <Link href="/scans" className="text-foreground hover:text-foreground/80">
                  {footer.productHistory}
                </Link>
              </li>
              <li>
                <Link href="/integrations" className="text-foreground hover:text-foreground/80">
                  {footer.productApi}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {footer.legalHeading}
            </h3>
            <ul role="list" className="mt-3 space-y-2 text-sm">
              <li>
                <span className="text-muted-foreground">{footer.legalPrivacy}</span>
              </li>
              <li>
                <span className="text-muted-foreground">{footer.legalTerms}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border/60 text-xs text-muted-foreground">
          {footer.copyright(year)}
        </div>
      </div>
    </footer>
  );
}
