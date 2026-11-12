# Agent runtime, tool contracts, and recovery

## State machine

Active statuses: queued, running, waiting_approval. Terminal statuses: completed, cancelled, failed.

| From | Trigger | To and action |
| --- | --- | --- |
| queued | Worker acquires lease | running; emit run.started once |
| queued | Cancel request | cancelled; no provider call |
| running | Model final answer, no pending calls | completed |
| running | Write proposal | waiting_approval; persist proposal and release worker lease |
| waiting_approval | Valid approval | queued; enqueue continuation with same run_id/checkpoint |
| waiting_approval | Rejection | queued; continue with tool-denied result, without executing write |
| waiting_approval | Approval expires | failed with APPROVAL_EXPIRED; no automatic reproposal |
| Any active | Cancel request | cancelled at safe checkpoint; abort in-flight I/O best effort |
| Any active | Fatal error or limits | failed with safe error code |

A terminal run never resumes. A retry creates a new run/assistant message and attempt number.
Cancel-vs-terminal races use a DB lock/CAS: whichever terminal transition commits first wins.
Cancellation does not undo an external action already submitted. Record known/unknown outcomes.
For an in-flight write, cancellation stops further calls immediately but finalizes the run only
after bounded completion/reconciliation or an unknown result; do not close a terminal stream
and then silently append a successful write result. A later manual reconciliation updates the
snapshot with a visible audit note; it never restarts the run.

## Execution and persistence

1. Claim the queued run under a renewable lease. Confirm owner, non-deleted conversation,
   credential version, selected tools, capability status, and cancel flag.
2. Assemble bounded context from visible conversation history, this run's earlier persisted tool
   results, and allowed attachment excerpts. Internal system policy is server-owned.
3. Make the selected model request. Increment the request count before submission. Persist
   safe deltas in batches and update the assistant snapshot in the same transaction.
4. Validate complete tool calls only after their streamed arguments are fully assembled. Reject
   malformed JSON, unknown tools/fields, missing scopes, and oversized arguments as tool errors.
5. Execute calls in deterministic provider order, sequentially in MVP. Skip already completed
   calls using their IDs. Persist each result before continuing. For write tools pause for approval.
6. Send the assistant tool-call message and matching tool results back to the model. Never
   omit or duplicate a call ID. Continue within limits or persist the final response.

Persist a validated continuation checkpoint after each safe boundary: model final/tool proposal,
tool completion, approval resolution. It contains only necessary history and step counters,
never credentials. Flush pending deltas before checkpoints and terminal events.
If a tool fails, provide a bounded structured error; the model may explain it or use another
allowed read tool within limits. Rejected action cannot be re-proposed automatically in the same
run with equivalent arguments; ask the user for a new instruction instead.

When replaying history into a new run, failed/cancelled partial text is labeled as incomplete,
not an authoritative assistant answer. Retry the latest user turn with a new run; omit sibling
attempts for that turn from the provider context, while keeping them visible in the UI.

## Retry and crash policy

- Queue lease: 60 seconds, heartbeat every 15 seconds. A waiting approval holds no lease.
- Persist provider-call intent before submission and result after receipt. The result can be
  uncertain if the worker crashes in between; no universal exactly-once guarantee is claimed.
- Resume automatically only from a committed safe boundary with no uncertain external call.
- Interrupted model call -> fail WORKER_INTERRUPTED, keep partial output, allow manual retry.
  Do not silently issue a second paid generation after a crash.
- Reads may retry twice on transient 429/5xx/network failures with bounded exponential backoff,
  honoring Retry-After and remaining runtime. Validation/permission errors do not retry.
- A model request with any output or uncertain submission does not auto-retry. A confirmed
  pre-submission failure may retry once; count every actual provider submission against limits.
- Provider write retry requires provider-supported idempotency or a successful reconciliation.
  Otherwise set tool status unknown and fail run TOOL_OUTCOME_UNKNOWN. Show a check-provider
  instruction. Future attempts must not resend that unresolved operation automatically.
- Database fencing prevents stale workers from writing after lease loss. Recheck fence/lease
  immediately before external writes. Providers cannot always enforce fencing: reconciliation
  and unknown-outcome handling remain mandatory even with DB locks.
- Queue retries never reset execution counters, approval consumption, or credential revisions.

## Approval protocol

Persist exact canonical arguments and their hash before rendering a write proposal. Bind it to
owner, run, tool_call, current integration identity, and expiry (24 hours). The card preview must
be derived from the exact arguments, not an independent model summary.

Approve/reject is an atomic compare-and-set from pending. Same repeated decision with the same
hash returns current state; opposite decision returns APPROVAL_ALREADY_DECIDED. Expired -> 410.
Another user's ID -> 404. Hash mismatch -> VALIDATION_ERROR without consuming the approval.

Worker consumes an approved action once, under a lock, only if run remains active and the grant
and arguments still match. Cancellation/disconnection/deletion invalidates unconsumed approvals.
A changed proposal requires a new tool_call and approval. No approval bypass through prompt text.
Multiple calls are handled in provider order with at most one pending approval per run.

## Tool contracts

Zod input objects are strict. Shared output envelope:
`{ok:true,data:...,sources:Source[]}` or `{ok:false,error:{code,message,retryable}}`.
Credential/account IDs come from runtime, never from model-selected arbitrary user IDs.
Safe tool results persist in tool_calls; large or sensitive raw provider payloads are not retained.
Normalize tool results before passing them back to the model.

| Tool | Input fields (required unless ?) | Output / bounds |
| --- | --- | --- |
| search_web | query:string (1..500), max_results?:int (1..5) | title,url,excerpt,retrieved_at; no generated third-party answer |
| read_web_page | url:https/http | title,final_url,text,sources; 20,000 characters max |
| list_files | none | Ready files for current conversation only |
| read_file | file_id:uuid,page_start?:int,page_end?:int | Text/excerpts, actual page/section refs; <=20,000 chars |
| search_files | query:string (1..500),file_ids?:uuid[] | Up to 8 ranked chunks, <=20,000 chars total, source refs |
| search_mail | query:string (1..500),max_results?:int (1..10) | id,thread_id,subject,from,date,snippet |
| read_mail | message_id:string | Plain-text body <=20,000 chars, headers, provider source link |
| create_mail_draft | to:Email[],cc?:Email[],bcc?:Email[],subject:string,body_text:string | Gmail draft ID; WRITE, approval required |
| send_mail | to:Email[],cc?:Email[],bcc?:Email[],subject:string,body_text:string | Sent message ID; WRITE, approval required |
| list_calendar_events | time_min:RFC3339,time_max:RFC3339 | Primary-calendar events, max 50, range <=31 days; truncated flag |
| get_calendar_availability | time_min:RFC3339,time_max:RFC3339,timezone:IANA | Primary-calendar busy intervals; range <=31 days |
| create_calendar_event | title:string,start:RFC3339,end:RFC3339,timezone:IANA,attendees?:Email[],description?:string | Event ID/link; WRITE, approval required |
| update_calendar_event | event_id:string,expected_etag:string,title?:string,start?:RFC3339,end?:RFC3339,timezone?:IANA,attendees?:Email[],description?:string | Event ID/link; WRITE, approval required; patch only listed fields |

Email is `{address:string,name?:string}` with validated address; maximum 20 recipients total,
subject <=200 characters, body <=20,000. Plain-text new email only; no attachments or reply/thread
editing. Reject CR/LF header injection. Draft creation and sending are distinct writes; approving
a draft never authorizes sending it. Sending a saved provider draft is outside MVP.

Calendar writes: primary calendar only, timed single events, end > start, duration <=7 days,
valid offsets consistent with timezone. No recurrence/all-day modifications. Use calendar default
reminders, explicitly preview that policy. Attendees trigger update notifications: preview and
use a fixed send-updates policy (all for attendee changes/invitations; none when no attendees).
Store expected_etag for updates; provider conflict requires a fresh read and fresh approval.
Never overwrite changed events using a stale proposal. No arbitrary attendee-calendar access.

## Content and network safety

All fetched websites, files, and email content are untrusted data, never policy or permission.
The system prompt states this boundary, but authorization/validation must enforce it independently.
No dynamic evaluation, shell tools, arbitrary endpoint tool, or credential interpolation.

Read-page SSRF defense must cover DNS resolution, redirect targets, private/link-local/loopback
and metadata ranges, IPv4/IPv6, DNS rebinding, decompression limits, content types, and timeout.
Enforce address validation at connection time, not only before a fetch that resolves again.
Only http/https, public ports 80/443; no authenticated URLs. Max three redirects and 2 MiB response.
Parse readable HTML/plain text without JS execution. Never fetch model Markdown image URLs.

Uploads: check actual bytes/MIME, filename sanitization, ownership, quotas, extraction time (30s),
PDF page count, DOCX decompression and XML external-entity protection. Parse in an isolated worker
process with memory/time limits. Reject archives/macros/unsupported content. Scans without text
get NO_EXTRACTABLE_TEXT, not hallucinated content. PDF pages are 1-based; DOCX has section refs,
not fabricated fixed page numbers. Use bounded PostgreSQL full-text retrieval, no embedding service.

Context budgeting reserves model output and tool-result room. Use provider token counting where
available; otherwise use a documented conservative estimate. MVP does not silently summarize
history. If context does not fit after bounded retrieval, fail CONTEXT_LIMIT and suggest a new chat.
Original history is never discarded to make an undocumented request fit.

## Explicit edge cases

| Event | Required result |
| --- | --- |
| Stop during token streaming | Abort best effort; preserve partial text with cancelled label; no new tools |
| Stop while waiting approval | Cancel pending approval/run atomically; late click cannot execute |
| Stop during external write | Do not claim rollback; reconcile result, show known/unknown outcome |
| Replace/delete OpenRouter key | Cancel active runs using old revision; no new calls with old key; keep partial output |
| Invalid replacement key | Keep previous key and runs unchanged |
| Toggle tools/change model during run | Change future runs only; snapshot remains fixed |
| Disable/disconnect Google capability | Block new calls immediately; cancel runs using it and pending approvals |
| Sign out/close app | Clear client state; server run continues |
| Delete chat/file/account | Hide data and cancel relevant runs immediately, then purge |
| Two devices send together | Transactional single active run; second gets ACTIVE_RUN_EXISTS |
| Approval clicked on two devices | One decision/consumption; second receives current state or conflict |
| Worker restarts mid-model request | Fail interrupted run, keep partial output, require manual paid retry |
| Lost event cursor | Reload coherent snapshot and resume after its sequence |
| Expired OAuth refresh token | Mark reauth_required, no silent SSO/token substitution |
| Ambiguous time/recipient | Ask user for clarification before proposing a write |
| Provider write outcome unknown | Persist unknown result; do not auto-resend, even after restart |

## Owner-approved workspace expansion — 2026-11-11

The explicit reviewed context note and sequence boundary replace earlier covered turns for
subsequent requests, without changing message history or making an automatic paid summary.
Project membership and explicit file shares are rechecked before material is supplied. A
research instruction requests claim-specific stored citations and uncertainty; source storage
and inspection never establish that a claim was independently verified.

Every model submission reserves a conservative catalog-price estimate on the fenced run.
A capped task fails BUDGET_PRICE_UNKNOWN or BUDGET_EXCEEDED before submission. Estimates
remain separate from confirmed provider charges and are not a billing guarantee. Model/tools
are explicit and never switched. Scheduled tasks use the same creation, recovery, concurrency,
quota and confirmation paths. A missed period coalesces; daily local times skip DST gaps and
do not repeat on a folded wall-clock time. No uncertain generation is automatically retried.

Proposal revision cancels the original approval/tool record, inserts a new record with the
same provider-call identity and updated canonical arguments in the continuation checkpoint,
and requires a fresh confirmation. Original arguments remain in the cancelled audit record.
The expiry deadline is preserved. Existing grant checks, ETags, fencing and unknown-outcome
handling still apply. See EXPANSION_SPEC.md for full expansion acceptance.

### Review fixes — 2026-11-12

Scheduled run creation locks/rechecks the schedule and occurrence inside the message/run
transaction. Pause/delete commits before this boundary prevent a new run; a run already created
before pause remains an existing task. Paused work is excluded before the batch limit. Invalid
schedules are paused individually, queued periods coalesce, and schedule maintenance has a
separate worker timer so metadata I/O cannot block outbox delivery. Weekly DST gaps can skip
a whole week; the next-occurrence search spans 21 days.

Files tools now include list_project_documents(offset,limit) and
read_project_document(document_id,offset,limit,version?). The list paginates; reads return at
most 8000 Unicode characters, total_characters and next_offset. Pin a version while paging;
a changed version requires relisting. Every call rechecks current ownership/project membership.
Sources retain document_id and version/range in section; deletion clears source links/excerpts.
Project previews are explicitly incomplete and never substitute for reading the requested text.
