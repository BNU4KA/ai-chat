# Data Model: Chat Documents and Photo Edit

## Entities

### Conversation file (`files`) — existing

| Field | Notes |
|-------|--------|
| id | uuid |
| owner_id | profile |
| conversation_id | chat ownership |
| object_key | storage key |
| original_name | download name (`.docx` / `.pdf` / image ext) |
| detected_mime | set on save for assistant-produced files |
| byte_size | enforced against `LIMITS` |
| status | assistant saves as `ready` |
| sha256 | content hash |
| error_code | null when ready |
| version | optimistic concurrency if used |

**New (optional migration `0009`)**:

| Field | Notes |
|-------|--------|
| derived_from_file_id | nullable uuid FK → `files.id`; set on edit_document / edit_image |

### Message ↔ file (`message_files`) — existing

Assistant message that completed the tool gets a row for each new file so the chat UI shows the
attachment on that turn.

### Tool call (`tool_calls`) — existing

`create_document` / `edit_document` / `edit_image` rows with `safe_result` containing at least
`file_id`, `filename`, `mime`, and for edits `source_file_id` (+ optional `fidelity`).

### Derived file (product concept)

A conversation file produced by create/edit. Edits always create a new row; source row unchanged.

## Validation rules

- Create: `format` ∈ `{docx, pdf}`; content non-empty after trim; size ≤ `LIMITS.fileBytes`.
- Edit document: `source_file_id` must be owned, in the same conversation, `status=ready`, mime/name
  Word or PDF; instructions non-empty.
- Edit image: source ready image (`image/jpeg` or `image/png` required; WebP optional; GIF → first
  frame or refuse with clear code).
- Quota: same `filesPerUser` / `storedBytesPerUser` checks as `saveGeneratedImage`.
- Never update source `object_key` bytes for an edit.

## State transitions

```text
create/edit tool starts
  → tool_calls status executing
  → build/provider call
  → insert files(ready) + message_files
  → tool_calls completed + safe_result
  → on failure: tool_calls failed, no success file card
```

Source file lifecycle is unchanged by edits.
