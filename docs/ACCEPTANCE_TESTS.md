# Acceptance scenarios and evidence

These scenarios define observable behavior, not just functions to unit-test. Tests use synthetic
accounts, documents, and provider fixtures. Live email/calendar writes require explicit permission
for designated test recipients/calendar. No test sends to an address harvested from user content.

## Required scenario matrix

| ID | Given / action | Required assertion | Level |
| --- | --- | --- | --- |
| A01 | Fresh checkout, documented setup | API/client/worker start; migration applies; no secret in public env | Local smoke |
| A02 | First Google login, then same identity on another platform | One profile, same history; cancellation is recoverable | Live web + native |
| A03 | User B requests user A's chat/run/file/approval/download | Generic 404/denied; no metadata leakage through privileged paths | DB + API |
| A04 | Missing, invalid, then valid OpenRouter key | No model call without key; invalid replacement preserves good key; only mask returned | API + live key validation |
| A05 | Send message and receive token stream | Ordered text, persisted final answer, sources/usage where available | Contract + live model |
| A06 | Replay same message key; race two devices | One message/run for replay; different concurrent request gets active-run conflict | DB + API concurrency |
| A07 | Drop SSE, then reconnect; expire cursor | No duplicated text; final snapshot consistent; 410 triggers snapshot reload | API + web E2E |
| A08 | Stop queued/running/waiting task | No later tools; partial text preserved; pending approval unusable | Runtime + API |
| A09 | Kill worker before/after safe checkpoint and mid-model call | Safe work resumes once; uncertain paid model call does not auto-repeat | Worker integration |
| A10 | Model requests unknown tool, bad args, or excessive steps | Safe structured failure and enforced bounds; no arbitrary execution | Runtime |
| A11 | Search then read sources | Actual adapter data and valid source mappings; absent key is unavailable, not fake results | Adapter + authorized live read |
| A12 | URL redirects to loopback/private IPv6, rebinding, oversized/gzip payload | Request blocked before private connection/resource exhaustion | Network integration |
| A13 | Ready supported document; malformed, huge, scanned, ZIP bomb, cross-chat file | Correct excerpts/refs; rejected invalid files; no invented pages/text | Extraction + API |
| A14 | Google SSO without integration consent | Login works; Gmail/Calendar denied until separate consent | OAuth integration |
| A15 | Enable Gmail, add Calendar incrementally, refresh, revoke/disconnect | Correct account/scopes; capability gating; no provider-token exposure | Adapter + authorized live OAuth |
| A16 | Propose email/event write without approval | No provider write; preview matches canonical arguments exactly | Runtime + E2E |
| A17 | Approve from two devices; reject/change hash/use expired approval | At most one action; opposite decision conflicts; hash mismatch/expiry cannot execute | Concurrency + API |
| A18 | Provider accepts write but network drops | Reconcile or unknown outcome; no automatic duplicate send/event | Fault-injected adapter + worker |
| A19 | Calendar event edited after preview; DST/ambiguous local time | ETag conflict needs new approval; no guessed time; exact timezone shown | Adapter + runtime |
| A20 | Malicious instructions in web/file/email | Cannot add permissions, bypass approval, expose tokens, or run commands | Runtime boundary tests |
| A21 | Replace key/disconnect integration/delete file during run | New external operations blocked; approvals invalidated; known outcomes preserved | Worker + API |
| A22 | Delete chat/account | Immediate access block, cancellation, purge jobs; revocation status accurate | DB + API + cleanup |
| A23 | Change account/sign out then inspect caches | No prior user's private UI/cache data; background runs follow sign-out rule | Web E2E + native smoke |
| A24 | Dark/light/system, keyboard, narrow width, long code, screen reader labels | Usable layout, focus, accessible controls; no forced scroll | Web + iOS/Android smoke |
| A25 | Key with no credits, 429, unavailable model, 5xx, context overflow | Correct run error, draft/partial preserved, no silent fallback/paid retry | Adapter + runtime |
| A26 | Snapshot during in-flight delta; delayed/out-of-order delivery | Snapshot/event cursor coherence; persist-before-publish; no repeated/lost committed text | DB + streaming integration |
| A27 | Refresh browser or change device during approval | Same immutable pending proposal; no action until decision; expiry enforced | Web E2E |
| A28 | Default unconfigured optional providers | Chat remains available; unavailable tools hidden/disabled with reason | API + web E2E |
| A29 | Fresh DB restore and worker restart | Data and pending safe tasks recover; uncertain writes remain protected | Operations exercise |
| A30 | Native build + browser release checklist | Real device/simulator/browser versions listed; iOS/Google production gates explicit | Release evidence |

## Required commands once scaffold exists

Root scripts: `pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration`,
`pnpm test:e2e`, `pnpm build`. Add scoped `dev:client`, `dev:api`, and `dev:worker` scripts.
`pnpm build` must build/typecheck server and export web; native development/release build commands
are separate and documented. Do not claim native builds passed because web export succeeded.

Keep deterministic CI checks separate from opt-in live tests. CI may use provider doubles and
seeded local Auth identities; it must not imply Google OAuth was live verified. Do not add a
production auth bypass just to simplify E2E. Test token issuers must be injected in test processes
and fail startup if selected in production. Public fixtures contain only synthetic data.

## Evidence format

For each scenario record status (not_started/implemented/live_verified/blocked), test command,
result, commit/date, environment/version, and live prerequisite if blocked. Logs must be redacted.
A scenario can require both automated and live evidence; do not collapse them into one green check.
Store detailed evidence under docs/verification/ as it is produced; create no empty evidence files.

## MVP and publication gates

MVP completion requires all applicable scenarios implemented and the mandatory provider/native
checks live verified. If credentials or hardware are unavailable, deliver the implemented work
and explicitly call it not yet fully verified. Release submission additionally requires Google
verification status, applicable Apple login requirements, privacy disclosures/deletion UX, and
an actual deployment retention/backup policy. Public GitHub visibility is not a release gate pass.

## Owner-approved expansion acceptance — 2026-11-11

E01–E11 in EXPANSION_SPEC.md extend this matrix. Keep automated synthetic provider evidence
separate from live OAuth/model and native-platform verification. Do not infer production readiness
or permission to deploy from successful expansion checks.
