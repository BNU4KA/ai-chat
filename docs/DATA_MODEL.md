# Data model and invariants

## Conventions

UUID primary keys generated server-side; timestamptz stored in UTC; IANA timezone separately.
All owned tables carry owner_id referencing the Auth user, directly or through an enforced
composite FK. Cross-owner associations must fail even through privileged API code. JSONB
uses shared schema validation; it is not an escape hatch for arbitrary provider payloads.
Integer sequences use bigint in SQL and decimal strings in JSON where overflow is possible.
All mutable top-level resources have version integer >= 1, incremented atomically.

Business reads/writes go through API ownership checks. Enable RLS for owned data as defense
in depth. Deny application client access to secret, queue, idempotency, outbox, and OAuth-state
records entirely. Never expose Supabase service-role credentials. Service role bypasses RLS;
a server-side owner check is mandatory even when a policy exists.

## Tables: minimum fields

Types: uuid, text, bool, int, bigint, timestamptz, jsonb, bytea; nullable fields have `?`.
Unless listed otherwise, rows have id uuid, owner_id uuid, created_at timestamptz.
`updated_at` and `version` are required on profiles, conversations, files, runs, and integrations.

| Table | Additional fields |
| --- | --- |
| profiles | id = auth.users.id, email text?, display_name text?, avatar_url text?, locale text auto/en/ru default auto (existing values preserved), timezone text, theme system/light/dark, deletion_requested_at timestamptz?, managed_openrouter_key_id uuid?, key_priority personal/server default personal; no separate owner_id |
| conversations | title text, title_source auto/manual, model_id text?, enabled_tools text[], deleted_at timestamptz? |
| messages | conversation_id uuid, run_id uuid?, seq bigint, role user/assistant, content text, status pending/complete/partial/failed/cancelled, client_message_id uuid? |
| runs | conversation_id uuid, user_message_id uuid, assistant_message_id uuid, attempt int, status enum, model_id text, tool_snapshot jsonb, credential_version int, cancel_requested_at timestamptz?, execution_ms int, model_calls int, tool_calls int, checkpoint jsonb, error_code text?, usage jsonb, started_at timestamptz?, finished_at timestamptz? |
| run_events | run_id uuid, seq bigint, type text, payload jsonb, emitted_at timestamptz |
| tool_calls | run_id uuid, ordinal int, provider_call_id text, name text, arguments jsonb, args_hash text, integration_id uuid?, status proposed/waiting_approval/executing/succeeded/failed/rejected/unknown/cancelled, operation_key text, safe_result jsonb?, provider_reference text?, error_code text?, started_at timestamptz?, finished_at timestamptz? |
| approvals | run_id uuid, tool_call_id uuid, args_hash text, status pending/approved/rejected/expired/cancelled, expires_at timestamptz, decided_at timestamptz?, consumed_at timestamptz? |
| files | conversation_id uuid, object_key text, original_name text, detected_mime text?, byte_size bigint, status pending_upload/processing/ready/failed/deleted, sha256 text?, extracted_chars int?, page_count int?, error_code text?, deleted_at timestamptz? |
| message_files | message_id uuid, file_id uuid; composite primary key, no separate id |
| document_chunks | file_id uuid, ordinal int, text text, page int?, section text?, search_vector tsvector generated/maintained by DB |
| run_sources | run_id uuid, citation_id text, kind web/file/mail/calendar, title text, url text?, file_id uuid?, page int?, excerpt text?, retrieved_at timestamptz |
| integrations | provider google, google_subject text, account_email text, capabilities jsonb, granted_scopes text[], status connected/reauth_required/disconnecting/disconnected, last_error_code text? |
| encrypted_credentials | provider openrouter/google, integration_id uuid?, credential_version int, ciphertext bytea, nonce bytea, auth_tag bytea, encryption_key_version text, last_four text?, validated_at timestamptz?, updated_at timestamptz |
| managed_openrouter_keys | label text, ciphertext bytea, nonce bytea, auth_tag bytea, encryption_key_version text, last_four text, version int, validated_at timestamptz; no owner_id; worker role only |
| oauth_states | state_hash text, code_verifier_ciphertext bytea, integration_capability text, return_target text, expires_at timestamptz, consumed_at timestamptz? |
| idempotency_records | route text, key uuid, request_hash text, response_status int?, response_body jsonb?, expires_at timestamptz |
| outbox | topic text, payload jsonb, dispatched_at timestamptz?, retry_at timestamptz?, attempts int |
| rate_limits | bucket text, window_start timestamptz, count int; composite key owner/bucket/window, no separate id |

Queue tables belong to pg-boss, not the application API. No agent_presets table in MVP: there
is one agent, and conversation tool settings are sufficient. Internal model/tool history needed
for continuation lives in validated checkpoint/tool records; it is not a client-visible system message.
Encrypted OAuth state must include the full authenticated-encryption metadata, using the same
secret-handling helper as credentials; the abbreviated field name does not authorize plaintext storage.

Usage schema: input_tokens?, output_tokens?, cost_usd?, cost_status estimated/confirmed/unknown,
provider_generation_ids[]. Store decimal cost as numeric/string, not an IEEE float for accounting.
Do not combine estimated and confirmed amounts into a single misleading total.
The admin user list sums recorded `usage.cost_usd` values and labels that figure as recorded
spend. It is not an OpenRouter invoice. `profiles.key_priority` chooses which OpenRouter key a
new run uses: `server` uses the assigned server key when one is assigned, otherwise a personal
key wins, then a server key. A run stores `keySource` and `managedKeyId` inside `tool_snapshot`
so a personal key and a server key with the same version stay distinct.

## Required constraints and indexes

- Unique (conversation_id, seq) for messages; allocate under conversation lock.
- Unique (owner_id, client_message_id) where client_message_id is not null.
- Unique (run_id, seq) for run_events, with seq allocated under run lock.
- Partial unique conversation_id on runs where status in queued/running/waiting_approval.
- Unique (user_message_id, attempt); attempt allocation and active-run check in one transaction.
- Unique (run_id, ordinal) and (run_id, provider_call_id) for tool_calls.
- Unique tool_call_id on approvals; unique operation_key for external write attempts.
- Unique (owner_id, route, key) for idempotency; preserve at least 24 hours.
- One current OpenRouter credential per owner; one Google integration per owner.
- Unique (run_id, citation_id), (file_id, ordinal), and message_files membership.
- Index conversations(owner_id, updated_at desc, id); messages(conversation_id, seq).
- Index runs(owner_id, status), run_events(run_id, seq), files(owner_id, conversation_id, status).
- GIN index on document_chunks.search_vector; filter owner/conversation/file before ranking.
- Check file quotas, run concurrency, credential revision, and capability permissions transactionally.
- Composite owner/resource foreign keys or equivalent DB triggers enforce same-owner relationships.
- Gmail and Calendar token ownership must match the selected integration; no global provider cache.

## Lifecycle

New message transaction: lock owner quota and conversation, verify no active run, validate ready
attachments/settings, allocate sequence, insert user/assistant placeholder/run, reserve quota,
record idempotency and outbox. Commit before enqueue notification. A dispatcher retries outbox
delivery; queue consumption deduplicates by run_id. API must not return a run that can be lost
between DB commit and queue insertion.

File processing job is similarly queued through outbox. Upload finalize verifies stored bytes,
actual type, owner path, and limits before processing. A storage object is never trusted only
because a client said upload succeeded. Clean abandoned uploads older than 24 hours.

Run terminal transition releases active quota, finalizes message status, and appends the terminal
event in one transaction. Checkpoints and published events must describe committed state.

Chat deletion first soft-deletes, requests cancellation, cancels approvals, and blocks reads/new
runs immediately. Background purge removes rows, chunks, and private objects within 24 hours.
Files belong to one conversation; deletion cancels active runs using that file before purge.
File deletion removes its object, chunks, and source excerpts, and invalidates checkpoints that
would reread it. Historical assistant/user messages may still quote its content; the UI must say
that deleting the conversation/account is necessary to remove those copies as well.

Account deletion marks profile unavailable, revokes sessions as supported, cancels runs, and
queues provider revocation plus purge before deleting the Auth user. Retain encrypted revocation
material only in a restricted cleanup job until revocation succeeds or the documented 24-hour
retry deadline expires, then erase it. No resurrection of a deleted account's history on sign-in.
Provider outage may make revocation unconfirmed; local access still stops immediately.

Keep messages, task records, and citations until conversation/account deletion. Compact old
event deltas after 30 days, retaining final snapshots and tool outcomes. An expired replay cursor
returns EVENT_CURSOR_EXPIRED; client reloads the snapshot. Operational logs expire after 14 days,
backups after 30 days under the configured deployment policy. Document actual host behavior.

## Owner-approved workspace expansion — 2026-11-11

Migration 0004 adds projects, explicit project_files, documents/document_revisions, schedules,
schedule_occurrences and notices with forced RLS and composite owner FKs. Conversations store
project_id, context_note/context_through_seq, research_mode and optional budget_usd. Runs retain
estimated_committed_usd separately from provider usage. Projects do not merge chat histories;
only explicitly edited memory, project documents and shared-file references enter new runs.
Occurrences are unique by schedule/due time; their run creation uses the occurrence UUID as
idempotency and client-message key. New owned data participates in account cleanup. Original
file/chat deletion revokes project reads. Detailed behavior is in EXPANSION_SPEC.md.

Migration 0005 adds an owner-constrained optional run_sources.document_id reference. Source
insertion checks/locks the document; document deletion clears references/excerpts before removing
the row. Account cleanup removes sources before documents. Project deletion explicitly scopes a
worker transaction to the owner so soft-deleted chats are detached despite API RLS; retained
documents receive a new version/revision when their project is removed.
