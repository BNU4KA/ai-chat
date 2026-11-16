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
- Smooth streaming (`chat.tsx`, `markdown.tsx`, `web-effects.web.tsx`, `smooth-text.ts`):
  paced streaming reveal at ~1 char/frame (gentler burst cap `gap / 18`) with smooth post-completion
  catch-up and per-word trailing fade (`splitStreamTail` + `chatgpt-tail-in`) while respecting
  `prefers-reduced-motion`.
- Thinking skeleton (`fool-spinner.tsx`, `web-effects.web.tsx`): added 3 animated shimmer
  response-line skeleton bars (`ThinkingSkeleton`) beneath `Thinking…`.
- Removed the bottom `Sources` panel (`chat.tsx`); inline `[S1]` citation links still open the
  `Source evidence` dialog.
- Disabled `Library`, `Scheduled`, and `Notifications` sidebar items with a `"Coming soon"` hover
  tooltip (`sidebar.tsx`).
- Added account-scoped chat pinning (`pinned-chats.ts`, `sidebar.tsx`, `chat.tsx`, `workspace.tsx`,
  `chatgpt-icons.tsx`) with a `Pinned` section at top and `Pin` / `Unpin` actions in the sidebar
  row menu and conversation dialog.
- Removed the duplicate top-right profile avatar button from chat and workspace headers (`chat.tsx`,
  `workspace.tsx`), keeping profile & Settings at the bottom-left of the sidebar.
- Replaced fixed single-line textarea height with live `scrollHeight` / `onContentSizeChange`
  auto-expansion in a stable unremounted wrapper (`chat.tsx`), preserving cursor/focus when
  wrapping between 1-row and multi-row composer states.
- Added smooth FLIP glide transition (`360 ms cubic-bezier(0.22, 1, 0.36, 1)`) from centered home
  composer to bottom-docked active thread without unmounting the page (`window.history.replaceState`
  on web).

## T06/T08/T13 — Concise prompt, Popular models, switch_model, and generate_image — 2026-11-13 (local, uncommitted)

- Updated `SYSTEM` prompt (`packages/agent-runtime/src/execute.ts`) for concise, concrete,
  zero-fluff default replies (expanding only on complex tasks or explicit detail requests).
- Set default conversation model to `anthropic/claude-haiku-5.5` (`packages/contracts/src/schemas.ts`,
  `apps/client/src/chat.tsx`).
- Added `Popular` (`Самые популярные`) section at the top of `ModelList` (`apps/client/src/model-list.tsx`,
  `apps/client/src/popular-models.ts`) showing the 3 configured preferred models:
  `anthropic/claude-haiku-5.5`, `google/gemini-3.8-flash`, and `openai/gpt-5.4-mini`.
- Added built-in `switch_model` and `generate_image` tools (`packages/contracts`,
  `packages/integrations`, `packages/services`, `packages/agent-runtime`, `apps/worker`):
  - `switch_model`: matches OpenRouter catalog entries by name/ID and updates `conversations.model_id`
    when explicitly requested in chat; client refreshes active conversation metadata on completion.
  - `generate_image`: defaults to `google/gemini-nano-banana-2.1` (with Flash/Mini fallbacks) among
    image-output OpenRouter models (`supports_image_output`), calls OpenRouter `modalities: ['image', 'text']`,
    stores the generated image in private Supabase Storage linked to the assistant message via
    `files` + `message_files`, and renders a large preview in `Attachment` (`apps/client/src/attachment.tsx`).
- Also passed `supportsTools` through `tool_snapshot` (`repo.ts`, `server.ts`, `models.ts`) so
  text-only models never receive tool definitions.

Checks on Node 26.13.0 / pnpm 12.18.0 (synthetic OpenRouter/storage fixtures; no live paid image
generation or live model switch run performed; no commit or push):

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (15 files, 52 tests), `pnpm build`, `git diff --check`: passed.
- `pnpm test:e2e --reporter=list`: 40 passed (`desktop` + `mobile-web`), 2 skipped (live health).

## T13 — Persistent sidebar switching, chat skeleton, modal layering, and brand animation — 2026-11-13 (local, uncommitted)

- Persistent chat switching (`chat.tsx`): tracked `activeId` + `window.history.replaceState` +
  `popstate` on web so switching between chats or starting a new chat updates only the thread area
  without remounting the sidebar or reloading the page.
- Chat loading skeleton (`fool-spinner.tsx`, `chat.tsx`): replaced full-screen `<Loading />` during
  `chat.isPending` / initial `messages.isPending` with inline `ChatThreadSkeleton` inside the thread
  area while keeping the sidebar and header mounted.
- Opaque message popover (`message-actions.tsx`): moved `More message actions` (`···`) menu into
  a viewport-clamped `Modal` (`measureInWindow`) so `RunUsage` and adjacent elements never bleed
  through it.
- Disabled sidebar items (`sidebar.tsx`): strengthened disabled styling (`opacity: 0.38`,
  `cursor: not-allowed`) on `Library`, `Scheduled`, and `Notifications` with `zIndex: 999`
  `"Coming soon"` hover tooltip.
- Top-right header cleanup (`chat.tsx`): removed duplicate `Work tools` and `Projects & tasks`
  header buttons; `Work tools` is accessible inside `Conversation menu` (`···`) and `Projects` stays
  in the sidebar.
- Brand click Easter egg (`sidebar.tsx`, `web-effects.web.tsx`): clicking `"it's kawasaki, bitches"`
  triggers a 950 ms barrel-roll + neon glow (`kawasaki-party`) and emoji burst (`kawasaki-particle`),
  honoring `prefers-reduced-motion`.

Checks on Node 26.13.0 / pnpm 12.18.0: `pnpm exec vitest run --config vitest.config.ts` (15 files,
52 tests), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check` passed; `pnpm test:e2e
--reporter=list` passed 42 scenarios (`desktop` + `mobile-web`, synthetic fixtures), 2 skipped.

## T08 — Tavily primary + OpenRouter web-search fallback — 2026-11-13

- Added `searchWebOpenRouter` (`packages/integrations/src/openrouter.ts`) using OpenRouter's
  `plugins: [{ id: 'web', max_results }]` and `url_citation` annotations.
- Updated `searchWeb` (`packages/integrations/src/tavily.ts`) to surface `TavilyError` with
  `fallbackable` status on `401/402/403/429/432/433/434/5xx`, enable `include_published_date`,
  and preserve up to 1,200 chars of excerpt per hit per Tavily's `/search` OpenAPI spec.
- Updated worker `searchWeb` port (`apps/worker/src/index.ts`) to use `TAVILY_API_KEY` when
  configured and automatically fall back to `searchWebOpenRouter` when Tavily is missing, invalid,
  rate-limited, or out of credits.
- Updated API `/v1/capabilities` and `defaultTools()` (`apps/api/src/server.ts`) so `web` is
  always available and enabled by default for new chats.
- Added owner-supplied `TAVILY_API_KEY` only to gitignored local `.env` (not tracked in Git).

Checks on Node 26.13.0 / pnpm 12.18.0: live smoke call to `https://api.tavily.com/search` via
`searchWeb` returned 2 results with URLs and excerpts; `vitest` (15 files, 53 tests), `pnpm typecheck`,
`pnpm lint`, `pnpm build`, `pnpm test:e2e --reporter=list` (42 passed, 2 skipped), and
`git diff --check` passed. (OpenRouter fallback tested with synthetic fixtures; no live OpenRouter
web-search request performed.)

Committed as `139403c` on `codex/workspace-expansion` and pushed. Production runtime
`20261113T200404Z` is the previous runtime with the search changes applied: Tavily first, OpenRouter
web-plugin fallback, and `web` available for new chats. `TAVILY_API_KEY` is in `/etc/ai-chat/server.env`.
API and worker were restarted; public readiness returned database and queue ok. The static web release
was left unchanged. Previous runtime `20261111T111852Z` remains on disk for rollback.

Checks on Node 26.13.0 / pnpm 12.18.0 (synthetic fixtures; no live provider, native build,
commit, or push):

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `git diff --check`: passed.
- `pnpm test:e2e --reporter=list`: 38 passed (`desktop` + `mobile-web`), 2 skipped (live health);
  verified side-positioned popover, tools dialog, thinking skeleton + transient tool pill, and
  updated screenshots visually inspected.

## Admin panel — managed OpenRouter keys — 2026-11-13

Administrators listed in `ADMIN_EMAILS` can store encrypted server OpenRouter keys, assign one
key to a user, and schedule that user's existing account purge. Chat and the model catalog use
the personal key when it exists, otherwise the assigned server key. Runs record `keySource` and
`managedKeyId`. Ordinary clients never receive the server secret or its `last_four`.

Checks on Node 26.13.0, local Postgres container `ai-chat-pg` at `127.0.0.1:54329` (synthetic
keys only; no live OpenRouter call):

- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test`: 53 passed across 15 files.
- `DATABASE_URL=postgres://postgres@127.0.0.1:54329/ai_chat pnpm test:integration`: 42 passed
  across 7 files, including admin access, key priority, RLS denial for `app_api`, and
  `account.purge` outbox insertion.
- Signed-in browser pass of `/admin` was not run: the screen requires an admin session.
- Hosted migrations `0004`–`0006` are applied.
- Commit `d6d974b` is on `codex/workspace-expansion`. Production release `20261113T211213Z`
  is the current API, worker, and web. The first install was OOM-killed during `pnpm install`
  on the 894 MB VPS; a 2 GB swap file was added, and the retry passed. Readiness returned
  `database` and `queue` ok. Unauthenticated `GET /v1/admin/users` returned 401. The public
  admin bundle returned 200. `ADMIN_EMAILS` is set in the server environment and visible to
  the API process. The owner account is the only admin.

## Admin tables and key priority — 2026-11-13

Keys and users render as tables. Adding a key and assigning one open dialogs. `profiles.key_priority`
is `personal` or `server` (default `personal`). Server priority uses the assigned server key; otherwise
a personal key wins, then a server key. Credential status includes `has_personal_key` so a saved
personal key can still be removed while a server key is in use.

Checks on Node 26.13.0, local Postgres `ai-chat-pg` at `127.0.0.1:54329` (synthetic keys only):

- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test`: 53 passed across 15 files.
- `pnpm test:integration`: 42 passed across 7 files, including server priority overriding a personal key
  and an omitted priority leaving the stored value.
- Signed-in browser pass of the new tables was not run.
- Hosted migration `0007_key_priority.sql` is applied. Production release `20261113T213243Z` is the
  current API and worker. Readiness returned `database` and `queue` ok. The public admin
  bundle containing the tables returned 200.

## Admin dialog layout — 2026-11-13

Key and priority choices in the admin dialogs are full-width rows, and the dialog actions sit
on the right under a divider. This is a web-only release. API and worker stayed on
`20261113T213243Z`.

- Web export secret scan of `apps/client/dist` passed, and the bundle contains the public site origin.
- Production web release `20261113T214810Z` published the dialog styles. Public readiness returned
  `database` and `queue` ok. The public admin bundle returned 200.

## Admin navigation layout — 2026-11-13

The keys table is the same width as the users table. Section switching is a left-hand list, matching
the settings dialog. API and worker stayed on `20261113T213243Z`.

- Web export secret scan of `apps/client/dist` passed.
- Production web release `20261113T220213Z` published the side navigation. Public readiness returned
  `database` and `queue` ok. The public admin bundle returned 200.
- The side options were then lowered. Web release `20261113T220409Z` published that offset.
- The divider was lowered with the options. Web release `20261113T220614Z` is current. Public
  readiness returned `database` and `queue` ok. Bundle `admin-da3015be1ef96bff9712fb57bc76b641.js`
  returned 200. Signed-in click-through of the live page was not run.

## 001 — Mobile and web polish — 2026-11-14 (local, uncommitted)

Spec: `specs/001-mobile-web-polish/` (T001–T046). The Word/PDF feature is deferred to a separate spec.

- Launch theme: the splash screen is held until the theme resolves, and native backgrounds follow the
  system scheme.
- Chat layout: the thread has no background. The header and composer dock float with gradient fades,
  and content scrolls under them. Native uses `KeyboardChatScrollView` and `KeyboardStickyView`
  from react-native-keyboard-controller. Web uses a plain `ScrollView`.
- Drawer: a new `conversation-drawer.tsx` uses Reanimated with gesture-handler v3 pan gestures. It
  covers the header and has no empty top inset.
- Motion: Reanimated entering animations for the optimistic message, the thinking skeleton, the
  photo fade-in and the copy icon. expo-haptics fires on send, edit and copy. Reduced motion is
  respected. The CSS keyframes they replaced were removed.
- Generated images: the run snapshot is invalidated when a run finishes, so the image appears
  without re-entering the chat.
- Copy: the button turns into a check labelled "Copied". No text notice.
- Edit in place (owner decision, replaces branch-on-edit): `POST /v1/messages/:id/edit`, migration
  `0008_message_supersede.sql` (`messages.superseded_at`). Any visible user message can be edited.
  Later messages are superseded and filtered from lists, tail, lease input, search, context,
  branch copy, compaction and estimate. Compaction resets when the edited turn is covered by it.
  The client updates the cache optimistically and expands the edit field smoothly.
- iOS warnings: a Podfile post-install step inhibits warnings in pod targets.

Checks (Node v24.2.0, pnpm 12.18.0 native binary, local `postgres:15` container on port 54329):

- `pnpm typecheck` and `pnpm lint`: passed.
- `pnpm test`: 54 passed across 16 files.
- `pnpm test:integration`: 43 passed, including the new edit test. It covers 422, a 404 for another
  owner, idempotent replay, a 409 while a run is active, hidden later turns, search, and the model
  input excluding superseded text.
- `pnpm test:e2e`: 27 passed, 2 skipped, 15 failed. All 15 failures also occur on the owner's
  staged sidebar redesign without these changes (Settings moved into the profile menu, and the
  "Coming soon" tooltip). The rewritten edit test, the copy test and the mobile drawer test pass.
- `expo prebuild --platform ios` and `pod install`, then `xcodebuild` Debug for the iOS simulator:
  BUILD SUCCEEDED. Unique located warnings dropped from 242 to 56. The rest come from headers in
  prebuilt Expo and React frameworks (nullability, ExpoFileSystem, RCTMultipartDataTask).
- `git diff --check`: clean.

Not run: a native device or simulator session (haptics, keyboard, launch theme), migration `0008`
on hosted Postgres, and any deploy. Next: update the e2e tests for the owner's sidebar redesign,
then the Word/PDF document feature spec.

## Chat and sidebar render performance — 2026-11-14 (local, uncommitted)

Owner reported input freezes on iOS. The cause was whole-screen re-renders of `ChatWorkspace`.

- The drawer mounts its content only while open or animating (previously the hidden sidebar
  re-rendered on every keystroke).
- `ComposerInput` (`composer-input.tsx`) owns the text and height. The screen keeps the draft in a
  ref and re-renders only when has-text, multiline or tall flips (`composer-shape.ts`).
- `ConversationSidebar` is memoized and receives stable handlers. Lists are memoized.
- Streaming: SSE deltas are batched every 32 ms. The screen subscribes to the run without the live
  text, and `LiveMessageContent` renders the text inside the message row. The reveal step runs
  every 33 ms instead of every frame.
- The greeting color loop moved from the JS driver to Reanimated.
- Polling relaxed: conversation lists and files 30 s, runs 10 s, notices 30 s, capabilities 60 s.
- Source evidence excerpts render as plain text (`excerpt.ts`).

Checks: `pnpm typecheck`, `pnpm lint` passed. `pnpm test`: 56 passed. `pnpm test:e2e`: 27 passed,
2 skipped, 15 failed. All 15 are the known failures from the owner's sidebar redesign. The send and
stream test reaches its final Settings assertion. Device check with Perf Monitor in a Release
build is still pending.

## Chat Word/PDF creation, Word/PDF edits, and photo edit — 2026-11-15 (pushed to master)

Spec: specs/002-chat-docs-photo-edit (tasks T001–T038). Owner decisions applied: new file on every
edit, structure preservation attempted with honest fidelity, generative photo edit, and no workspace
document versions. Chat attachments only; nothing is emailed, uploaded or shared.

Implemented:

- Three builtin `files`-group tools, not write-approval tools: `create_document` (DOCX/PDF from
  structured blocks), `edit_document` (new DOCX/PDF from a conversation Word/PDF), and `edit_image`
  (new PNG/JPEG/WebP from a conversation photo). Schemas, descriptions, dispatch and system guidance
  are in agent-runtime. Availability follows the wired ports, as for `generate_image`.
- Migration `0009_file_derived_from.sql` adds `files.derived_from_file_id` (ON DELETE SET NULL).
- `saveAssistantFile` generalizes the image save path (quota, storage fail-closed, message link,
  lineage, text chunks so `read_file`/`search_files` see created documents). `saveGeneratedImage`
  is a thin wrapper.
- DOCX/PDF builders in `packages/integrations/src/documents`. PDF embeds DejaVu Sans (Cyrillic is
  required by the bilingual UI; pdf-lib standard fonts cannot draw it).
- Word structure reader (headings, paragraphs, lists with bullet/number detection, tables) runs in the
  existing isolated extraction child, with bounded unzip and XML size. Embedded pictures, text boxes,
  long text/tables are reported as unsupported.
- `edit_document`: source must be ready and in this conversation; legacy .doc → UNSUPPORTED_FILE; the
  conversation's model rewrites the structured content as JSON; output is validated with zod; empty or
  invalid output is a PROVIDER_ERROR with no file. `fidelity` is `structure_preserved` only for DOCX→DOCX
  with no unsupported elements and no lost headings, lists or tables; otherwise `best_effort` with notes.
  PDF sources are always `best_effort`.
- `edit_image`: source must be a conversation PNG/JPEG/WebP. Animated GIF is refused with
  UNSUPPORTED_FILE (the spec allows refusal). The normalized (metadata-stripped, ≤2048 px) photo is sent
  to OpenRouter as `input_references`. Model: catalog models that accept and output images (preferred
  list first). The original photo is never changed.
- Worker ports wired with the run-pinned key (`readRunKey`); missing or mismatched key → KEY_MISSING.

OpenRouter validation (official docs fetched 2026-11-15, image-generation guide): image editing uses
`POST /api/v1/images` with `input_references: [{type:"image_url", image_url:{url}}]`, result in
`data[0].b64_json`, cost in `usage.cost`. The adapter does not trust the declared media type and sniffs
PNG/JPEG/WebP bytes. Create/edit text revision uses non-streaming chat completions with JSON response
format. Live OpenRouter behaviour has NOT been exercised.

Dependencies (integrations): `docx@9.15.3`, `pdf-lib@1.17.1`, `@pdf-lib/fontkit@1.1.1`,
`dejavu-fonts-ttf@2.37.3` (license: bundled `LICENSE`). `docx@9.15.4` was published 2026-11-14 and
would need a `minimumReleaseAgeExclude` exception; 9.15.3 was used instead and no policy exception was
added. `pnpm-workspace.yaml` is unchanged. Migrations and lockfile were updated.

Checks (Node v24.2.0; the project requires 26.13.0, which is not installed here; pnpm 12.18.0 run via
`npx`; the global pnpm shim failed with ENOEXEC):

- `pnpm typecheck`: passed across all workspace packages.
- `pnpm lint`: passed.
- `pnpm test`: 68 passed (21 files), including new document builder, structure round-trip, OpenRouter
  image-edit/JSON adapters, contracts normalization and tool classification, and tool schema tests.
- `pnpm test:integration` on the local disposable container `ai-chat-pg` (PostgreSQL 15, database
  `ai_chat_feature002`): 55 passed (9 files). New: 8 file-action scenarios (create DOCX/PDF linked to the
  assistant message; empty content refused; DOCX revision with new file, derived lineage, unchanged source
  bytes and `structure_preserved`; PDF revision `best_effort` with notes; invalid model output saves no file;
  not-ready, legacy .doc, missing key and foreign owner refused; photo edit with unchanged original; GIF
  refused before provider call; storage unset → TOOL_NOT_CONFIGURED with no file) and 4 agent dispatch
  scenarios (port dispatch without approval, absent ports not offered, malformed args rejected before the
  port, source-id passthrough). Providers and storage are synthetic fixtures at the boundary; document
  builders, extraction child and database are real.
- `git diff --check`: passed.
- `pnpm test:e2e`: 27 passed, 2 skipped, 15 failed. The failures are the same 15 recorded above for the
  owner's sidebar redesign (missing "Settings" control and related locators). The client was not changed
  by this task. I did not establish a clean baseline of the unmodified tree, so this is not proven
  pre-existing; the owner should review it.

Not verified (explicit):

- Live OpenRouter document revision and photo edit: no paid request was made. Owner check needed.
- Browser/native display of the new attachments after a run (T017, T030): the client reuses
  `tool.completed`/`run.completed` invalidation that `generate_image` uses, but no browser scenario was
  added or run for this feature. Left open. No e2e scenario covers created documents yet.
- Native iOS/Android behaviour and real DOCX/PDF visual QA in Word/Preview.

Known limits: PDF generation has no emoji or symbol fallback; glyphs outside DejaVu may render as empty
boxes. Edited photos derive from the 2048 px normalized copy. Word edits regenerate lists as bullet or
decimal from numbering format only, not exact styles. Documents over 80,000 characters are refused. The
conversation's model must accept the text revision request; an image-only model returns PROVIDER_ERROR.
Legacy .doc editing, HEIC, and GIF editing remain out of scope.

Owner-facing summary: the assistant can now create Word and PDF files in chat, revise Word/PDF files in
the conversation as new files, and make a new edited version of an attached photo. Source files are never
overwritten. Word revisions report whether structure was kept. Automated checks pass; live OpenRouter
checks and browser attachment evidence are still pending.

Next task: owner runs one live photo-edit and one live document-revision check with an authorized key;
then a browser scenario for created-file visibility (T017/T030) and the e2e baseline review (T037).
The owner's uncommitted work (client, workspace, admin and API changes, and migration `0008_message_supersede.sql`)
was pushed to master in the same push by owner request, on top of the feature commit. Migration `0008` is
not applied to production. Migration `0009` was applied to production on 2026-11-14 (UTC) and the backend
release `20261114T230503Z` was installed. The web deploy workflow publishes the client only.

## Production release — 2026-11-15 (UTC 2026-11-15 12:36)

Backend release `20261115T123617Z` from commit `4fbc78e` is live on the owner's VPS. Web is served from the
same commit through the GitHub `Deploy web` workflow.

- Migrations: `0008_message_supersede.sql` and `0009_file_derived_from.sql` applied in production after
  backups `pre-0009-20261114T230330Z.dump` and `pre-0008-20261115T123547Z.dump` (kept on the owner's machine).
  `schema_migrations` lists 0001–0009.
- Installed with `deploy/install-release.sh`; API and worker restarted; previous runtime
  `20261114T230503Z` retained for rollback.
- Checks: readiness database/queue `ok`; anonymous `/v1/profile` 401; `/.env` 404; home 200;
  `POST /v1/messages/:id/edit` answers 401 anonymously (route present).
- Not run: a live OpenRouter request for document creation/revision, photo edit, or message edit.
  Browser verification of an attachment appearing without reload was covered by the e2e scenario only.

## Native iOS simulator build — 2026-11-13

Task ID: T19 partial (native compile evidence only).
Implemented behavior: regenerated ignored Expo iOS project and compiled Debug for iPhone Simulator.

Commands and results:
- `node node_modules/expo/bin/cli prebuild --platform ios --no-install` in `apps/client`: created `apps/client/ios`.
- `pod install` in `apps/client/ios`: 118 Podfile deps / 126 pods.
- `xcodebuild -workspace AIChat.xcworkspace -scheme AIChat -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17'`: **BUILD SUCCEEDED** (Xcode 27.2 / 27B52).
- Opened `apps/client/ios/AIChat.xcworkspace` in Xcode.

Environment: macOS darwin 25.6.0; Xcode 27.2; CocoaPods 1.16.2; Expo SDK 58 / RN 0.88.1.
Not claimed: physical device install, Google native SSO smoke, Metro/dev-client runtime, store signing, Android re-verify.
Next: T19 remaining live/native device acceptance; configure `EXPO_PUBLIC_GOOGLE_*` before native login checks.

## CHAT-201 / CHAT-203 — Focus and sidebar state — 2026-11-16 (local, backend release pending)

CHAT-201 (composer focus during streaming): web `Keyboard.dismiss()` blurs the focused input.
The thread's tap handler and scroll-begin handler called it on web, so taps in the answer
removed focus from the composer. Those calls are now native-only (`dismissKeyboardOnNative` in
`apps/client/src/chat.tsx`). Not reproduced in a browser; verified by code reading of
react-native-web 0.21.4 only. Typecheck and eslint on the touched file passed.

CHAT-203 (sidebar state): pins moved from device `sessionStorage` to the server. Migration
`0010_chat_activity.sql` adds `conversations.pinned_at` and `last_seen_at`; existing chats are
marked seen. New endpoints: `PUT/DELETE /v1/conversations/:id/pin` (no version bump, no
`updated_at` change), `POST /v1/conversations/:id/seen`, and `GET /v1/conversations?pinned=true`
(up to 100). Conversation DTO adds `pinned_at` and `activity` (`running` / `unread` / `idle`).
The sidebar shows a spinner for a running chat and a dot for an unread finished answer. The
client marks a chat seen when it opens and when its run stops.
Limitation: pins made on the device before this change are not migrated.

Checks (Node v24.2.0, pnpm shim unavailable so binaries were run directly):
- `tsc --noEmit`: contracts, database, api, client passed; eslint on touched files passed.
- Integration on disposable local PostgreSQL 15 (`chat_activity_test`, not the Supabase `.env`
  database): 10 files, 56 tests passed, including new `chat-activity.integration.test.ts`.
- Unit (`vitest run`): 21 files, 68 tests passed.
- Playwright desktop + mobile-web, synthetic fixtures: 23 passed, 19 failed. The same 19 fail
  on the unmodified baseline (`git stash` comparison), so they are pre-existing. Added mock
  handlers for `?pinned=true` and `/seen` in `e2e/chat.spec.ts`.

Not done: backend release (migration 0010 on the hosted database plus API/worker restart) is
still pending; the web client is guarded so it shows no pins when the server lacks `pinned_at`.

## Release — CHAT-203 backend and web — 2026-11-16

Owner authorized the release. Migration `0010_chat_activity.sql` was applied to the hosted
database before the runtime switch (schema_migrations had 0001–0009; 34 existing conversations
were backfilled as seen). A local JSON backup of the `conversations` rows (34) was written
outside the repository with mode 0600 before the migration.

Built the web export with the public origin and Supabase publishable settings from the local
environment; no server secrets in the bundle. Archive from commit `b805a0f` plus `web/`,
sha256 `cdebc50e…04e6b3`. Ran `deploy/install-release.sh` as root.

Release `20261116T132544Z`: runtime `/opt/ai-chat/releases/20261116T132544Z`, web
`/srv/ai-chat/releases/20261116T132544Z`. Previous release: `20261115T123617Z`, kept for rollback.
Public and local readiness report database and queue ok. Anonymous calls to the new routes
(`PUT .../pin`, `POST .../seen`, `GET ...?pinned=true`) return 401, not 404. Journal shows no
errors in the 3 minutes after the restart.

Not verified: an authenticated pin/unread journey on the hosted site. The owner should pin a
chat and check the indicators in the browser.

## CHAT-204 — Suggested replies — 2026-11-16 (local, release pending)

The model ends a completed answer with an optional `<suggestions>["…", "…"]</suggestions>` line
(system prompt). At run completion the server parses it with `extractSuggestions`
(`packages/contracts/src/suggestions.ts`): up to 4 unique strings of at most 60 code points, the
block is removed from `messages.content`, and the list is stored in the new nullable column
`messages.suggestions` (migration `0011_message_suggestions.sql`, additive). Invalid JSON drops the
replies but still removes the block. While streaming, the client hides an unfinished block.
Chips appear above the composer only for the latest, completed assistant message, not while a run
is active and not when the composer has text. Tapping one sends it.

Checks: contracts unit tests for parsing (5); integration test that the stored answer has no block
and the suggestions are persisted (57 integration tests passed on a disposable database); unit total
73 passed; `tsc` and eslint on touched files passed; Playwright reply-suggestion scenario passed on
desktop and mobile web. Full Playwright run: 29 passed, 15 failed; the same 15 failures exist on the
unmodified baseline (pre-existing, see the CHAT-203 entry).

Limitation: the reply block depends on model compliance; a model that ignores the instruction shows
no chips. Not verified against a live model.

## Release — CHAT-204 — 2026-11-16

Migration `0011_message_suggestions.sql` (additive nullable column) was applied to the hosted
database; schema_migrations then listed 0001–0011. No backup of table rows was needed for an
additive column; rollback is dropping `messages.suggestions` if ever required.

Release `20261116T140334Z` (commit `8f2a4d4`, archive sha256 `d382de16…40af17`): runtime
`/opt/ai-chat/releases/20261116T140334Z`, web `/srv/ai-chat/releases/20261116T140334Z`. Previous
release `20261116T132544Z` is kept for rollback. Public and local readiness report database and
queue ok; the journal shows no error entries in the 3 minutes after restart. Web bundle scan:
no server secrets; the new chip testID is present.

Not verified on the hosted site with a live model: chips depend on the model following the
`<suggestions>` instruction.

## CHAT-205 — Automatic chat titles — 2026-11-16 (local, release pending)

Owner decision (2026-11-16) allows one low-cost title request. `docs/AGENT_TASK.md` now
records the rule. The first-message truncation stays as the immediate title. After a run
completes, `nameFirstExchange` (`packages/agent-runtime/src/execute.ts`) runs only when the chat
has exactly one user message, its title is still automatic, and the answer is complete. It asks
`deps.titleModel` (worker: `TITLE_MODEL_ID`, default `google/gemini-3.8-flash`) for at most 24
tokens, with a 15 s timeout, and updates the title with `title_source = 'auto'` in the query.
Failures are ignored and the title stays. The title request is not counted in run budgets or
usage; its provider cost is not recorded, so it is outside the per-run estimate.

Checks: integration test (named chat and unchanged chat with `titleModel: null`) passed on a
disposable database (58 integration tests in total); unit tests 73 passed; `tsc` for runtime,
database and worker, and eslint on touched files passed.
Not verified against the live title model.

## Release — CHAT-205 — 2026-11-16

No migration. Runtime and worker changed (title request after the first completed exchange); the
web bundle was rebuilt from the same commit. Release `20261116T140914Z` (commit `f02da5a`,
archive sha256 `72bd6c95…`). Previous release `20261116T140334Z` is kept for rollback. Public and
local readiness report database and queue ok; both services are active. The title model defaults
to `google/gemini-3.8-flash`; set `TITLE_MODEL_ID` in `/etc/ai-chat/server.env` to change it.

Not verified against the live title model on a real chat.

## CHAT-206 — Reasoning effort — 2026-11-16 (local, release pending)

Effort control (Default / Low / Medium / High) appears left of Tools only for a chat with a
selected model whose catalog entry lists supported efforts. The catalog reads OpenRouter's
per-model `reasoning.supported_efforts` (absent: no control; null: all; intersected with
low/medium/high). The value is stored per conversation (migration `0012_conversation_reasoning_effort.sql`,
nullable, check constraint), set with the existing `PATCH /v1/conversations/:id`, and copied into
the run snapshot only when the current model supports it. The provider request then carries
`reasoning: { effort }` (documented OpenRouter parameter; verified against
openrouter.ai/docs/use-cases/reasoning-tokens). Without a selection, no `reasoning` field is sent.
Note: reasoning tokens count toward the request's output budget on OpenRouter; the existing
`max_tokens` for a run is unchanged.

Limitation: the control is shown only after a chat exists. Choosing an effort on the start screen
is not supported yet.

Checks: adapter and catalog unit tests (12 in openrouter tests); integration test for PATCH,
invalid value rejection, and snapshot filtering by supported efforts (59 integration tests
passed on a disposable database); unit total 75 passed; tsc and eslint on touched files passed;
Playwright: effort selection test passed on desktop and mobile web. Full run: 31 passed, 15 failed,
the same pre-existing failures as before.
Not verified against the live provider with a reasoning model.

## Release — CHAT-206 — 2026-11-16

Migration `0012_conversation_reasoning_effort.sql` (nullable column with check constraint) applied
to the hosted database; latest migration is now 0012. Release `20261116T142148Z` (commit
`375c387`, archive sha256 `c5d0d78d…`), previous `20261116T140914Z` kept for rollback. Readiness
reports database and queue ok; both services active; no error entries in the journal after restart.
Web bundle scan: no server secrets.

Not verified on the hosted site with a reasoning-capable model.

## CHAT-207 — Document drafts — 2026-11-16 (local, release pending)

The model calls the new built-in tool `draft_document` (same structured content as
`create_document`) when the user asks for a Word or PDF file. The worker stores it in the new
owner-scoped table `document_drafts` (migration `0013_document_drafts.sql`, RLS like other
workspace tables). No file is created. The conversation's work-tools panel has a Drafts tab that
lists drafts, edits the title and heading/paragraph text with version checks (`If-Match`), and
creates the file with `Create file` (existing `createDocumentFile`, linked to the original
assistant message). A created draft becomes read-only; further changes use the existing revision
path.

API: `GET /v1/conversations/:id/document-drafts`, `GET /v1/document-drafts/:id`,
`PATCH /v1/document-drafts/:id` (If-Match), `POST /v1/document-drafts/:id/create`.

Deviations from the plan: the editor lives in the work-tools panel, not a dedicated right-side
draft panel; list and table blocks are displayed but not editable yet; a manual create could race
with a second create and produce a duplicate file (status change is atomic only after the file is
made).

Checks: integration test for draft lifecycle (list, save, stale version 409, create blocked
without assistant message 422, read-only after file 409); full integration suite 60 passed on a
disposable database; unit 75 passed; tsc for contracts, database, api, worker, agent-runtime and
client, eslint on touched files passed. Full Playwright run: 31 passed, 15 failed; same
pre-existing failures as before. No new Playwright scenario for drafts yet.
Not verified with a live model producing a draft.

## Release — CHAT-207 — 2026-11-16

Migration `0013_document_drafts.sql` applied to the hosted database (latest is now 0013; new table
verified). Release `20261116T143419Z` (commit `723743f`, archive sha256 `66c4ccf4…`); previous
`20261116T142148Z` kept for rollback. Readiness reports database and queue ok; both services active;
the new draft route answers anonymously with 401. Web bundle scan: no server secrets.

Not verified on the hosted site with a live model producing a draft.

## CHAT-202 — ADR-001 message branching — 2026-11-16 (docs only)

Recorded `docs/ADR-001-message-branching.md`. Current behaviour: an edit sets `superseded_at` on all
later messages, so the earlier answers disappear and cannot be reopened. Decision: a branch tree
(`conversation_branches` with `fork_seq`, `messages.branch_id`, active leaf per conversation) with a
single visible-thread SQL function, plus a migration that puts existing messages into one root branch
and keeps legacy superseded rows hidden. Implementation, the UX fixes for edit (no modal, scrollable
field, focus) and the switcher follow in later commits. No code or schema changed in this step.

## CHAT-202 — Message branching — 2026-11-16 (local, release pending)

Implements ADR-001. Migration `0014_message_branches.sql`: `conversation_branches` (parent, fork
seq, turn key, RLS), `messages.branch_id` and `messages.turn_key`, `conversations.active_leaf_branch_id`,
root branch backfill, triggers that create a root branch for new conversations and assign new
messages to the active leaf, and SQL functions `visible_message_ids(conv, leaf)` and
`active_message_ids(conv)`. Every thread query now uses `active_message_ids` instead of
`superseded_at is null` (legacy superseded rows stay hidden).

Editing creates a child branch forked at the edited user message, copies its attachments, and starts
a new run there. Nothing is deleted. Variants of one turn share `turn_key`; the message DTO exposes
`branch: {index, count, message_ids}` when a turn has several versions. `POST /v1/messages/:id/select-variant`
with `{message_id}` moves the active leaf to the newest branch of the chosen version (ADR open item:
confirmed as the default behaviour). Client: a `< n/m >` switcher under edited user messages, the
edit field grows up to 480 px and scrolls, and the local cache rewrite of later messages is removed.
The edit hint text now says earlier answers are kept.

Confirmation modal: no modal exists in the current client code; the edit button submits directly.

Checks: integration tests for the branching flow (edit keeps original, switch both ways, branch info,
new conversation gets a root branch) and for the adapted workspace edit test; full integration suite
62 passed on a disposable database; unit 75 passed; migration check on a database that already had
messages including legacy superseded rows: visible sequence before and after the migration identical
(1,2,5,6). tsc and eslint on touched files passed. Full Playwright run: 31 passed, 15 failed, same
pre-existing failures as before. No Playwright scenario yet for the switcher.
Not verified against a live provider.

## Release — CHAT-202 — 2026-11-16

Migration `0014_message_branches.sql` applied to the hosted database after a before/after check of
the visible thread for every conversation: 34 conversations, 0 mismatches. Release
`20261116T144859Z` (commit `2d8527c`, archive sha256 `601bc8ff…`); previous `20261116T143419Z` kept
for rollback. Readiness database and queue ok; both services active.

Not verified on the hosted site: the branch switcher with a live provider answer.

## Chat input and reading — 2026-11-16 (local, release pending)

- Paste an image from the clipboard into the composer (web): the composer's paste listener takes the
  first image item and uploads it through the existing upload path. Native paste is not handled yet.
- System prompt: default answers limited to about 3 sentences or 5 bullets (about 120 words); longer
  answers only for explicit requests for detail, documents, code or comparisons.
- Photo attachments open in an in-app viewer (Modal, closes with the button, backdrop or Escape)
  instead of a new browser tab. Non-image files still open via the download URL.
- Long user messages (over 700 characters or 12 lines) collapse to 220 px with a Show more / Show less
  control; height changes use the row's existing layout animation.

Checks: client, agent-runtime typecheck and eslint on touched files passed; unit 75 passed. New
Playwright scenarios (paste, long message collapse/expand, photo viewer without a new page) passed on
desktop and mobile web. Full run: 37 passed, 15 failed, the same pre-existing failures as before.
Also fixed the branching unit test typing (`editMessage` body). Not verified with live models.

## Release — chat input and reading — 2026-11-16

Runtime (prompt) and web release `20261116T150107Z` from commit `8f4f931`, archive sha256 `fdf186da…`.
No migration. Previous `20261116T144859Z` kept for rollback. Readiness database and queue ok; both
services active.

## ADR-002 — Agent questions with answer options — 2026-11-16 (docs only)

Recorded `docs/ADR-002-agent-questions.md` with the owner's decisions: one to three questions per
call, single choice with optional "Other" field, skipping allowed, 12-hour wait without model cost,
questions only when the request is ambiguous. Mirrors the approval pause (new `waiting_input`
status, `agent_questions` table, same continuation and expiry sweep). No code changed in this step.

## CHAT-111 / ADR-002 — Agent questions with answer options — 2026-11-16 (local, release pending)

Implements ADR-002. Migration `0015_agent_questions.sql`: run and tool-call status constraints now
include `waiting_input`; the single-active-run index covers it; new owner-scoped table
`agent_questions` (RLS like approvals). Runtime: built-in tool `ask_user` (one to three questions,
two to four options each, optional "Other" text) pauses the run in `waiting_input` without a model
call; at most one `ask_user` call per run (later calls return a validation result to the model).
The answer is written to the tool call's result; resume records it in the checkpoint and continues
the run through the normal queue. Skipping is supported. Answers after the 12-hour window get 410;
a second answer gets 409. Expired questions are swept by the maintenance job: the run ends as
`failed` with `QUESTION_EXPIRED` (ADR updated to match approval expiry handling). Snapshot exposes
pending questions; API `POST /v1/questions/:id/answer` takes `{skip: true}` or `{answers: [...]}`.
Client: `AgentQuestionCard` (radio options, "Other" field, Answer and Skip) rendered in the stream;
`question.required` and `question.resolved` events update the snapshot. The system prompt asks for
`ask_user` only when a wrong guess would waste work.

Checks: integration tests for pause and resume with the chosen option recorded for the model, skip
and a second answer (409), and expiry (410) — 3 passed; full integration suite 65 passed on a
disposable database; unit 75 passed; tsc for contracts, database, agent-runtime, services, api, and
client; eslint on touched code passed; full Playwright run 37 passed, 15 failed (same pre-existing
failures). Not verified: the maintenance expiry path end to end (typecheck only), the card in a
browser, and the behaviour with a live model. The sidebar shows a running spinner while a run waits
for an answer; a distinct "needs input" marker is not built yet.

## Release — CHAT-111 — 2026-11-16

Migration `0015_agent_questions.sql` applied to the hosted database (table and constraints verified).
Release `20261116T152442Z` (commit `2658825`, archive sha256 `923298ef…`); previous `20261116T150107Z`
kept for rollback. Readiness database and queue ok; both services active. Web bundle scan: no server
secrets.

Not verified on the hosted site with a live model asking a question.

## CHAT-111 — tests for question card and expiry — 2026-11-16 (tests only, no release)

- Expiry integration test (`packages/services/src/questions-expiry.integration.test.ts`): a run waiting
  for an answer past its window is failed with `QUESTION_EXPIRED` by the maintenance job and the question
  is marked `expired`. Passed on a disposable database.
- Playwright scenario "an agent question shows its options and sends the chosen answer": the card appears
  after a reload, the chosen option is sent as `{answers:[{question_id, option_index}]}`, and the card
  disappears. Passed on desktop and mobile web. The page is reloaded because the fixture does not emit SSE
  `question.required`; live SSE delivery is therefore still covered only by code review.

## CHAT-207 — Draft panel — 2026-11-16 (local, web release pending)

Completes the planned draft panel. A drafted document opens in a side panel (wide screens, 440 px
beside the chat) or a full-height sheet (narrow screens) with Back and Create file. Title, paragraphs,
headings, bulleted/numbered lists (items add/remove, toggle) and tables (header and cells, rows
add/remove) are editable; blocks can be added and removed. Edits autosave after 800 ms with the
draft version (writes run one at a time; a conflict shows an error). Create file saves pending edits,
then creates the file with the existing path; the draft becomes read-only. A card for the draft
appears in the conversation stream; the Drafts tab in the work-tools panel opens the same panel.
Opening a draft closes the work-tools panel and the other way round.

Checks: client typecheck and eslint passed. Playwright scenario "a drafted document opens in a side
panel, saves edits, and creates the file" passed on desktop and mobile web. Full run: 41 passed,
15 failed (same pre-existing failures). Not verified on a device or with a live model producing a
draft. Limit: the in-stream card shows only for the latest run; older drafts are reached from the Drafts tab.

## Release — CHAT-207 draft panel — 2026-11-16

Frontend change only (no migration, runtime code unchanged). Release `20261116T160602Z` from commit
`a4ce364`, archive sha256 `4685e8f5…`. Previous `20261116T152442Z` kept for rollback. Readiness
database and queue ok; both services active; web bundle scan clean.

Not verified on the hosted site with a live model drafting a document.

## Fix — generated Word/PDF files failed with PROVIDER_ERROR — 2026-11-16

Cause: the storage object key included the readable file name. For a Cyrillic title (for example
"Луффи — будущий король пиратов") Supabase Storage rejected the key with `Invalid key`; the upload
error was then reported to the model as a generic provider error, so every `create_document` call
failed. Verified by a direct upload with a Cyrillic key (rejected) and an ASCII key (accepted).

Fix: `storageObjectName` keeps only the ASCII stem and extension for the object key (fallback
`document.<ext>`); the readable name stays in `files.original_name`. Checks: unit test for the rule;
unit suite 76 passed; file-actions integration suite 8 passed on a disposable database. Not yet
re-run from the chat on the hosted site; retry the document request after the release.

## Release — storage key fix — 2026-11-16

Release `20261116T185139Z` (commit `e078c19`, archive sha256 `72bd6c95…` was the earlier attempt; this
archive was rebuilt from the same commit). Previous `20261116T160602Z` kept for rollback.

Incident during rollout: the first install attempt failed with `No space left on device` (14 GB disk at
100%; each release carries ~630 MB of dependencies). The installer's failed attempt had left a partial
runtime/web directory, which was removed. Old releases were removed, keeping only `20261116T160602Z` and
`20261116T152442Z`. The web symlink `/srv/ai-chat/current` pointed at a removed release for a short
window and was re-pointed to `20261116T160602Z` before the new install. The site returned 200 and
readiness stayed ok during the window. Disk after cleanup and install: 55% used.

Follow-up: the installer's pipeline in earlier releases hid install failures (`| tail`); use the full log
(`> install.log`) and check the exit status before trusting the symlinks.

## Fixes — chat title, question dock, draft before document — 2026-11-16

- Chat title: the title model's 24-token limit cut a reasoning model's reply to one word ("на").
  Limit raised to 200 tokens; titles shorter than 4 characters are ignored (first-message title kept).
  The bad title of the affected chat was restored to the first message.
- Agent questions: asked one at a time in a dock above the composer (step counter, Next, Skip);
  answers are sent together on the last step. Removed from the message stream.
- Documents: `create_document` requests are turned into a draft (same arguments, nothing is filed).
  The draft panel opens automatically when a run that produced a draft finishes; the stream card
  recognises both tool names.

Checks: unit 76 passed; integration 66 passed on a disposable database (new test: a document request
becomes a draft and no file is created); e2e full run 41 passed, 15 failed (same pre-existing failures);
tsc and eslint on touched files passed. Not verified with a live model.

## Release — title, question dock, draft before file — 2026-11-16

Release `20261116T190645Z` (commit `3f01214`, archive sha256 `4b169f20…`). Previous `20261116T185139Z`
kept for rollback; older releases removed to keep disk usage (55% -> 60% after install). Install exit 0;
readiness ok; both services active; site 200.
