<h1 align="center">Leakish</h1>

<p align="center">
  Browser privacy-leak detector — eight detection modules, risk scoring, and
  per-account history, all in your browser.
</p>

<p align="center">
  <a href="https://www.verdent.ai/?id=701236"><img alt="Built with Verdent" src="https://img.shields.io/badge/Built%20with-Verdent-7c3aed?style=for-the-badge" /></a>
  <img alt="Next.js 14" src="https://img.shields.io/badge/Next.js-14-000000?style=for-the-badge&logo=next.js" />
  <img alt="React 18" src="https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&logoColor=000" />
  <img alt="TypeScript 5" src="https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript&logoColor=fff" />
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-6-2D3748?style=for-the-badge&logo=prisma&logoColor=fff" />
</p>

> **Built with [Verdent](https://www.verdent.ai/?id=701236)** — an agentic coding assistant.
> Every detection module, the analytics dashboard, the API-key auth flow, the
> bilingual UI and the Kubernetes-ready Docker image were designed and
> implemented in pair-programming sessions driven by Verdent.

---

## What this is

Open a URL, click **Run all**, and within a few seconds Leakish tells you what
your browser is leaking about you and your network — over WebRTC, fingerprinting
APIs, DNS, and a server-side probe. Eight independent modules each produce a
typed result + risk signals, an aggregated score (0–100) and a level
(`safe` / `warning` / `critical`).

Signed-in users can save scans to MySQL, browse history, and open an analytics
dashboard that shows distribution charts, fingerprint-hash repetition, IP / ASN
timeline, outlier scans, and a pairwise compare. Everything else (the detector
itself) works without an account — anyone can land on `/app` and run a scan.

## Detection modules

| ID                    | Module                | What it inspects                                                                           |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| `network-probe`       | Network egress probe  | Server-observed public IP, ASN, country/region/city, VPN/proxy/Tor/hosting flags, TLS/HTTP |
| `webrtc`              | WebRTC                | Public IPv4 + IPv6 via STUN, RFC1918 leaks, mDNS-obfuscated `.local` candidates            |
| `browser-fingerprint` | Browser fingerprint   | UA, screen, timezone, plugins, CPU cores, device memory, language list, DNT, cookies       |
| `canvas-fingerprint`  | Canvas / WebGL        | 2D + WebGL renderer/vendor strings, text-rendering quirks, supported image formats         |
| `audio-fingerprint`   | Audio                 | `AudioContext` sample rate, channels, latency, oscillator output hash                      |
| `font-detection`      | Fonts                 | 40+ named-font probes via Canvas width-difference detection                                |
| `dns`                 | DNS                   | DoH reachability, DNSSEC signal, resolver geolocation, DNS-leak heuristics                 |
| `cdp-detection`       | Automation / headless | `navigator.webdriver`, CDP timing, Chromium-only API surface, port probes — confidence 0–1 |

Each module is registered through a single typed `DetectionModule<T>` interface
and runs in isolation — one module throwing does not affect the others. Enable
state per module is persisted in `localStorage` with a version key, survives
refresh, and the **Run all** button only walks the enabled set.

## Features

- **In-browser detection** — every module runs in the user's tab. The server is
  only involved when (a) the user is signed in and saves a scan, (b) the
  network-probe module hits `/api/detect/network` to read its own server-observed
  IP, or (c) the DNS module talks to `https://dns.google/resolve`.
- **Bilingual UI** — full English / Chinese parity. Locale is held in a
  `leakish.locale` cookie, drives `<html lang>`, page metadata, every screen,
  every API error response, and the magic-link sign-in email.
- **Authentication** — NextAuth with Google OAuth + magic-link email (Mailgun);
  Prisma adapter on MySQL. Email is optional in dev — links print to the server
  log when Mailgun isn't configured.
- **Programmatic access** — users can mint `det_…` API keys on the
  _Integrations_ page (SHA-256 stored, plaintext shown once). Every
  `/api/detect/*` endpoint accepts either a session cookie or a Bearer key, so
  the same scan can be saved from a CLI / CI job.
- **Analytics dashboard** at `/scans/analytics` — distribution charts across
  timezone / platform / language / screen / WebGL / ASN / country / font count,
  fingerprint-hash repetition with a per-kind risk grade, IP / ASN timeline,
  multi-axis outlier detector, pairwise compare with 0–100 similarity score.
- **Risk model with per-signal traceability** — `lib/risk/assess.ts` produces
  typed `RiskSignal`s with stable IDs (e.g. `webrtc.public-ip-leak`), per-module
  summaries, and a single aggregate score. Locale-aware via `Messages` injection.
- **Idempotent save + per-user pruning** — `POST /api/detect/scans` accepts an
  `Idempotency-Key` header, caps each user at 200 scans, and rate-limits saves
  to 10/hour.
- **Production-grade Docker image** — multi-stage build on `node:22-alpine`,
  Next.js standalone output, deploys to Kubernetes via the workflow under
  `.github/workflows/`.

## Quick start

Prereqs: Node 22+ (anything 20+ works for local dev), Yarn 1.x, a running MySQL
instance, and (optionally) a Google OAuth client.

```bash
yarn install
cp env.example .env.local      # fill in DATABASE_URL, NEXTAUTH_SECRET, IP_HASH_SALT at minimum
yarn prisma:generate
yarn db:push                   # provision tables on a fresh DB
yarn dev                       # http://localhost:3000
```

Minimum env to get a working sign-in:

- `DATABASE_URL` — e.g. `mysql://root:password@127.0.0.1:3306/detect`
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `NEXTAUTH_URL` — `http://localhost:3000` in dev
- `IP_HASH_SALT` — `openssl rand -base64 32`

Optional:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for Google sign-in
- `MAILGUN_API_KEY` / `MAILGUN_DOMAIN` / `EMAIL_FROM` for real magic-link delivery
  (without these the link is printed to the dev server console)
- `IPINFO_TOKEN` to enrich the network probe with ASN / VPN / proxy data

See [`env.example`](env.example) for the full annotated list.

## Routes

| Path               | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `/`                | Marketing landing (aurora hero, feature cards, FAQ, CTA)  |
| `/app`             | The detector — module list + result panel + overview      |
| `/login`           | Standalone sign-in page (Google / email / API key)        |
| `/scans`           | Signed-in user's saved-scan history                       |
| `/scans/[id]`      | Single saved-scan detail                                  |
| `/scans/analytics` | Distribution / repetition / timeline / outliers / compare |
| `/integrations`    | Manage `det_…` API keys (create / revoke / how-to)        |

## Project layout

```
app/
├── (marketing)/         # / — Landing (server-resolved auth state + client UI)
├── app/                 # /app — the detector page
├── login/               # /login
├── scans/               # /scans, /scans/[id], /scans/analytics
├── integrations/        # /integrations — API key management
├── api/
│   ├── auth/            # NextAuth route + apiKey-login + tests
│   ├── detect/
│   │   ├── analytics/   # aggregate + pairwise-diff
│   │   ├── network/     # server-side egress probe
│   │   ├── scans/       # save / list / get / delete
│   │   └── uniqueness/  # how many users share this fingerprint hash
│   ├── integration/keys # create / revoke / list API keys
│   └── health/          # liveness probe for k8s
├── opengraph-image.tsx  # dynamic OG (per-locale)
├── apple-icon.tsx       # dynamic apple-touch icon
├── icon.svg             # shield gradient
└── layout.tsx           # metadata + theme-init script + LocaleProvider

components/
├── modular-detector.tsx          # top-level shell (header + module list + result/overview)
├── detector/                     # module-list, result-panel, category filter, state hook
├── result-details/               # one detail view per module (typed switch)
├── overview/                     # overview panel + diagnostics export
├── auth/                         # AuthGateProvider, login dialog, login form
├── providers/                    # SessionProvider wrapper
└── ui/                           # shadcn-style primitives + theme/locale toggles

lib/
├── detection-modules/            # 8 module impls + ModuleManager + IP utils + tests
├── risk/                         # assess.ts — RiskSignal/score aggregation
├── i18n/                         # en.ts / zh.ts + Messages type + locale client/server
├── api/                          # withDetectAuth wrapper, scan-payload Zod schema
├── client/                       # browser-side scan-api (extractFingerprintInputs, saveScan, lookupUniqueness)
├── server/                       # network-probe, IP-hash salt, fingerprint hashing, rate-limit, send-email, analytics
├── persistence/                  # SSR-safe localStorage wrappers
├── env.ts                        # runtime env validation
├── logger.ts                     # dev-only diagnostic logger
└── prisma.ts                     # singleton client targeted at .prisma/detect-client

prisma/schema.prisma              # User / Account / Session / DetectScan / ApiKey / DetectFingerprintHash
```

## How a scan round-trips

1. User clicks **Run all** in `/app`. The detector iterates enabled modules
   through `ModuleManager.runAllEnabledModules` — each module's failure is
   caught and isolated so other results still surface.
2. Every module returns a typed `DetectionResult<T>` (with `success | failure`
   tag and module-specific `data`). The result panel renders a per-module
   detail component via a type-safe `switch`.
3. `lib/risk/assess.ts` walks each result, emits `RiskSignal`s with stable IDs,
   and produces an `OverallAssessment` (score + level + counts).
4. On **Save this scan**, the client extracts a structured payload + fingerprint
   hashes (canvas2d / webgl / audio / fontset / UA) and `POST`s
   `/api/detect/scans`. The server validates with Zod, runs its own network
   probe to record the server-observed IP / ASN / VPN flags, and writes a
   `DetectScan` row plus `DetectFingerprintHash` rows.
5. The scan is then visible at `/scans/[id]`, contributes to the analytics
   aggregates, and counts in the uniqueness lookup.

## Tech stack

| Layer          | Pieces                                                                     |
| -------------- | -------------------------------------------------------------------------- |
| Framework      | Next.js 14 (App Router, `force-dynamic` everywhere), React 18              |
| Language       | TypeScript 5, strict mode                                                  |
| UI             | Tailwind CSS 3, shadcn/ui primitives on Radix, Lucide icons, Framer Motion |
| Auth           | NextAuth 4 (Google OAuth + magic-link email) + Prisma adapter              |
| Data           | Prisma 6 → MySQL (custom client output at `.prisma/detect-client`)         |
| Validation     | Zod                                                                        |
| Tests          | Jest 29 + ts-jest + jsdom                                                  |
| Build / deploy | Multi-stage Dockerfile, Next.js standalone, Kubernetes manifests           |

## Tests

Unit tests live alongside their subjects under `__tests__/` directories:

```bash
yarn test                    # full suite
yarn test path/to/file       # single file
yarn test -t "name pattern"  # by test-name regex
```

Highlights:

- `lib/detection-modules/__tests__/` — IP classification + mDNS extraction,
  module-manager registration & failure isolation, mocked `RTCPeerConnection`
  for the WebRTC module, jsdom-shape tests for the browser-fingerprint module,
  CDP/automation signal generation.
- `lib/server/__tests__/analytics.test.ts` — distribution bucketing, repetition
  grouping, outlier scoring, pairwise similarity math.
- `app/api/detect/scans/__tests__` — POST save (validation, rate limit,
  idempotency, pruning) + GET list + DELETE single.
- `app/api/integration/keys/__tests__` — create / revoke / list with mode
  gating (API-key sessions cannot mint other API keys).
- `app/api/auth/__tests__` — apiKey-login route (CSRF, format check, revoked /
  expired handling, last-used touch).

Lint + typecheck:

```bash
yarn lint
npx tsc --noEmit
```

## Deployment

The included `Dockerfile` produces a Next.js standalone image on
`node:22-alpine`. Production env is injected via Kubernetes Secret — placeholder
values are baked at build time so `SKIP_ENV_VALIDATION` is not required at
runtime. A `prisma db push` Job runs the schema before the rollout. See
`.github/workflows/deploy-tke.yml` for the full image-build → migrate → rollout
pipeline.

## Billing & subscriptions

This open-source build has no paywall. Saves are governed solely by the
in-process per-user rate limiter in `lib/server/rate-limit.ts` (10 saves/hour),
and history retention is unbounded.

## Acknowledgements

- **[Verdent](https://www.verdent.ai/?id=701236)** — agentic coding assistant used to build this
  project end-to-end.
- **[NextAuth](https://next-auth.js.org/)** — the auth substrate.
- **[Prisma](https://www.prisma.io/)** — schema, migrations, generated client.
- **[shadcn/ui](https://ui.shadcn.com/)** + **[Radix UI](https://www.radix-ui.com/)** —
  the accessible primitives this UI is built on.
- **[Tailwind CSS](https://tailwindcss.com/)** — styling system.
- **[ipinfo.io](https://ipinfo.io/)** — free ASN / VPN data used by the network probe.
- **[Mailgun](https://www.mailgun.com/)** — magic-link email delivery in production.

## License

See [LICENSE](LICENSE).
