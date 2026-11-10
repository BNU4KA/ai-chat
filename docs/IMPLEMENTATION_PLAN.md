# Implementation plan

Execute in dependency order. Each task is a reviewable increment with runnable behavior and
evidence. Select the first unblocked incomplete task; continue independent tasks when a live
provider check is blocked. Do not ask the owner to restate decisions already fixed in the brief.
Do not stop after scaffolding or a UI-only demo when the requested scope is the full application.

## T01 — Runnable foundation

Dependencies: none. Read AGENT_TASK and ARCHITECTURE.
Deliver: compatible exact versions, workspace, client/API/worker entry points, contracts package,
.env.example, Node/package-manager pins, lint/typecheck/test scripts, local setup instructions,
health endpoints. Worker starts cleanly without consuming nonexistent jobs. Do not create all
future packages as empty shells.
Verify: clean install, web starts, API health responds, worker runs, typecheck/lint/basic smoke.
Evidence: A01 initial subset; list unconfigured external services explicitly.

## T02 — Database, ownership, and authentication

Dependencies: T01. Read DATA_MODEL, API_CONTRACT, UX_SPEC sign-in.
Deliver: migrations in dependency order, isolated queue/secret schemas, owner constraints,
Google web/native sign-in, secure session persistence, profile and theme/timezone settings,
verified API JWT checks. Implement only tables needed now; later migrations add runtime/tools.
Verify: A02, A03 relevant ownership cases, A14 login separation, A23 cache isolation.
Live OAuth may remain blocked with a precise configuration checklist; automated isolation must pass.

## T03 — Encrypted key and model catalog

Dependencies: T02. Read ARCHITECTURE secrets/limits and API credential/model DTOs.
Deliver: masked key endpoints/onboarding, AES-GCM keyring helper, current-key validation,
replace/delete lifecycle, catalog normalization/cache and model selector.
Verify: A04, A25 relevant errors; key not in UI payloads/logs; catalog unavailable/stale states.
No operator-key fallback or paid validation generation.

## T04 — Conversation persistence and frozen contracts

Dependencies: T02. Read DATA_MODEL, API_CONTRACT, UX_SPEC.
Deliver: conversation CRUD, title search, messages/attachment metadata, exact Zod schemas and
OpenAPI for all currently implemented routes. Commit synthetic canonical request/response/event
fixtures; extend them with each feature, not a competing handwritten type definition.
Verify: A03 CRUD ownership, versions/If-Match, pagination, rename/title generation rules.

## T05 — Durable run creation and event delivery

Dependencies: T03, T04. Read RUNTIME_SPEC state machine and API streaming.
Deliver: pg-boss worker, outbox dispatch, message/run atomic creation, transactional concurrency
limits, run snapshots and SSE replay, lease fencing/cancellation. Start with an explicitly injected
test model adapter, then integrate the real OpenRouter adapter in T06. Production configuration
must never select the test adapter.
Verify: A06-A09, A26 core durability; queue disconnect and dispatcher retry without lost jobs.

## T06 — Real streaming chat vertical slice

Dependencies: T05. Deliver: OpenRouter streaming parser, UTF-8/chunk handling, context budget,
usage/errors, chat composer/Markdown, Stop, latest-turn retry, history synchronization/polling.
Verify: A05, A07, A08, A23, A25; real key/model flow when available. Demonstrate web plus iOS
and Android development builds; record unavailable device checks instead of assuming them.
This is the first usable chat milestone. Do not defer all native integration until the final task.

## T07 — Tool loop and approval engine

Dependencies: T06. Read full RUNTIME_SPEC.
Deliver: tool registry and strict schemas, calls/results persisted with IDs, counters, checkpoints,
single-use approval decisions, 24-hour expiry sweeper, resume jobs and unknown-write outcomes.
Initially exercise synthetic read/write adapters only in tests.
Verify: A10, A16-A18, A20, A27; demonstrate approval races and a crash after provider acceptance.

## T08 — Web research

Dependencies: T07. Deliver: Tavily adapter, protected page reader, source registry/citation rendering,
conversation Web toggle and availability gating. No generic unrestricted fetch tool.
Verify: A11, A12, A20, A28; authorized live search plus network fault/security tests.

## T09 — Private document tools

Dependencies: T07. Deliver: signed uploads/finalize, extraction jobs, ownership/quota enforcement,
PDF/TXT/MD/DOCX extraction, ready-state UI, PostgreSQL chunk search and source refs.
Verify: A03 file paths, A13, A20, A21 file deletion. DOCX citations use sections, not fabricated pages.

## T10 — Google capability connections

Dependencies: T02, T07. Deliver: separate integration OAuth, single-use state/PKCE, encrypted
refresh tokens, incremental Gmail/Calendar consent, account display, reconnect/disconnect,
capability gating, shared-grant lifecycle. Document exact scopes and Google review prerequisites.
Verify: A14, A15, A21 integration disconnection. Missing provider access blocks live evidence only.

## T11 — Gmail actions

Dependencies: T10. Deliver: search/read, plain-text draft proposal/create/send, approval previews,
read limits and unknown-send protection. All provider writes pass through approval execution.
Verify: A16-A18, A20; live writes only to owner-approved test recipients. Do not claim a mock send
as live verification and do not implement full inbox synchronization.

## T12 — Calendar actions

Dependencies: T10. Deliver: primary-calendar events/free-busy, timed event create/update,
IANA timezone validation, ETag conflict and invitation preview/confirmation.
Verify: A16-A19, A20; real write checks only on an authorized test calendar/account.

## T13 — Lifecycle, UX, and cross-platform completeness

Dependencies: T08, T09, T11, T12 implemented; missing live evidence remains visibly blocked.
Deliver: all required UX states, account/chat/file deletion jobs, revocation cleanup, themes,
accessibility, responsive layout, account-switch cache clearing, usage presentation.
Verify: A21-A24, A27-A28 plus platform smoke for core journeys.

## T14 — Verification and operational handoff

Dependencies: T13. Deliver: CI checks without production secrets, full evidence matrix, reproducible
setup, build/deploy instructions, health/metrics/log redaction, backup/restore exercise,
provider and store-readiness checklist, honest README feature status and limitations.
Verify: A01-A30 applicable scope; pnpm checks; web export and actual native build/smoke evidence.
Never mark completion if mandatory live checks remain blocked. Deployment/store submission is
not automatically authorized by this task.

## Starting prompt

Read AGENTS.md, docs/AGENT_TASK.md, and docs/PROGRESS.md. Implement the MVP using this
plan and the linked contracts. Start with T01 if it is not complete; otherwise resume the first
unblocked task. Keep the fixed stack and scope, implement real provider boundaries, and record
verification evidence after each task. Continue independent work when credentials are missing;
never substitute production mocks or claim unperformed live tests passed. Complete the requested
scope, and report any remaining external blockers explicitly.
