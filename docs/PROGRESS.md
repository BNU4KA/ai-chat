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

## T13 — Composer note, toasts, sign-in cards, sidebar icons, smoother answers — 2026-11-11

Owner UI polish. Published as frontend-only release `20261111T131936Z`. Runtime stays `20261111T111852Z`. The static symlink was switched atomically and the previous web release was kept. API and worker were not restarted. Public readiness reports database and queue ok. The hosted sign-in screen shows the tarot cards and the moving Google button border.

- The OpenRouter balance note under the composer is centered and uses a slightly darker quiet color.
- Save and copy confirmations render as a top-right toast in the app surface, with the greeting accent.
- The sign-in screen uses the same drifting tarot cards as a new chat.
- Sidebar chat, new, and settings marks are drawn icons. The narrow-screen history button uses the same menu mark.
- A streaming assistant reply reveals text in small steps, then catches up. Reduced motion shows the full text at once.
- Shared buttons, the new-chat control, suggestion chips, and language choices use the parchment, gold edge, and ink colors. Danger actions stay red.
- The Google sign-in button has the same moving color border as the composer, drawn thicker so it stays visible on the dark page.

Checks: client typecheck and eslint on the touched files passed. `smooth-text` unit test passed.
Desktop Playwright: Google sign-in, one persisted answer with the copy toast, and the Russian home
scenario passed against synthetic fixtures. Sign-in cards and the expanded sidebar chat icon were
visually checked locally. No provider call or schema change. Commit `6138610` is on `origin/master`.

## T13 — Denser cards, chat actions, faster composer — 2026-11-11

Published as frontend-only release `20261111T135627Z`. Runtime stays `20261111T111852Z`.
The static symlink was switched atomically and the previous web release was kept. API and
worker were not restarted. Public readiness reports database and queue ok. The new layout
bundle includes the thinking line and the smaller composer controls.

- Wide screens show more drifting tarot cards.
- Each chat row can be renamed or deleted through the existing conversation API.
- A sent message appears before the server accepts it. A chosen file shows its name immediately, and the attach control stays the same size.
- Model steps collapse into one shimmering Thinking line and open into a short list. They are no longer repeated as large cards under the answer.
- Attach, tools, model, and send are smaller, transparent, and outlined in the moving colors.

Checks: client typecheck and eslint on the touched files passed. A synthetic browser session confirmed the denser home cards, the 32px transparent composer controls, a collapsed Thought line that opens the tool list, and the rename/delete row menu. The file-picker timing could not be driven by the automated picker. No provider call or schema change. Commit `67b14e7` is on `origin/master`.

## GitHub web deploy — 2026-11-11

A dedicated deploy key can log in to the VPS as root. Its private half is stored as the `SSH_PRIVATE_KEY` Actions secret. `deploy/publish-web.sh` switches the static release and does not restart the API or worker. `.github/workflows/deploy-web.yml` builds the web client after CI succeeds on `master`. The other Actions secrets are `SSH_HOST`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Server secrets stay in `/etc/ai-chat/server.env`. Client typecheck on CI was failing because React Native's types omit web hover state and CSS width transitions; `apps/client/src/react-native.d.ts` adds those fields. Local client typecheck passed after that change. CI run `43041714287` then passed, and Deploy web run `43041953787` published `/srv/ai-chat/releases/20261111T144829Z`. Public readiness still reports database and queue ok. API and worker were not restarted.

## T15–T19 — Functional expansion — 2026-11-11 (in progress)

Owner requested all eight main and five additional proposals. Scope and acceptance are recorded
in EXPANSION_SPEC.md. Existing foundation inspected; Git working tree was clean. Context Engine
is unavailable in this session, so source inspection uses rg and direct reads. No deployment,
provider writes, paid model request, commit or push is part of this implementation pass.

## T15–T19 — Implemented workspace expansion — 2026-11-12 (local, unpublished)

Implemented T15: migration 0004, forced RLS/composite ownership, project CRUD and editable memory,
explicit ready-file shares/revocation, opt-in conversation membership, owned message search with
snippets/context links, non-destructive message-edit branches and reviewed context-note boundaries.
Original messages remain intact. Conservative long-context warnings offer review before overflow.
Project material is re-read before model requests and remains untrusted data. Shared-file removal
cancels active consumers; original-chat purge clears cross-chat source FKs/excerpts. Account purge
removes all new owned records. No automatic paid summarization is introduced.

Implemented T16: persisted editable documents, optimistic versions and immutable revisions,
verified UTF-16 range replacement, Markdown/escaped HTML export, model-assisted revision drafts,
and response save/Explain/Shorten/Check controls. Desktop uses a side dock; narrow screens use a
full working panel. Private draft handoffs are one-use/account-bound memory, cleared on account
change/sign-out, and are never put in URLs. Export shares text through native Share and downloads
files on web. Native runtime has not been exercised.

Implemented T17: editable workflow starters for meeting preparation, research comparison, daily
planning and weekly review; research-mode runtime instructions; claim citations open persisted
source evidence with excerpts/retrieval dates; PDF downloads retain actual page fragments.
Revising an action validates strict tool arguments and the current grant, cancels the old proposal,
preserves an audit record/expiry, replaces the continuation's arguments and requires fresh approval.
Concurrent confirmations execute only the revised action once in synthetic tests.

Implemented T18: decimal catalog-price estimates, per-run caps checked/reserved before every
model submission, unknown-price refusal for capped work, exact aggregation of confirmed provider
usage (including scientific-notation decimal inputs) and unknown-total preservation. Estimates and
actual provider charges remain separate. Daily/weekly schedules use local wall times/IANA zones,
DST-gap skip/fold deduplication, occurrence-scoped idempotency plus durable run reconciliation,
pause/delete/history and persisted completion/failure/approval notices. Missed periods coalesce.
Primary-calendar slot suggestions respect duration, buffers, working hours and timezone and never
guess attendees' availability. A selected slot prepares a draft; writing still requires approval.

T19 automated verification: commands/results are recorded in verification/WORKSPACE_EXPANSION.md.
Initial checks ran on shell Node 24.13.0; final checks were deliberately repeated with the pinned
Node 26.13.0 / pnpm 12.18.0. Tests use a disposable localhost PostgreSQL 15 database and synthetic
keys/OAuth/model/tool/storage fixtures, with business operations under app_api/app_worker roles.
No real model generation, email, calendar mutation, deployment, paid provisioning, commit or push.

Issues found and fixed during validation: a deletion-path patch regression; test fixtures using the
wrong scripted-model call shape; synthetic tests exhausting their own per-minute run quota; an
incorrect dialog selector and hidden Expo-screen locator; raw text arrays in RN buttons; source
cleanup after cross-chat file sharing; partial usage being mistaken for a fully confirmed total.
Offline dependency installation lacked a local tarball; an approved install restored dependencies
and linked only the already-existing internal runtime package into API. No new external dependency.

External configuration/remaining limitations: real-provider journeys require authorized sandbox
OpenRouter/Tavily/Google credentials and test accounts; no real writes were used as evidence.
Native iOS/Android builds/smoke and original release/restore gates remain unverified. Notifications
are in-app, context compression uses a reviewed note, exports are Markdown/escaped HTML, and PDF
page opening depends on the platform viewer. Existing quotes remain in historical answers when a
source file is deleted. Budget checks guard estimates and do not guarantee provider billing.

Next task: T19 native/live acceptance and owner-reviewed deployment. Apply migration 0004 only
when preparing an authorized target release; this pass migrated the disposable test DB only.

Final results on Node 26.13.0 / pnpm 12.18.0: typecheck passed, lint passed, 45 unit tests passed,
35 integration tests passed, 26 browser tests passed with two opt-in live-health skips, production
web build/export passed, and git diff --check passed. Synthetic desktop/mobile screenshots were
visually inspected after the dynamic-button/rendering fix. Full evidence and limitations are in
verification/WORKSPACE_EXPANSION.md. New functionality is implemented with automated evidence;
T19 remains live/native/release-blocked, not a production-readiness claim.

## T19 — Review regressions and shared styling — 2026-11-12 (local, in progress)

Owner requested fixes for all six review findings and a visual consistency check. Implemented:
weekly DST-gap search across a skipped week and isolated invalid schedules; atomic pause/delete
checks inside run creation; paused-before-limit filtering; owner-scoped deletion of projects with
soft-deleted chats; unchanged/omitted calendar PATCH preservation; paginated project-document
listing/reading with version/ownership checks and source references (migration 0005).

Schedule maintenance now has a separate worker timer and pending quota-delayed periods coalesce.
The existing chat model catalog renderer is shared with schedules. Workspace navigation and
selected controls reuse Settings colors/outlines, editor/response secondary actions are quieter,
and layout is checked on desktop/mobile in both themes. Native runtime and live providers remain
outside this local verification. No deployment, real provider write, commit or push is authorized.

Initial new checks: 19 expansion API/runtime integration scenarios passed on disposable
PostgreSQL 15 with synthetic provider/storage/Auth fixtures. A visual test initially selected two
Settings buttons on desktop; scoped it to the header. Shared proposal-form helpers were moved
to contracts after API typechecking correctly rejected importing client CommonJS sources.
Current typecheck passes; final full checks and screenshot evidence are recorded below when done.

T19 correction results: all six review regressions now pass. Final Node 26.13.0 / pnpm 12.18.0
checks: typecheck and lint passed; 48 unit tests passed; 41 integration tests passed (19 expansion
scenarios) on disposable PostgreSQL 15; 36 desktop/mobile browser tests passed with two optional
live-health skips. Production web build/export and git diff --check passed. Shared Settings versus
workspace screenshots were visually inspected in light/dark desktop/mobile layouts; the final
workflow-label cleanup refreshes six focused visual scenarios. Evidence is in
verification/WORKSPACE_EXPANSION.md. Migration 0005 and two scoped project-document read tools
are new; account/document/source deletion paths are covered. All providers and Auth/Storage
cleanup are synthetic in these checks. No deployment, production migration, commit or push.

Next task remains T19 native/live acceptance and owner-reviewed release. Do not repeat the six
fixed defects as unresolved findings; retain the regression scenarios when editing these paths.

## Git publication — 2026-11-12

Owner explicitly requested commit and push of the expansion and review fixes. Publishing to
`codex/workspace-expansion`; `origin/master` has newer independent UI changes and an automatic
web deployment workflow. This branch preserves both histories without changing master or
triggering its deployment. The verification evidence above applies to this branch before integration with master.

## Merge with master UI — 2026-11-12

Merged `origin/master` into `codex/workspace-expansion`. Workspace tools, citation evidence,
quiet actions, and source cards stay, together with the thinking trace, optimistic send,
parchment buttons, and smooth assistant text.

Checks: `tsc --noEmit` passed in contracts, database, integrations, agent-runtime, services, api,
worker, and client. ESLint passed on `chat.tsx`, `markdown.tsx`, and `ui.tsx`. `vitest run` passed
49 tests. Node v24.2.0; the pinned pnpm 12.18.0 shim returns ENOEXEC on this machine, so
`pnpm typecheck` itself was not the runner. Integration and browser suites were not rerun.

## Secondary screens as dialogs — 2026-11-12

Settings, the OpenRouter key, Gmail/Calendar connections, account deletion, and the workspace
open in a dialog over the current chat. Old URLs redirect to `/?panel=...` and keep a document
id. Google sign-in, `/auth/callback`, and `/auth/integration` are unchanged. Creating a project
stays the form on the Projects tab inside the workspace dialog.

Checks: client `tsc --noEmit` passed. ESLint passed on the touched client files. Playwright
desktop scenario for settings, Gmail/Calendar, and typed account deletion passed against a
synthetic API. Node v24.2.0. The full browser suite was not rerun.

## Cool chrome, parchment on the cards — 2026-11-12

Shared buttons, the new-chat control, suggestion chips, and language choices use the cool
surfaces and blue accent. Parchment and gold remain on the tarot artwork and the loader.
Client `tsc --noEmit` and ESLint on the touched files passed. The already-running web server
was still serving the previous parchment button colors, so this pass was not rechecked in that
browser session.

## Header tools and quieter dialogs — 2026-11-12

Work tools and Projects & tasks sit in the chat header beside the profile control. The work-tools
sidebar closes with a close control, not a selection-styled button. Dialog sections use a heading
and an information control instead of nested bordered cards. Buttons are shorter. A missing server
route now says the server does not support that request yet. `origin/master` still has no
workspace routes, so a client of this branch talking to that API cannot load projects until the
API is deployed. An empty or non-uuid document parameter no longer requests `/v1/documents/`.

Checks: client `tsc --noEmit` passed. ESLint passed on the touched client files. Playwright desktop
passed workspace persistence, work tools, settings and account deletion, long-context advice,
Russian workspace navigation, and opening a document citation. Node v24.2.0. The full browser
suite was not rerun. No local API was listening on port 3001, so this was not checked against
the hosted server.

## Composer, settings density, and context copy — 2026-11-12

The composer grows with the draft up to 200px. Quiet and secondary buttons keep a border and a
raised fill so header and settings actions stay visible. Calendar timezone is a dropdown and saves
on change. Settings puts the account, key actions, and the connections/data actions on rows.
The context note explains the cutoff in words and no longer asks for a message sequence. The
workspace “server does not support that request” text is still the 404 from an API without the
workspace routes; this branch has the routes, and the published master API does not.

Checks: client `tsc --noEmit` passed. ESLint passed on the touched client files. Playwright desktop
passed settings, the context-note sidebar, and Russian workspace navigation. Node v24.2.0.

## T13 — ChatGPT UI/UX redesign — 2026-11-12

Replaced the Gemini/tarot presentation with the owner-approved ChatGPT UI Kit direction while
preserving existing client behavior and server contracts. The client now uses shared monochrome
light/dark tokens, a 60/260 px responsive sidebar, a compact header, a floating composer,
borderless assistant responses, restrained user bubbles, responsive dialogs, neutral skeletons,
inline activity marks, compact attachments, and consistent settings/workspace surfaces. Desktop
hover expansion still overlays chat without moving it; pinning, search focus retention, mobile
drawer dismissal, streaming/reconnect, optimistic send, files, tools, approvals, sources,
workspace, localization, reduced motion, and accessibility states remain intact.

Removed the three tarot implementation files and all runtime references. No endpoint, database
schema, provider behavior, dependency, or unsupported Figma capability was added. Voice and image
generation remain outside scope. The updated UX contract records the new visual direction.

Verification on Node v24.2.0:

- Client `tsc --noEmit`: passed.
- ESLint on all changed client and browser-test files: passed.
- Unit suite: 49 passed across 14 files.
- Full Playwright desktop/mobile-web suite: 36 passed, 2 opt-in live-health checks skipped.
- Targeted post-adjustment attachment scenarios: 2 passed.
- Production Expo web export: passed.
- `git diff --check`: passed.

The first sandboxed browser run could not launch Chrome because process control was denied; the
same full suite passed outside that sandbox. No native device/build smoke, provider request,
deployment, production migration, commit, or push was performed. T19 native/live acceptance and
owner-reviewed release remain the next task.

Follow-up browser comparison against the current public `chatgpt.com` found that the first dark
palette was too light. Computed production styles use #000000 for the canvas/sidebar, #212121 for
the composer, and a 15% white sidebar border. The client tokens and visual assertions now match
those values. Eight focused desktop/mobile browser scenarios for the sidebar, localized home,
workspace themes, and Russian workspace styling passed after the correction.

The follow-up parity pass inspected the current anonymous ChatGPT composer and attempted two
neutral prompts. Both public generations ended with ChatGPT's own “Chat stopped unexpectedly”,
including one retry, so no authenticated successful-response state is claimed as live evidence.
The client now matches the observed 52–60 px one-row composer geometry, 768 px content column,
compact suggestion pills, 44 px circular send/stop controls, 18 px user bubble, role-label-free
message layout, desktop sidebar divider, bounded mobile action menu, and rounded error state.

Post-pass verification on Node v24.2.0: client `tsc --noEmit`, ESLint on the touched client and
browser-test files, 49 unit tests across 14 files, 36 Playwright desktop/mobile-web scenarios
with 2 opt-in health checks skipped, production Expo web export, and `git diff --check` passed.
The final sidebar-menu regression passed separately on desktop and mobile after adding viewport
clamping and a 44 px action target.

The motion follow-up inspected the current public ChatGPT CSS and matched its loading/streaming
behavior: skeletons now shimmer from -100% to 250% over 1.4 seconds on web and native, streamed
text reveals the newest short segment without breaking citations or long unspaced scripts, and
drawer, dialog, message, attachment, composer, button, and toast transitions use the same short
restrained timing. The mobile drawer now animates both entrance and exit while remaining mounted
for dismissal. Reduced-motion disables decorative movement without hiding toast content.

Verification: client `tsc --noEmit`, ESLint on all motion-related files and browser tests,
50 unit tests across 14 files, 36 Playwright desktop/mobile-web scenarios with 2 opt-in health
checks skipped, production Expo web export, and `git diff --check` passed. The drawer regression
also passed separately on desktop and mobile after the final lifecycle adjustment.

The dropdown/menu parity pass matched ChatGPT popover motion: context menus scale in from 0.86 over 0.22s with a 20 px radius and soft shadow, selection lists use borderless hover/selected rows with checkmarks, Choice chips share the same soft selection surface, and timezone picking uses the same animated dialog list on every platform. Reduced-motion still collapses decorative transitions without hiding content.

## T13 — ChatGPT Web UI/UX alignment (merge with origin) — 2026-11-13 (local)

Merged `origin/codex/workspace-expansion` (including `.github/workflows/deploy-web.yml`,
`deploy/publish-web.sh`, `api.ts`, `upload.ts`, `motion.ts`, `react-native.d.ts`, and `toast.tsx`)
with local commit `bd8409a` ("redesign"):

- Kept the owner-approved graphite dark (`#212121` / `#181818` / `#303030`) and light (`#ffffff` /
  `#f9f9f9` / `#f4f4f4`) ChatGPT palettes and brand string `"it's kawasaki, bitches"`.
- Replaced Tarot background, Tarot card loader, and rainbow conic-gradient composer border with
  ChatGPT-style pulsing thinking dot, streaming cursor, circular ring spinner, single-line 52 px
  pill composer that expands to multiline on wrap/attachments, message/menu/popover/drawer
  entrance animations, hover action reveal, and custom scrollbars (`web-effects.web.tsx`,
  `composer-frame.tsx`, `fool-spinner.tsx`).
- Added crisp SVG icon set (`chatgpt-icons.tsx`), date-grouped sidebar with hover/active `···`
  rename/delete menu, centered `SearchModal` (`Cmd/Ctrl+K`), two-column `SettingsModal`, top-left
  floating model dropdown popover, syntax-highlighted code blocks, inline user message editing,
  icon-only assistant action toolbar (`Copy`, `Retry`, `Share`, `···`), and persistent-sidebar
  `/workspace` layout.

Checks on Node 26.13.0 / pnpm 12.18.0 (synthetic API/provider fixtures; no live OpenRouter/Google
generation, no native device test, no deployment, no push):

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm test:e2e --reporter=list`
  (re-run after merge).

## T13 — UI/UX polish pass (sidebar popover, tools dialog, smooth streaming, skeleton, transient tool pills) — 2026-11-13 (local, uncommitted)

- Sidebar `···` menu (`sidebar.tsx`): renders inside a floating `Modal` anchored beside the
  row (`measureInWindow` with viewport clamping) instead of inline, so opening it never shifts
  conversations downward.
- Tools & conversation dialog (`chat.tsx`, `ui.tsx`): replaced invisible/stretched buttons with
  grouped ChatGPT rows, animated pill toggle switches for `Web research` / `Photos & files` /
  `Gmail` / `Google Calendar`, and clean left-aligned `Conversation files`, `Rename conversation`,
  and `Delete conversation` rows.
- Tool activity pills (`chat.tsx`): rendered as compact inline pills only while the run is active
  (or if a tool ends `unknown`/`failed`) and hidden cleanly once the run finishes with succeeded
  tools.
- Smooth streaming (`chat.tsx`, `smooth-text.ts`): wrapped pending assistant Markdown in
  `StreamingMarkdown` using `revealStep` at 60 fps (`requestAnimationFrame` on web) for fluid
  token-by-token reveal while respecting `prefers-reduced-motion`.
- Thinking skeleton (`fool-spinner.tsx`, `web-effects.web.tsx`): added 3 animated shimmer
  response-line skeleton bars (`ThinkingSkeleton`) beneath `Thinking…`.

Checks on Node 26.13.0 / pnpm 12.18.0 (synthetic fixtures; no live provider, native build,
commit, or push):

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `git diff --check`: passed.
- `pnpm test:e2e --reporter=list`: 38 passed (`desktop` + `mobile-web`), 2 skipped (live health);
  verified side-positioned popover, tools dialog, thinking skeleton + transient tool pill, and
  updated screenshots visually inspected.
