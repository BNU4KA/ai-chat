# Contract: `create_document` tool

Builtin tool (`files` group). No user approval. Creates a **new** conversation file and attaches it
to the current assistant message.

## Arguments

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| format | string | yes | `docx` or `pdf` |
| title | string | yes | 1–200 chars |
| content | object | yes | Structured body the worker renders (sections / paragraphs / lists / simple tables). Exact JSON shape is defined in `toolSchemas` at implement time; empty body after normalize → tool error. |
| filename | string | no | Optional base name; worker adds the correct extension. |

## Success result (`safe_result`)

```json
{
  "ok": true,
  "data": {
    "file_id": "uuid",
    "filename": "Report.docx",
    "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "format": "docx"
  }
}
```

## Errors

| code | When |
|------|------|
| TOOL_NOT_CONFIGURED | Object storage unavailable |
| QUOTA_EXCEEDED / FILE_QUOTA | User storage limits |
| VALIDATION_ERROR | Empty content, bad format |
| PROVIDER_ERROR | Builder failure |

No new public HTTP route; files are downloaded via existing `/v1/files/:id/download`.
