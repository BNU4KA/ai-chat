# Contract: `edit_document` tool

Builtin tool (`files` group). No user approval. Reads a ready Word/PDF in the conversation, applies
instructions, writes a **new** file (never overwrites the source), links it to the assistant message.

## Arguments

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| source_file_id | uuid | yes | Owned file in this conversation; ready; DOCX or PDF |
| instructions | string | yes | 1–4000 chars describing the change |
| format | string | no | Output format; default = same as source (`docx` or `pdf`) |
| filename | string | no | Optional new name |

## Success result

```json
{
  "ok": true,
  "data": {
    "file_id": "uuid",
    "filename": "Report-edited.docx",
    "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "format": "docx",
    "source_file_id": "uuid",
    "fidelity": "structure_preserved"
  }
}
```

`fidelity` may be `structure_preserved` or `best_effort` when the worker had to regenerate and could
not keep all layout. The model MUST tell the user when fidelity is `best_effort`.

## Errors

| code | When |
|------|------|
| NOT_FOUND | Missing / other owner / wrong conversation |
| FILE_NOT_READY | Source still processing or failed |
| UNSUPPORTED_FILE | Not Word/PDF (or legacy DOC if out of scope) |
| VALIDATION_ERROR | Empty instructions |
| TOOL_NOT_CONFIGURED / QUOTA_EXCEEDED | Same as create |
| PROVIDER_ERROR | Cannot produce a safe new file |

Source file bytes and metadata remain unchanged.
