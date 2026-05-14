# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses 4-digit semver `MAJOR.MINOR.PATCH.MICRO`.

## [0.2.0.2] - 2026-05-12

### Fixed

- **Landing page actually rendering at `/` in production**. The `v0.2.0.0` / `v0.2.0.1` Docker builds (Node 22-alpine) suffered a webpack module-ID hash collision between `app/page.tsx` and `app/app/page.tsx`, so both routes resolved to the same compiled module — the detector page — and the landing page never rendered. Local `yarn build` (Node 25) produced correct output, masking the issue. Moved the marketing root into a route group at `app/(marketing)/page.tsx` (with `landing-content.tsx` alongside) so the file paths no longer collide. URLs are unchanged: `/` still serves the landing page.

## [0.2.0.1] - 2026-05-12

### Fixed

- Rebuild attempt (no source change). Did not fix the deployed-landing issue; see 0.2.0.2.

## [0.2.0.0] - 2026-05-12

### Added

- **Bilingual UI** — full English / Chinese locale support. English is the default; switch via the language toggle in the header. Locale persists in a `leakish.locale` cookie and drives `<html lang>`, page metadata, every screen, every API error response, and the magic-link sign-in email. Cookie is also honored by API routes for localized JSON error messages and by NextAuth when generating the verification email.
- **Landing page redesign** — aurora-style hero with three slow-pulsing color blobs over a dot grid, plus a live mock-fingerprint preview card that rotates rows every ~1.7s to show what a scan reveals. Below the hero: a stats strip (8 detection modules / 100% in-browser / 0 bytes shared) and feature cards with category-tinted hover glow.
- **Analytics dashboard** at `/scans/analytics` — distribution charts across timezone / platform / language / screen / WebGL / ASN / country / font count, fingerprint-hash repetition detection, IP/ASN timeline view, outlier scan detector, and a pairwise scan-compare with 0–100 similarity score. Powered by new `/api/detect/analytics` aggregate endpoint and `/api/detect/analytics/diff` route.
- **Detector logo as home link** — the shield-icon + title block on the `/app` detector page now navigates back to the landing page on click.

### Changed

- **Risk-signal generation is now locale-aware** — `lib/risk/assess.ts` takes `Messages` as a parameter and threads it through every per-module assessor, so signal titles and descriptions render in the user's locale instead of being hardcoded.
- **API responses surface localized error messages** — every `/api/detect/*` and `/api/integration/keys/*` route reads the locale cookie and returns the matching translation in the `message` field. The `withDetectAuth` wrapper now passes `m: Messages` into route handlers.
- **Detection module fallback strings are English** — every module's `name` and `description` fallback constant is now English (always overridden at render time by `localizeModule()`).

### Removed

- **AI assistant** in the analytics dashboard. The "AI assistant" chat panel, its API route, the OpenRouter streaming client, the LLM context-builder, the LLM rate-limit bucket, and the `OPENROUTER_API_KEY` / `OPENROUTER_DEFAULT_MODEL` environment variables are all gone. The rest of the analytics dashboard is unchanged.

### Known limitations

- `lib/detection-modules/cdp-detection-module.ts` still contains ~24 lines of hardcoded Chinese in its internal `automationSignals[].description` and `data.evidence` strings. These only surface when automation is actually detected. Restructuring the data shape to carry message keys would break the existing test fixture; deferred to a follow-up.
- `app/api/detect/analytics/diff/route.ts` has no direct unit test for its `jaccardSimilarity()` and `similarityScore` math. The route is otherwise a thin wrapper over the tested `lib/server/analytics.ts`.
