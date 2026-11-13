# Application API contract (v1)

## Common rules

Base path `/v1`. Auth: `Authorization: Bearer <Supabase access token>`, except health and OAuth
callback. Resolve owner from verified token, never a body field. No session tokens in URLs.
Use JSON UTF-8, RFC 3339 timestamps, UUID resource IDs. Return private responses with no-store.
All request/response DTOs are Zod schemas in packages/contracts; generate OpenAPI from the
same definitions. Reject unknown write fields to catch client/server drift.

Success: `{ "data": ... }`; collections: `{ "data": [...], "next_cursor": null|string }`.
Errors: `{ "error": { "code": "...", "message": "...", "request_id": "...", "details": {} } }`.
Details contain only safe validation/retry metadata. Never return provider stack traces.
Lists take limit (default 30, max 100) and opaque cursor. Conversation cursor uses updated_at/id;
messages use seq ascending, events use run-specific seq. Unowned IDs return the same 404 as missing IDs.

PUT/PATCH/DELETE of a versioned resource requires `If-Match: "<version>"`; absent -> 428,
stale -> 409 VERSION_CONFLICT with current version. Creation returns version. For a missing OpenRouter credential, GET returns version 0 and
initial PUT uses If-Match: "0"; replacements/deletion use the last returned version. DELETE /account
uses the profile version; capability DELETE uses the integration version. Profile initialization
is idempotent and special-cased; run decisions have their own CAS rules rather than If-Match.

New-run POSTs require UUID `Idempotency-Key`. Same owner/route/key and same canonical body
returns the original HTTP status/body with Idempotent-Replayed: true. Same key/different body ->
409 IDEMPOTENCY_CONFLICT. Persist response with the transaction; retain 24 hours minimum.
When racing, one request wins; the loser waits for the record or receives REQUEST_IN_PROGRESS
with Retry-After. Client retries the same key after network uncertainty, never a fresh one.

## Types

```ts
type ToolGroup = 'web' | 'files' | 'gmail' | 'calendar';
type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'cancelled' | 'failed';
type Conversation = {
  id: string; title: string; model_id: string | null; enabled_tools: ToolGroup[];
  version: number; created_at: string; updated_at: string;
};
type Message = {
  id: string; conversation_id: string; run_id: string | null; seq: string;
  role: 'user' | 'assistant'; content: string;
  status: 'pending' | 'complete' | 'partial' | 'failed' | 'cancelled';
  file_ids: string[]; created_at: string;
};
type Run = {
  id: string; conversation_id: string; user_message_id: string; assistant_message_id: string;
  status: RunStatus; model_id: string; attempt: number; version: number;
  last_event_seq: string; error_code: string | null; usage: Usage;
  cancel_requested_at: string | null; created_at: string; finished_at: string | null;
};
type Usage = {
  input_tokens: number | null; output_tokens: number | null; cost_usd: string | null;
  cost_status: 'unknown' | 'estimated' | 'confirmed';
};
```

DTOs omit owner_id and all server checkpoint/secret fields. File, approval, model, source, and
integration DTOs must expose only the safe columns listed below; lock them as fixtures in T04.

## Routes

| Method / path | Request | Result |
| --- | --- | --- |
| GET /profile | — | 200 profile including email and is_admin; provision once from verified Auth identity if needed |
| PATCH /profile | display_name?, theme?, timezone? (valid IANA), locale? (auto/en/ru) | 200 profile/version |
| GET /capabilities | — | 200 configured tool groups, safe limits, disabled reasons |
| GET /credentials/openrouter | — | 200 {configured,source,has_personal_key,last_four,status,version,validated_at}; source is the key actually used; managed hides last_four; version is the personal slot revision when source is managed |
| PUT /credentials/openrouter | {api_key:string} | 200 masked credential; validate before replacing |
| DELETE /credentials/openrouter | — | 204; invalidate further provider calls and cancel affected personal-key runs |
| GET /admin/openrouter-keys | — | 200 key metadata; admin only; never returns the secret |
| POST /admin/openrouter-keys | {label,api_key} | 201 key metadata after provider validation |
| DELETE /admin/openrouter-keys/:id | — | 204; assigned profiles detach |
| GET /admin/users | query?, limit?, cursor? | 200 users with key source, chat count, and recorded spend |
| PATCH /admin/users/:id/openrouter-key | {managed_key_id:uuid\|null, key_priority?:personal\|server} | 200 updated user. Omitted priority stays unchanged. `server` uses the assigned server key; otherwise a personal key wins, then a server key |
| DELETE /admin/users/:id | — | 202 account purge scheduled; cannot delete the caller |
| GET /models | search?, tools_required? | 200 paginated normalized catalog plus cache metadata |
| GET /conversations | query?, limit?, cursor? | 200 collection |
| POST /conversations | {model_id?:string,enabled_tools?:ToolGroup[]} | 201 Conversation |
| GET /conversations/:id | — | 200 Conversation |
| PATCH /conversations/:id | {title?:string,model_id?:string,enabled_tools?:ToolGroup[]} | 200 Conversation |
| DELETE /conversations/:id | — | 202 {deletion_status:'scheduled'} |
| GET /conversations/:id/messages | limit?, cursor? | 200 Message collection with attachment metadata |
| POST /conversations/:id/messages | {client_message_id:uuid,text:string,file_ids:uuid[]} | 202 {message:Message,run:Run} |
| POST /messages/:id/retry | {} + Idempotency-Key | 202 {run:Run}; only latest user turn, terminal previous run |
| GET /conversations/:id/runs | limit?, cursor? | 200 collection, newest first |
| GET /runs/:id | — | 200 {run,assistant_message,tool_calls,approvals,sources}; coherent snapshot |
| POST /runs/:id/cancel | {} | 200 Run with cancellation requested; repeated cancel is idempotent |
| GET /runs/:id/events | after_seq?; Last-Event-ID supported | SSE replay then live events |
| POST /approvals/:id/decision | {decision:'approve'\|'reject',args_hash:string} | 200 safe approval and current run |
| POST /files/uploads | {conversation_id,filename,byte_size,declared_mime} | 201 {file,upload_url,expires_at,required_headers} |
| POST /files/:id/finalize | {} | 202 file in processing; repeating does not duplicate extraction |
| GET /files/:id | — | 200 safe file metadata/status/version |
| GET /files/:id/download | — | 200 {url,expires_at}; private signed URL, five-minute lifetime |
| DELETE /files/:id | — | 202 {deletion_status:'scheduled'} |
| GET /integrations/google | — | 200 {status,account_email,capabilities,version,last_error_code} |
| POST /integrations/google/connect | {capability:'gmail'\|'calendar',return_target:'web'\|'native'} | 200 {authorization_url,expires_at} |
| GET /integrations/google/callback | provider code/state/error | Validate single-use state, finish exchange, 303 to allowlisted completion target |
| DELETE /integrations/google/capabilities/:capability | — | 202 safe integration with capability disabled immediately |
| DELETE /account | {confirmation:'DELETE'} | 202 {deletion_status:'scheduled'}; retry safe while identity still valid |

Health paths are `/health/live`, `/health/ready` outside /v1; no detailed config disclosure.
Profile initialization uses only verified Google identity metadata. Avatar URLs must be handled
as external content with a bounded allowlist/proxy, never a general SSRF-capable fetch.

Normalized model: id, name, context_length?, supports_tools, input_price_per_million_usd?,
output_price_per_million_usd?, supported_parameters[], catalog_fetched_at, catalog_stale.
Prices are decimal strings or null. Pagination metadata must preserve the common envelope.

Safe file: id, conversation_id, filename, byte_size, detected_mime?, status, error_code?, version,
created_at. No object_key in public DTO. Safe approval: id, run_id, tool_call_id, tool_name,
args_hash, structured_preview, status, expires_at, decided_at. Safe integration never contains raw token payloads. Provider scopes may be shown as user-readable permissions.

## Canonical message example

```json
{
  "client_message_id": "10000000-0000-4000-8000-000000000001",
  "text": "Summarize this document and find recent sources.",
  "file_ids": ["20000000-0000-4000-8000-000000000002"]
}
```

Use UUID Idempotency-Key distinct from client_message_id. Server generates the run and assistant
placeholder. Model/tool settings are snapshotted from the locked conversation; they are not
accepted as undocumented fields in the message body. File IDs must be ready, owned, and in this chat.
An attachment-only user message is allowed; both empty text and empty file_ids -> 422.

## Streaming contract

SSE Content-Type text/event-stream, no proxy buffering, heartbeat comment every 15 seconds.
Use authenticated fetch streaming on web/native; do not rely on EventSource URL tokens.

```text
id: 12
event: message.delta
data: {"run_id":"30000000-0000-4000-8000-000000000003","seq":"12","type":"message.delta","timestamp":"2026-11-10T12:00:00Z","payload":{"message_id":"40000000-0000-4000-8000-000000000004","delta":"Hello"}}

```

All persisted events use the same envelope. Event types and required payloads:

- run.started: model_id, assistant_message_id.
- message.delta: message_id, delta. Preserve byte/code-point boundaries through UTF-8 decoding.
- tool.started: tool_call_id, name, safe_summary.
- tool.completed: tool_call_id, status, safe_result, source_ids.
- approval.required: safe approval DTO.
- approval.resolved: approval_id, status.
- usage.updated: Usage.
- run.completed/run.cancelled: assistant_message_id, final_content, usage.
- run.failed: assistant_message_id, partial_content, error_code, safe_message, usage.

Persist events before publishing. Flush pending deltas before terminal events. Snapshot includes
last_event_seq captured atomically with message/tool state. Load snapshot, then stream strictly
after its sequence. On reconnect deduplicate by sequence; never append the snapshot text twice.
Last-Event-ID takes precedence over after_seq; an invalid/future cursor is 422. Expired cursor
returns 410 EVENT_CURSOR_EXPIRED before opening SSE; reload snapshot. After terminal replay,
close stream. Reauth on 401; generic retry backoff for network loss, not a new run.

## Error codes

| HTTP | Code and usage |
| --- | --- |
| 400 | INVALID_REQUEST (malformed JSON/query) |
| 401 | UNAUTHENTICATED / SESSION_EXPIRED |
| 404 | NOT_FOUND for missing or unowned resources |
| 409 | ACTIVE_RUN_EXISTS, USER_RUN_LIMIT, VERSION_CONFLICT, IDEMPOTENCY_CONFLICT, REQUEST_IN_PROGRESS, APPROVAL_ALREADY_DECIDED, TOOL_OUTCOME_UNKNOWN |
| 410 | APPROVAL_EXPIRED, EVENT_CURSOR_EXPIRED |
| 413 | FILE_TOO_LARGE / EXTRACTED_CONTENT_TOO_LARGE |
| 422 | VALIDATION_ERROR, MODEL_TOOLS_UNSUPPORTED, FILE_NOT_READY, KEY_INVALID |
| 428 | VERSION_REQUIRED |
| 429 | RATE_LIMITED with Retry-After |
| 503 | PROVIDER_UNAVAILABLE, TOOL_NOT_CONFIGURED, KEY_VALIDATION_UNAVAILABLE |

Run-level failure codes include KEY_MISSING, KEY_CHANGED, KEY_INVALID, INSUFFICIENT_CREDITS,
MODEL_UNAVAILABLE, CONTEXT_LIMIT, PROVIDER_RATE_LIMIT, PROVIDER_TIMEOUT, PROVIDER_ERROR,
RUN_LIMIT_REACHED, INTEGRATION_REAUTH_REQUIRED, WORKER_INTERRUPTED, TOOL_OUTCOME_UNKNOWN,
APPROVAL_EXPIRED. A failure after the POST was accepted is a persisted run failure, not a retroactive
HTTP error. Never retry it as though the initial POST had not created a run.

## Owner-approved workspace expansion — 2026-11-11

The generated `/openapi.json` includes projects and explicit shares; documents, exact-range
edits, revisions/export; context-note controls; message search/context/branch; workflow starters;
proposal revision; draft estimates; schedules/history/notices; and meeting-slot suggestions.
Project/document/schedule changes use quoted If-Match versions. Range edits verify expected
UTF-16 text and document version. Proposal revisions use the pending argument hash. Search
returns message IDs for loading old-message context. Exports require bearer authorization.
See shared Zod schemas and EXPANSION_SPEC.md. New routes follow the existing error envelope.
