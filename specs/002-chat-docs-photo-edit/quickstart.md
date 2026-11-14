# Quickstart validation: Chat Documents and Photo Edit

## Prerequisites

- Repo deps installed (`pnpm` native binary on PATH as used elsewhere in this project).
- Local Postgres for integration tests (same pattern as polish: container on a local port +
  `DATABASE_URL`).
- Object storage configured for worker tests that persist files, or tests that mock storage at the
  port boundary.
- OpenRouter calls **mocked** in automated tests (no real spend).

## Commands (expected after implementation)

```bash
pnpm typecheck
pnpm lint
pnpm test
DATABASE_URL=… pnpm test:integration
pnpm test:e2e --grep "document|photo edit|create_document|edit_image"   # adjust once tests exist
git diff --check
```

## Scripted scenarios

1. **Create Word** — Agent calls `create_document` with `format=docx` and non-empty content →
   `safe_result.file_id` present → file downloads as DOCX with expected text.
2. **Create PDF** — Same for `format=pdf`.
3. **Edit Word** — Seed a ready DOCX in the conversation → `edit_document` with instructions → new
   `file_id` ≠ source → source download still has old text → new file reflects the change.
4. **Edit PDF** — Same pattern for PDF.
5. **Edit photo** — Seed a ready JPEG/PNG → `edit_image` with prompt (OpenRouter mocked to return a
   tiny PNG) → new image attached to the assistant message; source unchanged.
6. **Fail closed** — Storage unset or provider error → tool `ok:false`, no success attachment.
7. **UI** — After a completed run with a new file, the open chat shows the attachment without
   navigating away (reuse generate_image invalidation behavior).

## Evidence to record in `docs/PROGRESS.md`

- Exact commands and pass counts.
- Note that live OpenRouter image-edit and real DOCX/PDF visual QA remain owner/device checks if not
  covered by mocks.
- Confirm workspace document versions were **not** written.
