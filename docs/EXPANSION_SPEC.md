# Owner-approved functional expansion — 2026-11-11

The owner explicitly requested all eight primary and all five additional proposals in chat.
This supersedes the original MVP exclusions only for projects/shared context, visible context
compaction, editable versioned documents/export, guided single-agent workflows, research mode,
proposal revisions, recurring application tasks, spending controls, message search/branches,
source inspection/PDF navigation, selected-text follow-ups and meeting-slot suggestions.
One agent, Expo, PostgreSQL, OpenRouter, separate API/worker and explicit write approval remain.
No deployment, paid provisioning, commit or push is authorized by this implementation request.
Existing provider/native acceptance gaps remain separate from automated feature evidence.

## Behavior and boundaries

- Projects own editable explicit memory. Conversations opt into one project. Ready files are
  shared with that project only by an explicit user operation; deleting the original chat/file
  revokes access. Project material is untrusted context, never authorization. Account deletion
  removes projects, documents, revisions, schedules and notices.
- Context compaction is explicit. The user reviews/edits a bounded memory note and chooses the
  last covered message; original history stays intact. Subsequent requests start with that note
  and messages after the boundary. No hidden paid summarization or invented lossless-memory claim.
- Documents have optimistic versioning and immutable revisions; selected-range replacement
  verifies the original text/version. Export supports Markdown and escaped standalone HTML.
  Model-assisted refinement uses a normal visible paid chat run, then explicit application.
- Workflows are editable prompt starters using the existing agent/tool loop, not new agents.
  Research mode asks for comparison criteria, claim citations, retrieval dates, uncertainty and
  conflicting evidence. Source inspectors display persisted excerpts, not fabricated verification.
- Revising an action invalidates the old pending approval and creates a fresh tool/approval,
  validates canonical tool arguments through the existing provider preparation, and keeps the
  provider call/result chain consistent. The user must separately confirm the new preview.
- Schedules specify a local daily/weekly time, IANA zone, model, explicit tools, project and per-run
  budget; pause/delete and history are exposed. A durable occurrence is unique by schedule/time.
  Missed periods coalesce; no burst catch-up. Worker creates ordinary conversations/runs using
  current credential/capability checks. Completion/failure/approval notices are persisted in-app.
  Browser/OS push delivery outside the application is not claimed without configured transport.
- Cost estimates use catalog prices and conservative token estimates, stored separately from
  confirmed provider usage. Budget checks precede every model submission; unknown catalog
  prices fail closed for capped tasks. Estimates are a submission guard, not a provider billing
  guarantee (provider pricing can change). No silent fallback. Original run recovery rules apply.
- Message search filters owner and non-deleted conversation, returns snippets and message IDs.
  Deep links load the requested message vicinity, including older messages. Editing creates a new
  branch with copied visible text before the edited turn; original stays unchanged. Files must
  be explicitly reattached rather than silently copied across chats.
- Source PDF opens an authenticated signed download with an actual one-based page fragment;
  built-in browser PDF support varies. Excerpts/dates remain inspectable in the application.
- Explain/shorten/check follow-ups accept a selected passage, preserve it in the draft, and wait
  for Send. Meeting slots use primary-calendar busy intervals, duration, buffer, local working
  hours and timezone; unknown/invalid busy data fails closed. No attendee availability is guessed.

## Dependency order and acceptance

T15: schema/contracts, projects/memory, search/branches and context controls.
T16: versioned documents, export and selected-text actions.
T17: research/workflows, source inspection and proposal revision.
T18: cost estimates/guards, recurring worker tasks, notices and meeting slots.
T19: automated isolation/race/DST/UI checks, production web export, evidence and handoff.

E01: project/context/file membership isolates owners and explicit sharing; revocation works.
E02: compaction preserves originals, only omits covered history, stale edits conflict.
E03: document revisions/range edits/export preserve other text and reject stale state.
E04: workflows/research use selected tools/model and render stored source evidence.
E05: action revision invalidates old hash; only revised arguments can be approved/executed once.
E06: schedules deduplicate occurrence, respect pause/budget/credentials and notify final status.
E07: estimates/confirmed usage stay distinct; unknown prices and exceeded caps prevent submission.
E08: message search/deep-link/branch isolate owners and preserve the original.
E09: source excerpts and real PDF page navigation; no invented pages.
E10: selected text becomes a draft, never an automatic paid submission.
E11: meeting slots exclude busy intervals/buffers, handle timezone/DST and require approval to write.
