# Contract: `edit_image` tool

Builtin tool (`files` group). No user approval. Generatively edits a user (or prior) conversation
photo into a **new** image file via OpenRouter image-to-image (`input_references`). Source unchanged.

## Arguments

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| source_file_id | uuid | yes | Owned ready image in this conversation |
| prompt | string | yes | 1–2000 chars describing the visual edit |
| model_query | string | no | Optional image-capable model hint (same idea as `generate_image`) |

## Success result

```json
{
  "ok": true,
  "data": {
    "file_id": "uuid",
    "filename": "edited-….png",
    "mime": "image/png",
    "source_file_id": "uuid",
    "model_id": "provider/model",
    "model_name": "…",
    "cost_usd": "0.01"
  }
}
```

## Errors

| code | When |
|------|------|
| NOT_FOUND | Missing / wrong conversation |
| FILE_NOT_READY | Source not ready |
| UNSUPPORTED_FILE | Non-image or GIF when full animation edit is refused |
| KEY_MISSING / KEY_INVALID / INSUFFICIENT_CREDITS | OpenRouter key problems |
| MODEL_UNAVAILABLE | No suitable image-edit model |
| TOOL_NOT_CONFIGURED / QUOTA_EXCEEDED | Storage / quota |
| PROVIDER_ERROR / PROVIDER_RATE_LIMIT | Upstream failure |

## Provider note

At implement time, confirm against OpenRouter docs that the request includes the source image in
`input_references` (data URL or HTTPS URL) and that the chosen model accepts reference images.
Persist via `saveAssistantFile` and `message_files` like `generate_image`.
