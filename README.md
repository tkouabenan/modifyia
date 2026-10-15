# MODIFY AI

An AI character and motion-transfer studio built with Next.js, React, TypeScript, PostgreSQL/SQLite, private media storage, and FFmpeg.

> **Work in progress — not production-ready.** Visual QA, live-credential verification, and broader automated coverage remain outstanding. A targeted regression suite covers draft validation, credit reservations/refunds, and worker queue behavior. External integrations have not been verified using live credentials.

## Product surfaces

- Marketing landing at `/` (and `/discover`) with pricing, FAQ, and conversion CTAs.
- Authentication pages: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`.
- Motion studio at `/create` plus overview, projects, history, characters, queue, billing, settings, help, legal, and admin consoles.
- Dark-mode design system (electric violet / neon cyan on midnight black) applied across marketing, auth, and workspace.

## Implemented foundations

- Next.js App Router studio with video/image uploads, trimming controls, prompt presets, reference selection, and preview/comparison components.
- Server-side file inspection, image normalization/cropping, H.264 source normalization, and a 720p H.264/AAC MP4 export pipeline.
- PostgreSQL support and a local SQLite development database with parameterized queries and transactional credit accounting.
- Email/password authentication endpoints and pages, opaque server-side sessions, verification/reset tokens, and a Google OAuth integration.
- User-scoped project, character, media, notification, billing, and administrator API handlers with matching UI.
- A persistent database-backed generation queue with worker leases, provider polling, stable submission idempotency keys, credit reservations, and refunds.
- Default **local motion engine** (FFmpeg + tracked character composite) that generates real 720p MP4 files without Higgsfield.
- Optional Higgsfield TypeScript SDK adapter for `higgsfield/genjutsu/motion-transfer/v1.0` when `MOTION_PROVIDER=higgsfield`.
- Local private media storage and an S3-compatible storage implementation.
- Stripe Checkout, customer portal, and signature-verified webhook handlers.
- Initial English/French strings and clearly labeled illustrative concept artwork.

These are code paths, **not a claim that every workflow has passed end-to-end testing**. No sample artwork is presented as a completed video generation. Local generation processes the uploaded clip and character on the server; it is not a neural identity-lock model on the scale of Genjutsu.

## Local development

Requires Node.js **22.13 or newer**. SQLite uses Node's experimental `node:sqlite` module. FFmpeg and FFprobe are installed through platform-specific npm packages; newer system binaries can be supplied using environment variables.

```bash
npm ci --legacy-peer-deps
cp .env.example .env.local
npm run db:setup
npm run dev
```

In another terminal, using the same database/media configuration:

The development server embeds the generation worker (`EMBED_WORKER=true` by default). You can still run `npm run worker` separately.

The development server binds to `0.0.0.0:3000`. With the default configuration, local data lives under ignored `data/` paths.

### Super admin (local testing)

`npm run db:setup` creates a verified administrator:

- Email: `admin@modify.ai` (or `ADMIN_EMAIL`)
- Password: `ModifyAdmin2026!` (or `ADMIN_PASSWORD`)
- 100,000 test credits

Sign in at `/login`, then open `/create` to generate.

Without external credentials, local motion transfer, uploads, projects, and 720p export work. Payments, Google sign-in, and email delivery still need the services below.

## External configuration

See [`.env.example`](.env.example) for the variable names.

### Motion engine

Default: `MOTION_PROVIDER=local`. The worker trims the source, tracks subject motion with frame differencing, composites the character reference, and exports H.264/AAC 720p MP4. This is real media processing of the user's files, not a stock clip.

Optional cloud: set `MOTION_PROVIDER=higgsfield` and `HF_CREDENTIALS=KEY_ID:KEY_SECRET`. Sources must be trimmed to 4–30 seconds.

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

After registering the intended account, set `ADMIN_EMAIL` and run `npm run db:setup` to assign the administrator role. The operations UI is at `/admin`.

## Validation status

- `npm run typecheck` — passes.
- `npm run build` — passes. Runtime media paths no longer trigger whole-project filesystem tracing. Node still reports its experimental SQLite warning.
- `npm run lint` — passes with no errors or warnings.
- `npm test` — 16 local regression tests pass, covering malformed drafts, duplicate reservations, exactly-once refunds, stale worker fencing, cancellation between provider polls, transient failures, and processing deadlines. External provider behavior is mocked only in tests.
- Browser tests and live PostgreSQL concurrency validation remain outstanding.
- `npm audit --omit=dev` reports no production dependency vulnerabilities. The full audit still reports inherited development-only advisories in the ESLint dependency chain.
- Live Higgsfield, Stripe, Google, SMTP, PostgreSQL, and S3 workflows have not been verified in this environment.

## Before release

- Complete responsive/accessibility review of the new marketing, auth, and workspace surfaces.
- Extend regression coverage with browser tests, real upload decoding, PostgreSQL concurrency, webhook ordering, token/OAuth lifecycles, and completed-video downloads.
- Audit worker leases, timeouts/retries, subscription lifecycle accounting, deletion/cleanup, quota enforcement, and upload resource limits.
- Add reviewed migrations and deployment-specific database/storage access policies.
- Add available malware scanning, operational monitoring, backups, cleanup jobs, and rate-limit/reverse-proxy configuration.
- Review the inherited development dependency advisories; validate licensing and update bundled FFmpeg binaries as appropriate.
- Deploy FFmpeg processing to a suitable persistent/container worker, not a short-lived frontend function. Configure outbound network access and run a real end-to-end generation before launch.
