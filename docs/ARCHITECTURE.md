# Architecture and fixed decisions

## Stack

| Concern            | Required default                                                                        |
| ------------------ | --------------------------------------------------------------------------------------- |
| Workspace          | pnpm workspaces; one committed lockfile; TypeScript strict                              |
| App                | Expo stable SDK; React Native; React Native Web; Expo Router                            |
| Server state       | TanStack Query; React state for transient UI                                            |
| API                | Fastify on Node.js active LTS, compatible with the chosen Expo tooling                  |
| Validation         | Zod schemas shared through packages/contracts                                           |
| Identity           | Supabase Auth with Google provider                                                      |
| Data               | Supabase PostgreSQL; SQL migrations; private Supabase Storage                           |
| Durable jobs       | pg-boss, separate worker; dedicated queue schema and DB role                            |
| Database access    | pg parameterized SQL; no ORM in MVP                                                     |
| Models             | OpenRouter chat/completions over fetch; tools and SSE in one adapter                    |
| Search             | Tavily Search via server fetch; no user-managed search key                              |
| Document retrieval | PostgreSQL full-text search over extracted chunks; no embeddings                        |
| Tests              | Vitest, Fastify inject, local PostgreSQL/Supabase integration tests, Playwright web E2E |
| Formatting         | ESLint and Prettier with a shared root configuration                                    |

At T01 select exact mutually compatible versions and pin the package manager and Node version.
Commit the lockfile. Record supported OS floors from that Expo SDK; do not invent lower OS support.
Test current stable Chrome, Safari, and Firefox; record actual versions rather than claiming all browsers.

A fixed choice may change only after a short ADR proves a concrete compatibility problem and
explains migration impact. Preference or model familiarity is not sufficient justification.

## Structure and dependencies

```text
apps/client                 # Expo app: native and web
apps/api                    # HTTP API, auth, signed upload issuance, OAuth callbacks
apps/worker                 # Runs, extraction, deletion/revocation jobs
packages/contracts          # Zod schemas, DTO types, error/event names
packages/agent-runtime      # State machine and execution policies
packages/integrations       # OpenRouter, Tavily, Gmail, Calendar adapters
packages/database           # Parameterized queries and transaction helpers
supabase/migrations         # Application schema and policies
docs                        # Requirements, progress, decisions, setup
```

Create packages as implementation needs them. No empty service frameworks. Shared packages
must not import apps. The runtime accepts adapters and does not depend on Fastify or React.
All business writes go through the API. The client does not write application tables directly;
Supabase Auth is used directly for sign-in. Realtime conversation invalidations are optional;
focus refresh + five-second foreground polling must work without them.

Deploy web as static assets; API and worker as long-running processes from the same codebase.
Use containers with managed Supabase; do not buy/select a hosting account without owner input.
API reverse proxy must support SSE and disable buffering for that route. The worker must not
depend on mobile background execution, an open browser, or a long-lived HTTP request.

## Authentication and Google connections

Web sign-in: Supabase Google OAuth with PKCE and an allowlisted web callback.
Native sign-in: @react-native-google-signin/google-signin to obtain an ID token, exchanged via
Supabase signInWithIdToken. Use development builds and configure iOS/Android OAuth clients.
Use the provider SDK's documented nonce/audience checks; never implement token verification by parsing alone.

Validate Supabase access JWTs against the project's supported signing configuration and claims
(issuer, audience, expiry, subject); do not trust client user IDs. Native session storage must use
a documented secure adapter, including SDK-specific size constraints. Web uses SDK session storage
and a strict CSP; acknowledge the residual XSS risk, sanitize Markdown, and never enable raw HTML.
Refresh once on 401; then return to sign-in. Keep private content out of anonymous caches.

Integration OAuth is independent of SSO. Use server authorization-code flow with PKCE, expiring
single-use state bound to the user/capability, and encrypted offline refresh tokens. Never put bearer
credentials in URLs. Callback is on the API; mobile receives only a completion signal/deep link.
Polling integration status is the fallback if the app was closed. Do not require browser cookies
for API authentication or send Supabase tokens to Google. Request minimal scopes for the
capability being enabled; do not interpret SSO scopes as Gmail permission.

A single Google grant backs both capabilities. Incremental consent may add Gmail or Calendar
access. Disconnecting one capability disables it immediately and removes pending actions for it;
retain the shared grant only while another enabled capability requires it. Disconnecting the last
capability removes credentials and attempts provider revocation. A revocation job cannot be
reported successful merely because local tokens were deleted. Record retry status without exposing tokens.

## Secret handling

Use AES-256-GCM with fresh random nonce and authenticated owner/provider/version context.
Store ciphertext, authentication tag, nonce, and key version, never plaintext. Supply encryption
keys via a secret manager/environment keyring outside DB/backups. Document rotation: read old
versions, write newest, re-encrypt in batches, verify, then retire the old key.

OpenRouter validation uses GET /api/v1/key; do not generate a paid test response automatically.
Reject invalid credentials without replacing a working key. UI receives only last four characters,
status, and timestamps. Google refresh tokens never reach the application client or model context.
Redact Authorization, cookies, provider keys, request bodies containing secrets, and tokens in errors.

Validate secret configuration at startup. Public Expo env contains only API URL, Supabase URL,
publishable key, and required public OAuth client IDs. Service-role keys, DB credentials, encryption
keys, Google client secret, and Tavily key are server-only. Include placeholders in .env.example.
Do not add a shared operator OpenRouter key as a fallback for users without keys.

## Safe defaults and limits

| Limit                 | Default                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| Message text          | 32,000 Unicode code points, subject to model context budget                 |
| File                  | 20 MiB, five attachments per message, 200 files and 500 MiB stored per user |
| Extracted document    | 200 pages for PDF; 1,000,000 characters; 64 MiB decompression cap           |
| Agent                 | 10 model requests, 20 tool calls, 300 seconds active execution              |
| Model output          | Up to 4,096 tokens per model request, clamped to provider support           |
| Concurrency           | One active run per conversation; three per user                             |
| Approval              | 24-hour expiry; wait does not consume active execution time                 |
| External tool timeout | 20 seconds; page read 10 seconds; model call 90 seconds                     |
| Search                | Five results per call; ten page reads per run                               |
| Model catalog cache   | 15 minutes; stale fallback at most 24 hours with a visible stale marker     |
| Event batch           | Flush at 100 ms or 2 KiB, whichever comes first; persist before publish     |
| Access rates          | New runs: 10/minute/user; search: 30/hour/user; uploads: 20/hour/user       |

Apply limits server-side and expose relevant validation messages. Use shared DB counters for
multi-instance enforcement. No IP-only identity for authenticated usage. Limits are configurable
but changes must be documented. Cost is an estimate until provider usage is confirmed.

## Operations and external prerequisites

Provide /health/live and /health/ready (DB and queue connectivity; no secret payloads).
Use request_id/run_id logs with timing and status, without message/mail/file bodies by default.
Runtime events retain only UI-safe bounded data; raw model requests/responses are not log archives.
Keep provider billable usage where supplied; unknown cost remains null, never zero by assumption.

Local setup: client, API, worker, Supabase CLI or documented local Supabase, test DB, public
Google client IDs, server integration credentials, and authorized OpenRouter test key. Use separate
Google test/production projects. Missing providers show unavailable capability and actionable setup.

Document daily DB backup expectations and private Storage backup strategy; perform a restore
exercise before a production-readiness claim. Default operational logs: 14 days. Backups: 30 days.
Explain these defaults in the privacy/deletion documentation; actual host retention must match it.
Record hosting/search/storage and OAuth verification dependencies separately from model costs.

## Official references

- [Expo Router](https://docs.expo.dev/router/introduction/)
- [Expo Google authentication](https://docs.expo.dev/guides/google-authentication/)
- [Supabase Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase social sign-in and provider tokens](https://supabase.com/docs/guides/auth/social-sign-in)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [OpenRouter current key](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key)
- [OpenRouter streaming](https://openrouter.ai/docs/api_reference/streaming)
- [OpenRouter tool calling](https://openrouter.ai/blog/tutorials/tool-calling/)
- [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search)
- [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google production OAuth](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)
- [Apple login services](https://developer.apple.com/app-store/review/guidelines/#login-services)

## Owner-approved photo and Word extension — 2026-11-10

The isolated file parser supports DOC/DOCX and JPEG/PNG/WebP/GIF. Sharp validates/decode
limits, corrects orientation, resizes to 2048 px and strips metadata; word-extractor handles
legacy OLE DOC, with the existing bounded DOCX pipeline retained. The worker marks validated
photos ready without inventing extracted text. Binary parsing remains in a time- and
heap-limited child process with no application secrets in its environment.

Persist only attachment references in the agent checkpoint. Immediately before each model
call a service resolves references under owner/conversation/deletion checks. Document excerpts
are included as untrusted text; normalized photo bytes become private base64 image_url content
parts. No signed URLs or photo bytes are persisted in checkpoints. Cache normalized images
only inside that run's dependency instance and recheck ownership/deletion on every request.
Model catalog input modalities drive photo-compatibility validation; no silent model switch.
