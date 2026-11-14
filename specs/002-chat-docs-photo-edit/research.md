# Research: Chat Documents and Photo Edit

## R1. Tool surface
- **Decision**: Add three builtin tools in the `files` group: `create_document`, `edit_document`,
  `edit_image`. Keep `generate_image` unchanged.
- **Rationale**: Matches the three user stories; separate schemas keep arguments honest (`format` +
  `content` vs `source_file_id` + `instructions` vs `source_file_id` + `prompt`). Builtin (no
  approval) matches `generate_image` — files stay inside the user’s conversation.
- **Alternatives**: One `manage_file` mega-tool (ambiguous for the model). Write-tool + approval
  (unnecessary friction for in-chat downloads).

## R2. Persisting assistant-produced files
- **Decision**: Generalize `saveGeneratedImage` to `saveAssistantFile` (same quota, object storage,
  `files` row `status=ready`, `message_files` link). Optional `derived_from_file_id` on edits.
- **Rationale**: Generated images already appear in chat via this path; create/edit must not invent a
  second storage pipeline.
- **Alternatives**: Upload via the user upload API (wrong actor). Only return base64 in the tool
  result without storing (breaks download and deletion rules).

## R3. Photo edit provider API
- **Decision**: Implement `editOpenRouterImage` using OpenRouter’s image generation API with
  `input_references` (image-to-image). Pass the source photo as a data URL or short-lived signed
  URL. Reuse model picking among models that support image output; prefer models documented for
  reference-image / edit when filtering the catalog. Re-validate the exact path
  (`/api/v1/images` vs chat `modalities`) against [OpenRouter image generation docs](https://openrouter.ai/docs/guides/overview/multimodal/image-generation) at implement time.
- **Rationale**: Official docs describe `input_references` for image-to-image; today’s
  `generateOpenRouterImage` uses chat completions with `modalities: ['image','text']` and has no
  reference image. Extending for edit needs the documented reference field.
- **Alternatives**: Only deterministic crop/rotate (rejected by owner). Call a second vendor outside
  OpenRouter (forbidden without scope decision).

## R4. Word/PDF create
- **Decision**: Build bytes in the worker with `docx` (DOCX) and `pdf-lib` (PDF) from structured
  content the model passes into the tool (title, sections, paragraphs, lists, simple tables).
- **Rationale**: No document library exists in the repo today (extract-only via `unpdf` / OOXML unzip).
  Generating real files is required for downloadable attachments.
- **Alternatives**: Return Markdown only (fails the spec). Shell out to LibreOffice (new service /
  binary dependency — too heavy for MVP).

## R5. Word/PDF edit with structure preservation
- **Decision**: Always write a **new** file. For DOCX: load the source package, attempt a structured
  rewrite (clone OOXML and apply text/table updates where safe; otherwise regenerate with `docx`
  using extracted structure + model instructions). For PDF: extract text/pages, regenerate with
  `pdf-lib` guided by instructions, preserving page/section order when possible. If major structure
  cannot be kept, return a tool error or a success payload that includes an honest `fidelity` note
  the model must surface — never a corrupt empty file.
- **Rationale**: Owner requires new file + try to fully preserve structure. Perfect layout identity
  is not guaranteed by text extraction limits already documented for Word.
- **Alternatives**: Overwrite the source object (forbidden). Pixel-perfect PDF editors (out of scope).

## R6. Client behavior
- **Decision**: Rely on existing attachment rendering and run invalidation (`['run']` /
  `['messages']` / `['files']` on tool completion). Add UI copy only if tool pills need human labels.
- **Rationale**: Spec SC for “appears without leaving chat” is the same bug class already fixed for
  `generate_image`.
- **Alternatives**: Custom document editor UI (out of scope).

## R7. Workspace documents
- **Decision**: Do not write Projects & tasks document versions in this feature.
- **Rationale**: Owner deferred workspace; existing E03 remains separate.
- **Alternatives**: Dual-write to workspace (rejected for v1).
