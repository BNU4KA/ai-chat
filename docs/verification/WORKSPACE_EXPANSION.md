# Workspace expansion evidence — 2026-11-12

Scope: T15–T19 / E01–E11. Implementation is local and unpublished. Final validation uses Node
26.13.0, pnpm 12.18.0, PostgreSQL 15 in a disposable container, and installed Chrome desktop/
mobile viewport projects. Initial exploratory checks used shell Node 24.13.0; they are superseded
by the pinned-runtime final runs below. No physical-device, live Google or paid inference claim.

## Automated coverage

| Acceptance | Evidence |
| --- | --- |
| E01 projects/private material | API integration isolates owners, rejects cross-owner linking/stale versions, explicitly shares a ready PDF, checks real page 7 and revokes access; account cleanup removes new owned tables. |
| E02 long context | Runtime retains reviewed note/uncovered turns and preserves six original messages; browser warning opens review without another generation. |
| E03 document editing | API verifies selected text/version and immutable revisions, rejects stale/mismatched edits, and escapes HTML export; browser saves v2 and loads version history. |
| E04 workflows/research | Runtime receives explicitly selected model, project memory and research instruction; source IDs/excerpts/dates persist. Browser opens claim evidence and prepares passage follow-ups without sending. |
| E05 proposal revisions | API prepares against a synthetic current grant while waiting; cancelled old approval conflicts; two same decisions execute revised arguments once; no real Gmail request. |
| E06 recurring runs | Concurrent maintainers produce one occurrence/run; pause prevents later occurrence; result notice persists; crash recovery links the original run. Pure tests cover DST gaps/folds and weekly dates. |
| E07 costs | Exact decimal arithmetic, scientific notation, unknown prices, cap-before-submission, each tool-loop submission, confirmed totals and unknown partial totals. |
| E08 search/branches | Owner-filtered content search, old-message context endpoint, preserved original and empty branched draft; browser changes route and retains the edited prompt without submitting. |
| E09 sources/PDF | Actual extracted page reference reaches file-tool source; UI appends one-based page fragment to a signed authenticated download. Browser inspects saved claim excerpt. Viewer-specific PDF behavior is not native verified. |
| E10 selected text | Browser fills a passage, chooses Explain, and checks only the existing submission occurred. Account-bound draft transfer has a one-use/sign-out isolation test. |
| E11 meeting slots | Pure tests reject malformed busy intervals/ranges and exclude buffer overlaps; API uses a synthetic current Calendar grant; browser selection prepares a draft. No event creation for tests. |

## Limits of this evidence

Synthetic Google tokens, model catalog/answers and Storage/Auth cleanup doubles are injected only
in tests. They do not establish live consent, send/event success or production readiness. All new
schema migrations were applied only to the disposable local database. Existing native toolchain,
provider verification, backup/restore and release gates remain recorded in PROGRESS.

Official references checked during implementation:
- OpenRouter usage accounting: https://openrouter.ai/docs/cookbook/administration/usage-accounting
- Google Calendar free/busy: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- Google Calendar patch semantics: https://developers.google.com/workspace/calendar/api/v3/reference/events/patch
- PostgreSQL text search: https://www.postgresql.org/docs/current/textsearch-controls.html

## Final commands and results

All commands below completed on the final source using Node 26.13.0 and pnpm 12.18.0.
The pinned runtime was selected through PATH; no global runtime configuration was modified.

- `pnpm typecheck`: passed for all eight checked workspace packages/apps.
- `pnpm lint`: passed.
- `pnpm test`: 45 passed across 12 files.
- `DATABASE_URL=<disposable-local-test-db> pnpm test:integration`: 35 passed across six files.
  Thirteen expansion integration scenarios cover project/data isolation, range editing/export,
  sharing/revocation, message search/branches, context notes, budget guards, revised-approval races,
  recurring-run deduplication/notices, slots, usage aggregation, crash recovery, research sources
  and account cleanup. No real provider request was made by these scenarios.
- `pnpm test:e2e`: 26 passed, two optional live-health cases skipped because E2E_BASE_URL was
  unset. Chrome desktop and mobile viewport; all provider/API traffic explicitly intercepted.
- `pnpm build`: passed, including server checks and Expo production web export (workspace route
  included). This is not a native build and not a deployment.
- `git diff --check`: passed.

Four browser screenshots of the workspace/document flows were captured from synthetic data and
visually inspected. A first render exposed raw text in dynamic RN button labels; after the fix,
console-clean assertions and replacement screenshots passed. Desktop side dock and narrow-screen
working panel were inspected. Screenshots and logs are local temporary verification artifacts,
not repository content or claimed live-provider evidence.

## Review regression fixes and visual consistency — 2026-11-12

All six reported defects now have regression evidence:

- Weekly Sunday 02:30 Europe/Warsaw skips the missing DST week in 2026 and 2027 and finds the
  following valid week. Invalid schedule rows pause individually; scheduling runs on a separate
  worker timer rather than blocking the transactional outbox loop.
- A synthetic catalog check is held open while pause or deletion commits. Resuming validation
  creates neither a run nor a run.execute outbox record. The guard and occurrence/run link are in
  the creation transaction; pre-existing runs retain their original lifecycle.
- Ten old pending paused occurrences no longer starve a new active schedule. Pending periods
  held by a user's concurrency limit coalesce instead of creating a catch-up burst.
- Deleting a project after soft-deleting its chat succeeds; another owner still gets 404.
  Remaining documents are detached and gain a preserved revision.
- The real form serialization helper preserves absent calendar PATCH fields and recipient names.
  API/runtime and browser checks modify only a title, retain the full attendee/description preview,
  invalidate the old approval and require a separate confirmation. Google responses are synthetic.
- The agent lists all six project documents across pages and reads a clause beyond character 9000,
  records a document citation, rejects cross-owner access, rejects stale versions and stops reading
  after project detachment. Deletion clears source references. A browser follows a document citation
  into its owned editor. Previews now explicitly state that they are incomplete.

Final checks: Node 26.13.0 / pnpm 12.18.0. `pnpm typecheck`, `pnpm lint` and
`git diff --check` pass. `pnpm test`: 48 passed (13 files). Disposable PostgreSQL 15:
`DATABASE_URL=<synthetic-test-db> pnpm test:integration`: 41 passed (six files, including 19
expansion/regression scenarios). `pnpm test:e2e`: 36 passed, two environment-gated live-health
cases skipped. `pnpm build` exports the production web application and checks server types.
No real email/calendar write, paid model generation, production migration or deployment is used.

Visual evidence compares the existing Settings screen against Projects, Documents and Schedules
in light/dark mode on desktop and mobile viewport projects. Tests verify shared text/panel/selected
colors, rounded controls, model-catalog reuse, accessible selected states, a clean console and no
page-wide horizontal overflow. Russian navigation is checked separately. Screenshots are generated
from synthetic browser fixtures and visually inspected; finite animations are disabled only for
stable screenshots, not in the product. The last label-only refinement replaces internal workflow
keys with translated task names and refreshes six light/dark/Russian visual scenarios.

Observed styling corrections: shared outlined choices instead of multiple competing primary
buttons; horizontally scrollable section navigation; subdued compact editor/response actions;
shared searchable model dialog; localized workflow labels; source-document navigation; Escape/
Android Back support for the work-tools pane. Existing themes/tokens/system typography are reused.

Remaining gates are unchanged: native device/build acceptance, sandbox live-provider journeys,
restore/release checks and any owner-authorized deployment. Migration 0005 is required on a future
release target. Neither migrations nor code have been published by this task.

Official references rechecked for this correction:
- https://developers.google.com/workspace/calendar/api/v3/reference/events/patch
- https://www.postgresql.org/docs/current/explicit-locking.html
