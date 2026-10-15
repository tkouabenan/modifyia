# MODIFY AI

An AI character and motion-transfer studio built with Next.js, React, TypeScript, PostgreSQL/SQLite, private media storage, and FFmpeg.

> **Work in progress — not production-ready.** This branch contains the initial studio interface and backend implementation. Visual styling, secondary pages, broader automated coverage, and security/operational validation are unfinished. A targeted regression suite now covers draft validation, credit reservations/refunds, and worker queue behavior. Navigation currently references pages that have not been implemented. External integrations have not been verified using live credentials.

## Implemented foundations

- Next.js App Router studio with video/image uploads, trimming controls, prompt presets, reference selection, and preview/comparison components.
- Server-side file inspection, image normalization/cropping, H.264 source normalization, and a 720p H.264/AAC MP4 export pipeline.
- PostgreSQL support and a local SQLite development database with parameterized queries and transactional credit accounting.
- Email/password authentication endpoints, opaque server-side sessions, verification/reset tokens, and a Google OAuth integration.
- User-scoped project, character, media, notification, billing, and administrator API handlers.
- A persistent database-backed generation queue with worker leases, provider polling, stable submission idempotency keys, credit reservations, and refunds.
- Official Higgsfield TypeScript SDK submission adapter for `higgsfield/genjutsu/motion-transfer/v1.0`, with explicit status/cancellation handling.
- Local private media storage and an S3-compatible storage implementation.
- Stripe Checkout, customer portal, and signature-verified webhook handlers.
- Initial English/French strings and clearly labeled illustrative concept artwork.

These are code paths, **not a claim that every workflow has passed end-to-end testing**. No sample artwork is presented as a completed video generation. Generation is gated on server credentials and an online worker.

## Local development

Requires Node.js **22.13 or newer**. SQLite uses Node's experimental `node:sqlite` module. FFmpeg and FFprobe are installed through platform-specific npm packages; newer system binaries can be supplied using environment variables.

```bash
npm ci --legacy-peer-deps
cp .env.example .env.local
npm run db:setup
npm run dev
```

In another terminal, using the same database/media configuration:

```bash
npm run worker
```

The development server binds to `0.0.0.0:3000`. With the default configuration, local data lives under ignored `data/` paths. The worker loads `.env.local` directly.

Without external credentials, the application can create an isolated preview workspace and exercise local media/project APIs. Real video generation, payments, Google sign-in, and email delivery need the services below. The authentication _API_ exists, but the login, registration, reset, and verification _pages_ remain to be built.

## External configuration

See [`.env.example`](.env.example) for the variable names.

### Higgsfield

Set `HF_CREDENTIALS` to the provider-issued `KEY_ID:KEY_SECRET`, ensure the account has Genjutsu API access and balance, and run the worker. The adapter accepts a normalized source video, 1–8 reference images, an optional prompt, and 720p output. Sources must be trimmed to 4–30 seconds.

The worker sends prepared assets to the provider's temporary upload service. It persists the request identifier before polling, retrieves the actual result, and normalizes it into private storage. There is no simulated generation fallback. Network access to Higgsfield and its returned storage/CDN URLs is required.

Provider reference: <https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer>

### Authentication and email

Configure SMTP and `MAIL_FROM` to deliver verification/reset links. Development API responses can include a development link; production responses do not. Email verification is required for generation by default.

Google OAuth needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, a `SESSION_SECRET` of at least 32 characters (including in development), and a registered callback URL of:

```text
https://your-app.example/api/auth/google/callback
```

Never expose provider or payment secrets in browser-facing environment variables.

### Database and storage

Use a private PostgreSQL connection in `DATABASE_URL` for production. The schema is currently initialized from `src/lib/server/schema.ts`; reviewed, versioned migrations and database access-policy validation remain outstanding.

Use a private S3-compatible bucket for shared, durable production media. The API verifies asset ownership before streaming local files or issuing short-lived S3 download URLs. The web process and worker must share the same database and storage configuration.

A local-production override exists for single-host testing only; it is not a recommendation to use SQLite on ephemeral/serverless production hosts.

### Stripe

Configure the Stripe secret key, webhook signing secret, and Creator/Pro monthly USD price IDs. Price amounts must match the configured plan catalog. Point the webhook endpoint at:

```text
https://your-app.example/api/billing/webhook
```

The code handles subscription events and paid invoices, with webhook/event and invoice credit-grant deduplication. Test mode, renewals, ordering, cancellations, and retry scenarios still need integration tests before use with real customers.

### Administrator provisioning

After registering the intended account, set `ADMIN_EMAIL` and run `npm run db:setup` to assign the administrator role. Administrator APIs exist; an administrator UI remains to be built.

## Validation status

- `npm run typecheck` — passes.
- `npm run build` — passes. Runtime media paths no longer trigger whole-project filesystem tracing. Node still reports its experimental SQLite warning.
- `npm run lint` — passes with no errors or warnings.
- `npm test` — 16 local regression tests pass, covering malformed drafts, duplicate reservations, exactly-once refunds, stale worker fencing, cancellation between provider polls, transient failures, and processing deadlines. External provider behavior is mocked only in tests.
- Browser tests and live PostgreSQL concurrency validation remain outstanding.
- `npm audit --omit=dev` reports no production dependency vulnerabilities. The full audit still reports inherited development-only advisories in the ESLint dependency chain.
- Live Higgsfield, Stripe, Google, SMTP, PostgreSQL, and S3 workflows have not been verified in this environment.

## Before release

- Complete styling, responsive/accessibility review, and all secondary routes (landing, authentication, overview, projects/history, characters, queue, billing, settings, help/legal, administration).
- Extend regression coverage with browser tests, real upload decoding, PostgreSQL concurrency, webhook ordering, token/OAuth lifecycles, and completed-video downloads.
- Audit worker leases, timeouts/retries, subscription lifecycle accounting, deletion/cleanup, quota enforcement, and upload resource limits.
- Add reviewed migrations and deployment-specific database/storage access policies.
- Add available malware scanning, operational monitoring, backups, cleanup jobs, and rate-limit/reverse-proxy configuration.
- Review the inherited development dependency advisories; validate licensing and update bundled FFmpeg binaries as appropriate.
- Deploy FFmpeg processing to a suitable persistent/container worker, not a short-lived frontend function. Configure outbound network access and run a real end-to-end generation before launch.
