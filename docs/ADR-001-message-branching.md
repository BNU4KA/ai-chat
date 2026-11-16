# ADR-001: Message branching for edited user messages

Status: accepted for implementation (owner request, 2026-11-16). Supersedes the "edit supersedes later
messages" rule in `API_CONTRACT.md` (POST /messages/:id/edit) once implemented.

## Context

Editing a user message today sets `superseded_at` on every later message in the conversation. Those rows
stay in the database but are hidden from lists, search, context and run input
(`supabase/migrations/0008_message_supersede.sql`). The user sees the old answers disappear and cannot
return to them. The owner asked for branching instead: an edit should create a branch, keep the earlier
branch, and let the user switch between them.

Queries that currently filter on `superseded_at is null` (about 15 places in `packages/database` and
`apps/api`) are the only consumers of the visible thread. Runs reference messages by id, and attachments
and approvals hang off runs and messages.

## Decision

Model the conversation as a tree of branches. Each branch is a linear list of messages. A branch forks
from its parent at one edited user message.

Schema (migration `0014_message_branches.sql`, planned):

- `conversation_branches(id uuid pk, owner_id, conversation_id, parent_branch_id uuid null,
  fork_seq bigint null, created_at)`. The root branch has `parent_branch_id` null and `fork_seq` null.
  `fork_seq` is the `seq` of the edited user message that starts the child branch.
- `messages.branch_id uuid` (not null after backfill). Existing messages go to the root branch.
- `conversations.active_leaf_branch_id uuid`. The leaf branch the user currently sees.

Visible thread for a leaf `L`: walk `L` up to the root with a recursive CTE. For each ancestor `A` whose
child on the path is `C`, include messages of `A` with `seq < C.fork_seq`. For `L` itself, include all of
its messages. Messages that belong to a branch not on the path are never shown.

Edit (`POST /messages/:id/edit`) on a user message `M` at `seq S` in branch `B`:

1. Create child branch `C` of `B` with `fork_seq = S` (if the edit creates a second sibling for `S`).
2. Insert the edited user message in `C` with the next `seq`, then the new assistant placeholder and run.
3. Set `active_leaf_branch_id` to `C`. Nothing is deleted or marked superseded.

Switching (`POST /messages/:id/select-branch`, body `{branch_id}`): choose a sibling branch (same parent,
same `fork_seq`) and set the active leaf to its newest descendant leaf. Returns the new thread.

Retry and regenerate keep their current behaviour: they add attempts to the same assistant message, not a
new branch. Regenerate-as-branch is out of scope for this ADR.

Message DTO gains `branch: {index, count}` for user messages that have siblings, so the client can show
`< 2/3 >`. Context, run input, search and compaction use the visible thread of the active leaf only.

## Migration of existing data

1. Create one root branch per conversation and set `active_leaf_branch_id` to it.
2. Set `branch_id` of every message to its conversation's root branch.
3. Keep rows that have `superseded_at` set: they remain in the root branch and stay hidden by a rule
   `superseded_at is null` in the visible-thread function. They are not turned into branches, because the
   original edit history cannot be reconstructed reliably.
4. Add indexes on `(conversation_id, branch_id, seq)` and `(parent_branch_id)`.

The migration must run before the new API is deployed. A read-only check counts visible messages before
and after for every conversation.

## Consequences

- Every query that builds a thread goes through one SQL function `visible_thread(conversation_id, leaf)`.
  This keeps the 15 call sites consistent.
- Runs keep their `user_message_id` and `assistant_message_id`. Old runs stay readable.
- Pending or running work on the current leaf blocks switching and editing (one active run per conversation
  remains the rule).
- Storage grows with edits; shared prefixes are not copied.

## Alternatives considered

- **Copy-on-edit** (duplicate the prefix into a new conversation). Simple queries, but duplicates messages
  and attachments and makes shared history diverge. Rejected.
- **Full message tree** (`parent_id` on every message). Equivalent behaviour, but every message needs its own
  parent and the visible-thread query becomes a deep recursive walk over messages. Rejected for complexity.
- **Restore-only** (show superseded messages behind a "restore" action). No real branching and no switcher.
  Rejected because it does not meet the owner's request.

## Verification plan

- Integration: edit creates a sibling branch and no message is deleted; context and run input use only the
  active path; switching returns the other thread and its run history; a run on the leaf blocks switching.
- Migration test on a copy of representative data: visible thread before and after is identical for every
  conversation.
- Client: edit has no confirmation modal; the switcher appears only when siblings exist; the edit field keeps
  focus and is scrollable for long messages (the CHAT-202 UX fixes).
- Existing e2e tests for editing and retry must keep passing.

## Open items

- Owner confirmation of the switcher behaviour (sibling switch moves to that branch's newest leaf).
- Retention for superseded legacy rows (currently kept indefinitely; account deletion removes them).
