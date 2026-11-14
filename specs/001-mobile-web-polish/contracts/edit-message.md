# Contract: Edit a user message and regenerate

`POST /v1/messages/:id/edit`

## Request

Headers: `Authorization: Bearer <session>` and `Idempotency-Key: <uuid>` (required).

```json
{ "text": "string, 1..MAX_MESSAGE_CHARS, trimmed non-empty" }
```

## Responses

| Status | Body | When |
|--------|------|------|
| 202 | `{ "data": { "run": Run } }` | Edit applied, later messages superseded, new run queued. |
| 202 + `idempotent-replayed: true` | same body | Same key and same body replayed. |
| 404 `NOT_FOUND` | error | The message does not exist, is not a user message, is not owned by the caller, or is superseded. |
| 409 `ACTIVE_RUN_EXISTS` | error | The conversation has a queued, running, or approval-waiting run. |
| 409 `USER_RUN_LIMIT` | error | The per-user active run limit is reached. |
| 422 `VALIDATION_ERROR` | error | Text is empty or too long, or the key reuses a different body. |
| 422 `KEY_MISSING` / model errors | error | Same model and key validation as send and retry. |
| 429 `RATE_LIMITED` | error | The per-minute run rate is exceeded. |

## Side effects (single transaction)

1. `messages.content` of `:id` = `text`.
2. `superseded_at = now()` on all later messages in the conversation.
3. A new pending assistant message plus a run (`attempt + 1`, `user_message_id = :id`) and a `run.execute` outbox row.

## Read-side contract changes

- `GET /v1/conversations/:id/messages` (both tail and cursor) omits superseded messages.
- `GET /v1/search/messages` omits superseded messages.
- `GET /v1/messages/:id/context` returns 404 for a superseded message.
- `POST /v1/messages/:id/branch` remains for compatibility, copies only non-superseded messages, and is no
  longer called by the client.
