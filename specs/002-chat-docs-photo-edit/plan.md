# Implementation Plan: Chat Documents and Photo Edit

**Branch**: `002-chat-docs-photo-edit` | **Date**: 2026-11-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-chat-docs-photo-edit/spec.md`

## Summary

Add assistant tools so a chat can create Word/PDF files, edit an existing conversation Word/PDF into a
**new** file while attempting to preserve structure, and generatively edit a user-sent photo into a
**new** image. Storage and message linking reuse the `generate_image` → `saveGeneratedImage` path,
generalized to any assistant-produced file. Workspace document versions stay out of scope.

## Technical Context

**Language/Version**: TypeScript 6.0 on Node (API, worker), React 19 / React Native 0.88 (Expo client).

**Primary Dependencies**: Existing stack (Expo 58, Fastify, pg-boss, TanStack Query 5, OpenRouter). New
worker libraries for document bytes: `docx` (DOCX create/structure write) and `pdf-lib` (PDF create).
Image edit extends OpenRouter image APIs already used by `generateOpenRouterImage`.

**Storage**: PostgreSQL + existing object storage for `files`. Optional migration
`0009_file_derived_from.sql` adds `files.derived_from_file_id` for edit lineage.

**Testing**: Vitest unit + integration (`pnpm test`, `pnpm test:integration` against local Postgres),
Playwright e2e for attachment visibility after create/edit, contract tests for tool schemas and
OpenRouter image-edit request shape (mocked fetch). No real OpenRouter spend or real user mail in CI.

**Target Platform**: Same as MVP — iOS development build, Expo web, API + worker.

**Project Type**: pnpm monorepo — `apps/client`, `apps/api`, `apps/worker`, `packages/*`.

**Performance Goals**: Document/photo tool steps complete within existing model/tool timeouts; new file
appears in the open chat when the run finishes (same class as generated images).

**Constraints**: One model-driven agent; no new services; production fail-closed; never overwrite source
files; structure preservation is best-effort with honest failure messaging; no workspace document write
in this feature; validate OpenRouter endpoints against official docs at implement time.

**Scale/Scope**: Three builtin tools, shared file-save helper, OpenRouter image-edit helper, DOCX/PDF
builders, migration for lineage, prompt/tool wiring, tests. Client changes are small if attachments
already render from `message_files`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is an unfilled template. Gates from `AGENTS.md`:

| Gate | Status |
|------|--------|
| Fixed stack; no extra apps/auth/services | PASS: tools + libraries inside worker/packages only. |
| One model-driven agent; no multi-agent / MCP / plugins | PASS: builtin tools on the existing agent. |
| Validate provider APIs against official docs | PASS: research cites OpenRouter image + `input_references`; re-check at implement. |
| Production fail-closed; no silent test doubles | PASS: missing storage/key/model → clear tool error. |
| Sandbox credentials / synthetic data in tests | PASS: mocked OpenRouter; synthetic DOCX/PDF/PNG. |
| No secrets or local paths committed | PASS. |
| Evidence-based completion; PROGRESS updated | PLANNED: quickstart. |
| Word/PDF/workspace conflicts | PASS: UX “no editing/export” for Word is superseded for **chat attachments**; workspace versions remain deferred (owner 2026-11-15). |

Post-design re-check: PASS. Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-chat-docs-photo-edit/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── create-document.md
│   ├── edit-document.md
│   └── edit-image.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/
  limits.ts                 # BUILTIN_TOOLS += create_document, edit_document, edit_image
  schemas / openapi         # if tool names are exposed in contracts

packages/agent-runtime/src/
  tools.ts                  # schemas + descriptions
  types.ts                  # ports
  execute.ts                # dispatch + tool availability + system hints

packages/integrations/src/
  openrouter.ts             # editOpenRouterImage (input_references) + tests
  documents/                # NEW: buildDocx, buildPdf, bestEffortEditDocx/Pdf
  extract-child.ts          # unchanged read path; edit may reuse extract for source text

packages/services/src/
  files.ts                  # saveAssistantFile (generalize saveGeneratedImage); optional lineage
  models.ts                 # pickImageEditModel if distinct from generate

apps/worker/src/
  index.ts                  # wire ports for create/edit document and edit image

supabase/migrations/
  0009_file_derived_from.sql

apps/client/src/
  (minimal) ensure run/file invalidation shows new attachments; copy for tool labels if needed

docs/
  API_CONTRACT / UX_SPEC / PROGRESS / EXPANSION notes for owner decisions
```

## Complexity Tracking

No unjustified complexity. Structure-preserving document edit is explicitly required by the owner;
best-effort OOXML/`pdf-lib` builders are the smallest path that still produces downloadable files.
