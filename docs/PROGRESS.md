# Implementation progress

## Current state

The MVP implementation now includes the client, API, durable worker and provider adapters.
Personal Supabase database and private Storage setup are live verified. Interactive Google
login and OpenRouter generation remain pending. See the latest dated section below for the
current evidence and task statuses; older sections preserve the prior review history.

## Historical task tracker — before MVP continuation

| Task                            | Status      | Evidence / blocker                                                                                                                                        |
| ------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01 Foundation                  | implemented | `pnpm typecheck`, `pnpm test` (6), `pnpm test:integration` (2) on Node 26.13.0. Web shell exists; browser export not recorded.                            |
| T02 Database and auth           | in_progress | Database/RLS and JWT verification exist. Google sign-in and session handling are not implemented.                                                         |
| T03 Key and models              | in_progress | Encrypted key endpoints and catalog helper exist; model catalog route/cache/selector are missing. Live key check unverified.                              |
| T04 Conversations and contracts | in_progress | SQL and schemas exist; OpenAPI and actual conversation UI are missing.                                                                                    |
| T05 Durable runs                | in_progress | Lease renewal, fencing, outbox recovery and duplicate handling have DB regression tests. Actual queue/process crash drills remain unverified.             |
| T06 Real chat                   | in_progress | Streaming parser has synthetic regressions; chat UI is not implemented. Live model and native builds remain unverified.                                   |
| T07 Tools and approvals         | in_progress | Approval/rejection continuation, cancellation and duplicate-write protection tested. Full provider permission/expiry lifecycle remains incomplete.        |
| T08 Web research                | in_progress | Tavily/page adapters and IPv4/IPv6 SSRF guard exist. Citation persistence/UI and a full redirect/rebinding lab remain incomplete; live search unverified. |
| T09 Documents                   | not_started | Schema exists. Extraction pipeline is not built.                                                                                                          |
| T10 Google connections          | not_started | OAuth callback route is reserved. Consent flow is not built.                                                                                              |
| T11 Gmail                       | not_started | Depends on T10.                                                                                                                                           |
| T12 Calendar                    | not_started | Depends on T10.                                                                                                                                           |
| T13 Lifecycle and UX            | in_progress | Account deletion is queued and purged by the worker. Most UX states are not built.                                                                        |
| T14 Verification and handoff    | in_progress | CI workflow and setup doc exist. No restore drill, native build, or store checklist evidence.                                                             |

## External prerequisites (not provisioned)

- Google OAuth test project
- Supabase project
- OpenRouter test key
- Tavily key
- Test mailbox and calendar with permission for live writes
- iOS and Android build machines

```text
Date / commit: 2026-11-10 / uncommitted
Task ID: T01–T08 and part of T13–T14
Implemented behavior: Monorepo, migration, ownership, encrypted key slot, scripted runs, approval gate, health, worker, web shell.
Files or schema changed: apps/*, packages/*, supabase/migrations/0001_init.sql, docs/SETUP.md, docs/PROGRESS.md
Commands executed and results: pnpm typecheck (client, contracts, database, agent-runtime, integrations, api, worker), pnpm lint, pnpm test 6 passed, pnpm test:integration 2 passed. Node v26.13.0. Postgres 15 container ai-chat-pg.
Acceptance IDs covered (automated vs live): A01 partial (health, no public secret in ready body). A03 automated for conversations. A16 automated for rejection path. Live portions of A02, A04, A05, A11, A14, A15, A30 blocked.
External prerequisites still missing: Google, Supabase, OpenRouter, Tavily, Storage, devices.
Known defects or partial work: No document extraction, Gmail/Calendar OAuth, or full chat UI. Account purge does not call Supabase Auth admin delete. OpenAPI document is not generated.
Next task / exact next step: Generate OpenAPI from the Zod schemas, then implement upload/extraction and Google OAuth against the written contracts.
```

## Review fixes — 2026-11-10 (uncommitted)

Scope: fix reviewed runtime/network/deletion defects; no new product feature or live-provider claim.

- Block hexadecimal and expanded IPv4-mapped IPv6 private URLs and non-public address ranges.
- Claim a run before crash recovery, renew its lease, fence stale workers, and queue expired leases through outbox.
- Abort model streams on Stop, preserve partial text, and stop before subsequent tools/terminal success.
- Persist pending tool batches; supply rejected results and safely resume interrupted reads.
- Treat mid-stream provider errors and truncated streams as failures; preserve CORS and close terminal SSE.
- Process conversation cleanup, including private object deletion before DB purge; retain jobs on storage failure.
- Remove destructive TRUNCATE from integration setup; tests use unique synthetic owners.

Verification: Node 26.13.0; isolated PostgreSQL database, synthetic model/tool/OAuth tokens only.
No live OpenRouter, Tavily, Google, or Storage operation was performed. No real email/calendar change.
Final checks passed: `pnpm typecheck`, `pnpm lint`, `pnpm test` (13 tests),
`pnpm test:integration` (14 tests), and `pnpm build` (server checks + Expo web export).
Acceptance coverage added: A03 (deleted/cross-owner chat), A07/A26 (terminal SSE/CORS),
A08 (Stop/abort), A09 (lease renewal/recovery/fencing), A12 (mapped IPv6), A17 (continuation),
A18 (duplicate write delivery), A21/A22 (cleanup and storage failure). These are automated
synthetic checks, not live-provider verification. The scratch test database was removed.

Remaining work includes Google SSO, the actual chat UI, GET /v1/models/cache, documents,
Google integration authorization, full approval expiry/revocation behavior, account Auth/storage
cleanup, and native/live-provider verification. Do not classify these as credentials-only blockers.

## MVP implementation and Supabase setup — 2026-11-10 (uncommitted)

This section supersedes the earlier scaffold-only snapshot. The application now implements
Google web PKCE / native ID-token sign-in, session persistence and account cache isolation,
model catalog/cache, conversation UI and history, Markdown, streaming/reconnect, Stop/retry,
private uploads and isolated PDF/TXT/MD/DOCX extraction, source persistence/cards, separate
Google integration consent and encrypted token lifecycle, Gmail and Calendar adapters,
exact write previews, approval expiry/revocation, and account/Auth/storage cleanup jobs.

Implementation does not establish full acceptance. Current status:

| Task | Current status                         | Evidence / remaining work                                                                                                                                       |
| ---- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | implemented                            | Workspace checks and web export pass.                                                                                                                           |
| T02  | implemented, live login pending        | Google provider enabled in actual Supabase; web PKCE and restored-session browser checks pass. Owner's interactive sign-in pending. Native login not exercised. |
| T03  | implemented, live blocked              | Key encryption/version lifecycle and model selector exist; real OpenRouter key/model journey pending.                                                           |
| T04  | implemented, partial verification      | Conversation UI, pagination, DTOs and generated OpenAPI exist. OpenAPI response details still need a complete audit.                                            |
| T05  | implemented, partial verification      | Lease/recovery/duplicate/cancel/outbox regression checks pass. Full process/network crash drill remains.                                                        |
| T06  | implemented, live blocked              | Six desktop/mobile browser scenarios pass using explicit synthetic fixtures; no live model generation.                                                          |
| T07  | implemented, partial verification      | Approval/reject/expiry, revocation and duplicate-write regressions pass. Additional provider race coverage remains.                                             |
| T08  | implemented, live blocked              | Search/page adapters, SSRF guards and sources exist. Tavily live check and full network lab remain.                                                             |
| T09  | implemented, partial live verification | Extraction and private ownership tested. Actual Supabase Storage synthetic roundtrip passed; complete authenticated upload-to-answer journey pending.           |
| T10  | implemented, live blocked              | State/PKCE/encrypted refresh/account binding/disconnect implemented. Single-use denied-state regression passes. Real Gmail/Calendar consent pending.            |
| T11  | implemented, live blocked              | Gmail read/draft/send adapters and action cards; synthetic provider contracts only. No real mail sent.                                                          |
| T12  | implemented, live blocked              | Calendar read/free-busy/write, timezone and ETag protections; synthetic contracts only. No real event changed.                                                  |
| T13  | in_progress                            | Settings/theme/responsive screens and cleanup exist. Full account-switch, accessibility and platform lifecycle acceptance incomplete.                           |
| T14  | in_progress                            | Setup/CI/evidence updated. Restore drill, full native acceptance and release gates remain.                                                                      |

Verification on Node 26.13.0:

- `pnpm typecheck`: passed after adding typed lifecycle fixtures.
- `pnpm lint`: passed (generated native projects excluded).
- `pnpm test`: 27 passed across 9 files.
- `pnpm test:integration`: 18 passed across 3 files against disposable PostgreSQL 15,
  using a migration role without superuser or BYPASSRLS. No shared table truncation.
- `pnpm test:e2e`: 6 passed, 2 optional live-health cases skipped; isolated Chrome desktop
  and mobile viewport, synthetic API/provider fixtures. This is not a physical-device test.
- `pnpm build`: passed, including Expo web production export.
- Actual personal Supabase: TLS verification passed using owner-provided CA; both migrations
  applied to previously empty app schema; private `chat-files` bucket created with 20 MiB cap;
  synthetic upload/download/public-denial/cleanup passed. `/health/ready` returns database/queue ok.
- API rejects unauthenticated profile access with 401.
- iOS CocoaPods installation succeeded. Simulator compile failed in ExpoModulesJSI on Xcode
  26.2 with `sending 'slot' risks causing data races`; upstream issue #52754. No workaround
  applied; native iOS verification remains blocked pending a compatible toolchain/dependency.
- Android `:app:assembleDebug`: passed (Gradle 9.4.1, JDK 17, local Android SDK). APK generated in the ignored native build directory. No emulator/device or native login smoke was performed.

Local API, worker, and web were started for the owner's interactive login at localhost:8081.
`.env`, the supplied certificate and generated native directories are ignored by Git. No
secrets were printed or committed. No real email/calendar operation, store submission,
public deployment, commit or push was performed in this continuation.

Remaining work: owner verifies Google login and adds OpenRouter key through the app; investigate
any resulting real-provider issue; audit OpenAPI success/error responses; extend callback,
approval/file browser and process-crash coverage; finish native builds, accessibility, usage UI,
backup/restore exercise and acceptance matrix. Do not mark the full MVP complete.

## T13 — Sidebar refinement — 2026-11-10 (uncommitted)

Replaced the centered conversation-history dialog with a full-height left drawer on narrow
screens and a 280 px sidebar / 72 px collapsible icon rail on desktop. Added a compact
New chat action, search focus shortcut, recent-chat rows, and bottom-anchored settings/profile.
History pagination, search, selection and new-chat navigation keep their existing API behavior.
The mobile drawer closes on its menu button, backdrop, Escape (web), native back, and selection.
No duplicate Conversations/AI Chat headers or large primary sidebar button remain.

Checks: `pnpm typecheck` and `pnpm lint` passed; browser suite passed 8 scenarios with
2 optional API health checks skipped. Targeted sidebar scenarios also passed in dark mode
on desktop and mobile web; synthetic screenshots were visually inspected. Native code is shared,
but this sidebar change has not been exercised on a physical device. No API/schema/credential
changes or external provider actions were needed. The owner separately reported successful
live Google sign-in; OpenRouter generation remains unverified.

Next: continue the outstanding T13/T14 acceptance and platform checks recorded above.

## T13 — Automatic sidebar expansion — 2026-11-10 (uncommitted)

The desktop web sidebar now starts as a 72 px rail, expands on mouse hover and collapses on
pointer exit. Hover expansion overlays the chat without moving its content. The menu pins or
unpins the 280 px sidebar; focused search keeps the temporary panel open until focus leaves.
Touch/mobile navigation retains the explicit drawer controls.

Checks: client typecheck and workspace lint passed. Two targeted Playwright scenarios passed
(desktop and mobile web), including hover/exit, pinning, stable chat position, search focus
retention and mobile dismissal. No backend, provider or credential changes.

## T13 — Sidebar motion — 2026-11-10 (uncommitted)

Added 240 ms eased web width transitions to the sidebar and its pinned layout width.
Hover expansion remains an overlay without chat movement. Expanded search/header content
keeps a fixed width and is clipped during the transition to avoid text wrapping. The transition
tracks `prefers-reduced-motion` changes and is disabled for that preference.

Verification: client typecheck and workspace lint passed; both targeted desktop/mobile-web
sidebar scenarios passed after waiting for animated widths. No native or backend changes.

## T03 — Default conversation model — 2026-11-10 (uncommitted)

New conversations default to `google/gemini-3.8-flash` when the creation request omits
`model_id`. An explicitly supplied model still takes precedence; existing conversations
are not migrated. The shared creation schema also exposes the default in generated OpenAPI.
This change does not add image/document modalities to the existing transport.

Verification: workspace typecheck and lint passed; 27 unit tests passed. Direct schema
checks confirmed the default for an empty body and preservation of an explicit model ID.

## T13 — Gemini-inspired visual theme — 2026-11-10 (uncommitted)

Reworked shared light/dark theme tokens, sidebar hover/selection surfaces, pill buttons,
fields and cards. Chat now uses a quiet borderless header, blue greeting typography,
rounded message bubbles and a 28 px composer on a neutral surface. Brand remains AI Chat.
Native status-bar appearance now follows the theme explicitly instead of checking a hardcoded
background hex value. Existing chat and settings actions retain their behavior.

Verification: client typecheck and workspace lint passed; browser suite passed 8 scenarios
with 2 optional health cases skipped. Desktop light/dark and mobile drawer screenshots used
synthetic data and were visually inspected. Physical native devices were not exercised.
No provider, database or credential changes were required.

## T09/T13 — Photo and Word questions, familiar chat layout — 2026-11-10 (uncommitted)

Owner scope: attach photos and Word documents, ask questions about their contents, and make
navigation/composition familiar to Gemini users. This section supersedes the earlier text-only
attachment and home-route descriptions.

Implemented:

- JPG/JPEG/PNG/WebP/GIF and DOC/DOCX selection in the shared client; existing PDF/TXT/MD retained.
- Actual isolated photo decoding, orientation correction, metadata stripping and bounded resize.
  Legacy Word DOC extraction uses a pure Node parser; DOCX preserves basic table boundaries.
- Files become ready only after validation/extraction. Composer and history display filename,
  type/status, errors and private photo thumbnails. Sending waits for ready attachments.
- Worker hydrates owner/chat-scoped attachment references immediately before model requests:
  Word text enters context, photos enter real image_url parts. Checkpoints retain references,
  not base64 payloads or signed URLs. Deletion and cross-owner/cross-chat isolation are checked
  on every hydration, including when a normalized image is cached inside a run.
- Catalog image-input metadata gates photo questions; text-only models fail before inference.
- Home now has greeting, immediately editable composer, attachment action and suggestion chips.
  First send/upload creates the conversation; allocation is shared by concurrent composer actions.
  New chat returns to a fresh draft. Model and Tools sit by the round send button; settings opens
  from the profile avatar. Existing history, hover sidebar and light/dark themes remain available.

Evidence on Node 26.13.0, isolated PostgreSQL 15 and synthetic fixtures:

- Workspace typecheck and lint passed; web production export passed.
- Unit tests: 32 passed, including actual photo decode/resize, invalid files, DOCX tables,
  a locally generated synthetic binary DOC with Unicode, and provider input modality parsing.
- Integration tests: 21 passed, including actual file-processing jobs, model image payload,
  Word context without tools, no binary checkpoint persistence, account/conversation isolation,
  deletion and rejection of photos for a text-only model.
- Browser suite: 10 passed, 2 optional health cases skipped; desktop and mobile web both select
  photo and Word attachments from the start screen, render cards/thumbnail and submit both IDs.
  Browser/provider calls use explicit synthetic fixtures; this is not live vision verification.
- Synthetic screenshots of desktop/mobile, light/dark and attachment composition were inspected.
- Actual local API /health/ready returned database and queue ok. The watch worker restarted with
  the new adapters. No paid OpenRouter generation, real mail/calendar action or remote schema
  change was performed. No commit/push/deployment was performed.

Limits: 20 MiB/file, five attachments/message; 40 MP/photo, 2048 px model image, five most
recent distinct photos in model context; GIF first frame. No HEIC, Word embedded-image/layout
reconstruction, document editing/export or Google Docs link access. These are documented in
SETUP and UX_SPEC. Native device behavior and a live model answer about an attachment remain
unverified. Prior iOS toolchain blocker remains. Full MVP readiness is still not claimed.

Final picker refinement: open the file picker in the user's click gesture, before awaiting
conversation allocation. Cancellation/oversize rejection does not create a chat. The final
photo+Word browser scenarios passed on desktop and mobile after this refinement; client
typecheck and lint passed.

## T09 — Live Gemini photo and Word verification — 2026-11-10

Explicit owner authorization: use the supplied limited test OpenRouter key for real attachment
inference. The key was read from a mode-0600 temporary file, never added to repository files,
logs or the owner's existing application account. Two real requests used
`google/gemini-3.8-flash`, with no tools, under a fresh synthetic Supabase Auth identity.

Both checks traversed the running authenticated API, encrypted credential slot, private signed
upload, actual pg-boss file-processing worker, run queue, attachment hydration, and OpenRouter.
No production mock or injected model result was used. Filename and prompt did not contain
any of the expected control values.

| Input                | Contents known only from the attachment                           | Actual Gemini answer             | Result |
| -------------------- | ----------------------------------------------------------------- | -------------------------------- | ------ |
| `attachment-01.png`  | Printed random code `V-D5916104`, 3 red circles, 2 blue squares   | All three values exactly matched | passed |
| `attachment-02.docx` | Random code `D-25264CB0`, budget 439 EUR, responsible person Лена | All three values exactly matched | passed |

Provider-reported usage (application marks cost as estimated):

- Photo: 1,207 input / 170 output tokens; USD 0.00154275.
- Word: 242 input / 262 output tokens; USD 0.001164.
- Combined: USD 0.00270675, approximately USD 0.0027.

Cleanup succeeded: test OpenRouter credential deleted through the API, both private uploaded
objects removed, synthetic Auth identity deleted, and local temporary key file removed.
Application-account deletion is queued; metadata tombstones remain until signed-upload links'
two-hour expiration to preserve the cleanup invariant. Existing personal account/key were not
changed. No email was sent; an admin-generated test sign-in link was verified locally.

This establishes live photo understanding and DOCX content reading. Legacy DOC decoding has
actual binary-fixture coverage but was not sent in a paid live request. Native device acceptance,
HEIC, embedded Word images and document editing/export retain their previously stated limits.

## T14 — Hosting preparation — 2026-11-11 (not deployed)

The owner explicitly authorized deployment to the existing VPS. Prepared a dedicated chat
hostname, a production web export, private environment staging, separate API/worker systemd
units with memory limits, isolated runtime bootstrap and a release installer that preserves
pushbot. API supports a loopback host bind and graceful signal shutdown. Instructions are
in DEPLOYMENT.md. Local environment and existing encrypted credentials were preserved.

Checks passed: API typecheck, workspace lint, both deployment shell syntax checks and local
Caddy validation in an isolated official Caddy container. Production web export passed and
configured server secrets were absent from its assets. Release archive prepared without `.env`
or node_modules; Linux dependencies are to be installed on the target.

External blocker: root SSH at the supplied address is reachable, but the standard and personal
keys are rejected. Work identities were not used. Asked the owner to add the personal public
key via the provider console. No remote operating-system state, service or app configuration
was changed. Hosted Supabase redirect URL configuration and actual HTTPS/service checks
remain pending access. Do not report the site as published.

## T14 — VPS hosting activated — 2026-11-11

Published `https://chat.72-56-89-122.sslip.io`, release `20261111T095526Z`, on the
owner-authorized existing VPS. Personal SSH identity only. Caddy's old pushbot host and the
bot's inactive/disabled state were preserved; no extra public application port was opened.
The API binds 127.0.0.1:3001. Dedicated systemd API and worker services run unprivileged,
start on boot and restart on failure, with memory limits. Node/pnpm live under an isolated
app toolchain. Installed the missing Ubuntu libatomic1 dependency. Existing Supabase data
and encryption keyring were retained; no schema migration was needed.

Observed production checks:

- Trusted HTTPS, web/callback/deep-link routes 200, readiness database/queue ok.
- Anonymous /v1/profile 401, private /.env 404.
- Real Google SSO completed in the in-app browser and returned to the hosted home screen.
  Owner configured the new Supabase redirect/site URLs.
- Local worker watcher stopped. Through the public API, synthetic photo PNG and actual
  legacy Word DOC uploads were processed to ready solely by the VPS worker. Synthetic
  files/Auth identity removed and application metadata queued for TTL-safe cleanup.
- Initial API/worker memory approximately 69/60 MiB, zero restarts; 432 MiB available out
  of 894 MiB. Current load is a smoke check, not a concurrent-user load test.
- Production web export, secret-value scan, API typecheck, lint, shell syntax and local/remote
  Caddy validation passed. Separate private environment installed root:root 0600.

A successful hosting milestone does not complete all MVP acceptance: iOS toolchain/native
checks, optional Tavily and Gmail/Calendar setup, operational restore drill and the previously
recorded remaining scenarios still apply. No paid resource was created, no paid model request
was made for hosting verification, no work credentials were used, and no Git push was made.

## T13 — Compact response actions — 2026-11-11 (published)

Replaced text Copy and the full-width Retry button with a compact outlined SVG toolbar under
assistant messages: good/bad response, retry, share, and more. Copy is in the more menu;
user messages have a copy icon. Retry remains restricted to the latest terminal response
and still requires confirmation before a new paid attempt. Empty/partial results retain the
appropriate enabled/disabled state. Share uses the OS/web share sheet where available and
copies only the response text as the web fallback; it does not create a public conversation URL.
Reactions are stored on the device under the signed-in account/message ID, with no analytics
transmission or claimed cross-device synchronization. Hover labels and accessible toggle states
are provided. Added the Expo-compatible react-native-svg dependency (15.16.0); native apps
need a rebuild to include it. No native build/smoke is claimed for this change.

Client typecheck, workspace lint and production web export passed. Two browser scenarios
(desktop/mobile web) verified compact width, reaction selection, copy menu, retry confirmation
and clean browser console. Synthetic screenshots were inspected. Excluded the gitignored
.local deployment staging tree from source lint checks.

Published frontend-only release `20261111T102344Z` with a successful secret-value scan.
The web symlink was changed atomically and old hashed chunks were preserved for open tabs.
API/worker were not restarted. Public readiness stayed ok. The updated toolbar was visibly
verified under the owner's existing response on the actual HTTPS site. No paid model request,
external share, schema migration or Git push was performed.

## T13 — Direct copy, motion and Fool loaders — 2026-11-11 (published)

Owner-requested revision supersedes the earlier reaction/more-menu toolbar. Removed ratings,
reaction persistence and the more menu; copy is directly accessible beside retry/share.
User copy now lives below and outside the message bubble. Action icons are 18px with 36px
hit targets; sidebar icons are smaller, with subdued idle opacity and hover feedback.

Added gentle web transitions for controls, message/attachment entry, tooltips and dialogs.
The composer suppresses only its textarea's inner focus outline and replaces it with an outer
animated multicolor conic border. Other focus indicators remain intact. Native composer uses
an animated SVG border. Shared loading indicators now use original vector artwork inspired
by The Fool (traveler, cliff, dog, sun and white flower), with a rocking card and orbiting stars.
Upload/file-processing states also use the card. Browser/native reduced-motion preferences
stop the decorative motion and preserve a static focus boundary. Native code typechecks,
but no native device/build acceptance is claimed.

Checks: client typecheck, workspace lint and production web export passed. Existing desktop
and mobile-web browser scenarios passed (10 tests; 2 environment-gated live-health skips).
A new loading/reduced-motion scenario initially missed model query parameters in its mock
route; corrected the route and reran both projects successfully (2 tests). Screenshots of the
loader and focused composer were inspected. The controls scenario verifies direct copy,
absence of ratings/menu, user-copy geometry, clean browser console and inner outline removal.
No model request or external sharing was performed for this UI revision.

Published frontend-only release `20261111T104706Z` after a production secret-value scan.
Previous chunks retained and symlink switched atomically; backend services not restarted.
Public readiness reports database/queue ok. Actual hosted controls, copy placement and
multicolor composer border were visually verified. No commit or push was performed.

Context behavior confirmed from runtime code: same-chat persisted user/assistant turns and
available attachment references enter subsequent model requests. New chats have independent
context. There is no cross-chat memory or automatic compaction; oversized input fails with
CONTEXT_LIMIT. This is existing behavior, not a change made in this UI task.

## T13 — Markdown table rendering — 2026-11-11 (published)

Fixed the owner's gRPC comparison rendering as sequential paragraphs. markdown-it already
parsed tables; our renderer discarded table/row/cell boundaries. It now renders a table with
consistent column widths, header shading, borders, inline emphasis/code, column alignment,
and horizontal scrolling on narrow screens. Added recursive list/blockquote rendering to
preserve ordered-list starts, nested lists and quotations. Headings retain level sizes.
HTML remains disabled, external Markdown images omitted, and links restricted to HTTP(S).
Existing saved replies are rendered correctly after refresh without another model request.

Checks: client typecheck, workspace lint, production export and secret-value scan passed.
Full desktop/mobile-web suite: 14 passed, 2 environment-gated API-health skips. New synthetic
case verifies table rows/cells/header alignment, actual same-row column geometry, mobile
horizontal overflow without whole-page overflow, numbered/nested lists, unsafe-link rejection
and fenced-code controls. Screenshots inspected. Native uses shared RN layout and typechecks;
no native device smoke/build is claimed. Frontend release `20261111T110052Z`; runtime unchanged,
old hashed chunks retained, no backend restart, migration, paid request, commit or push.

## T13 — Tarot journey and Russian/English UI — 2026-11-11 (published)

Replaced the single-card loader with original vector artwork for all 22 major arcana (0–XXI),
progressing through a gentle overlapping card draw/crossfade. It is decorative, not a progress
percentage. Added six low-opacity drifting home-only cards with a 28-second return cycle,
pointer-transparent and hidden from assistive technology. The composer now keeps a moving
multicolor border while unfocused, with stronger focus. Reduced-motion settings use static
artwork; card animations pause when the app/tab is hidden. No external raster assets used.

Added centralized English/Russian UI chrome translations, accessibility labels and placeholders.
Expo Localization 58.0.5 supplies device language/region; supported language preferences win,
then RU region fallback, otherwise English. No IP lookup/GPS permission. Profile → Region →
Language offers Automatic / Русский / English. Choices persist in profiles.locale and sync
across sessions/devices. API DTO now returns the stored locale rather than a hardcoded English
value. Migration 0003 changes only the default for new profiles and adds supported-value
validation; existing language values are preserved. An attempted bulk conversion of old English
values to Automatic was rejected by automatic approval review; it was removed, not bypassed.

Model output and document text remain in their original language. File/model names and action
payloads are preserved. Repository documentation remains English. Native configuration lists
both languages and includes Expo Localization; native apps need rebuilding. No native runtime
or store acceptance is claimed. Fixed an existing empty-string child warning on Settings found
while visually checking the language switch.

Validation:
- pnpm typecheck and pnpm lint: passed across the workspace.
- pnpm test: 35 passed, including preferred-language/region fallback and locale contract checks.
- Browser regression: 14 existing/Markdown scenarios passed, 2 environment-gated health skips.
  New locale scenario initially exposed a missing web aria-checked attribute; fixed and reran.
  Targeted language + tarot cases: 4 passed across desktop/mobile web; language/clean-console
  scenario rerun after warning fix: 2 passed. Tests check auto Russian, explicit English overriding
  device locale, persistence after reload, returning to auto, always-visible composer border,
  loader advancing from Fool to Magician and static reduced-motion behavior. Screenshots inspected.
- API locale integration against the configured database: 1 passed using an isolated synthetic
  profile, removed in teardown. Verified auto default, ru/en/auto reads across server instances,
  unsupported-language rejection and stale-version protection. No paid provider request.
- Production web export and private-secret-value scan passed. Expo public config resolves.

Published runtime + web release `20261111T111852Z`. Runtime reused unchanged production
backend dependencies and overlaid only server DTO, shared schema and migration changes.
Migration was already applied; remote idempotent migration returned no pending files.
API/worker restarted successfully; public readiness reports database/queue ok. Static symlink
switched atomically with old chunks retained. Live Russian UI/profile save and the home design
were verified; the pre-existing personal English preference was restored after the smoke check.
Git publication was explicitly requested by the owner after completing this update.

Live browser SSO was refreshed during the final smoke check and returned successfully to the
hosted home screen with the restored English preference. Russian and English homepage previews
were captured locally and are not included in the public repository.
