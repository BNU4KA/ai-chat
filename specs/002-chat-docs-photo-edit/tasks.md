---

description: "Task list for Chat Documents and Photo Edit"
---

# Tasks: Chat Documents and Photo Edit

**Input**: Design documents from `specs/002-chat-docs-photo-edit/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: `AGENTS.md` requires automated checks for code tasks. quickstart.md lists scripted create/edit
scenarios. Include unit/integration tests with mocked OpenRouter and synthetic files; no real spend.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 create Word/PDF · US2 edit Word/PDF · US3 edit photo · US4 no external send

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and package surface for document builders.

- [x] T001 Add `docx` and `pdf-lib` dependencies to the package that will build documents (prefer `packages/integrations` or `packages/services` per plan) and update `pnpm-lock.yaml`.
- [x] T002 [P] Create document builder module stubs `packages/integrations/src/documents/index.ts` exporting `buildDocx` / `buildPdf` placeholders that throw until implemented.
- [x] T003 [P] Re-read OpenRouter image-generation docs at implement time and note the chosen edit endpoint/shape in a short comment-free note inside `packages/integrations/src/openrouter.ts` research usage (implement against official `input_references`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared file save, tool registration, and worker port wiring used by all stories.

**⚠️ CRITICAL**: No user story tool work can ship until this phase is complete.

- [x] T004 Create migration `supabase/migrations/0009_file_derived_from.sql` adding nullable `files.derived_from_file_id uuid references files(id)` (and index if useful).
- [x] T005 Generalize `saveGeneratedImage` into `saveAssistantFile` (keep `saveGeneratedImage` as a thin wrapper) in `packages/services/src/files.ts`: accept mime/filename/bytes, optional `derivedFromFileId`, insert `files` + `message_files`, enforce quota, fail closed if storage unset.
- [x] T006 [P] Export `saveAssistantFile` from `packages/services/src/index.ts`.
- [x] T007 [P] Add `create_document`, `edit_document`, `edit_image` to `BUILTIN_TOOLS` and `toolGroup` (`files`) in `packages/contracts/src/limits.ts`.
- [x] T008 [P] Add Zod schemas and descriptions for the three tools in `packages/agent-runtime/src/tools.ts` matching `contracts/create-document.md`, `contracts/edit-document.md`, `contracts/edit-image.md`.
- [x] T009 Extend `AgentPorts` / types with `createDocument`, `editDocument`, `editImage` in `packages/agent-runtime/src/types.ts`.
- [x] T010 Dispatch the three tools in `packages/agent-runtime/src/execute.ts` (availability checks like `generate_image`, system hint lines when ports exist).
- [x] T011 Wire empty/fail-closed port stubs in `apps/worker/src/index.ts` that return `TOOL_NOT_CONFIGURED` until story implementations fill them (so the agent does not crash if a model calls early).

**Checkpoint**: Typecheck passes; tools are registered; saving a synthetic PNG via `saveAssistantFile` works in a unit/integration helper test if added later per story.

---

## Phase 3: User Story 1 - Create a Word or PDF in chat (Priority: P1) 🎯 MVP

**Goal**: User asks for a Word or PDF; assistant produces a downloadable new attachment in the answer.

**Independent Test**: Ask for a short DOCX and a short PDF in separate runs; each answer has a downloadable file with the requested content.

### Tests for User Story 1

- [x] T012 [P] [US1] Unit tests for `buildDocx` / `buildPdf` in `packages/integrations/src/documents/*.test.ts` (non-empty bytes, correct magic/`%PDF` / ZIP header, title/body present when extracted or inspected).
- [x] T013 [P] [US1] Integration or service test that `create_document` port saves a ready file linked to an assistant message (mocked storage if needed) covering empty-content → validation error.

### Implementation for User Story 1

- [x] T014 [US1] Implement `buildDocx` and `buildPdf` from structured `content` + `title` in `packages/integrations/src/documents/` (sections, paragraphs, lists, simple tables).
- [x] T015 [US1] Implement worker `createDocument` port in `apps/worker/src/index.ts`: validate args, build bytes, `saveAssistantFile`, return `file_id` / mime / filename per contract.
- [x] T016 [US1] Add concise system/tool guidance in `packages/agent-runtime/src/execute.ts` so the model calls `create_document` when the user asks to create a Word/PDF file (not only paste text).
- [ ] T017 [US1] Confirm client shows the new attachment after run completion (reuse run/files invalidation; fix `apps/client/src/use-run.ts` or chat only if a gap remains).

**Checkpoint**: Scripted create DOCX + PDF succeed with downloadable attachments; failure paths return tool errors without fake cards.

---

## Phase 4: User Story 2 - Edit a Word or PDF from the conversation (Priority: P1)

**Goal**: Edit produces a **new** file; try to preserve structure; source unchanged.

**Independent Test**: Seed a short DOCX, ask to change one named detail; new file has the change; old download unchanged.

### Tests for User Story 2

- [x] T018 [P] [US2] Unit tests for best-effort edit helpers in `packages/integrations/src/documents/` (source unchanged fixture; new bytes differ; structure markers preserved when possible).
- [x] T019 [P] [US2] Integration test: ready source file + `edit_document` → new `file_id`, `derived_from_file_id` set, source sha/bytes unchanged; NOT_FOUND / FILE_NOT_READY cases.

### Implementation for User Story 2

- [x] T020 [US2] Implement load-source + best-effort structured rewrite / regenerate for DOCX and PDF in `packages/integrations/src/documents/` (always new bytes; set fidelity `structure_preserved` or `best_effort`).
- [x] T021 [US2] Implement worker `editDocument` port in `apps/worker/src/index.ts`: ownership/conversation/ready checks, build new file, `saveAssistantFile` with `derivedFromFileId`, return contract payload including `fidelity`.
- [x] T022 [US2] Tool guidance: on “edit this document”, call `edit_document` with `source_file_id`; tell the user when fidelity is `best_effort`.
- [x] T023 [US2] Refuse legacy `.doc` edit with clear `UNSUPPORTED_FILE` (read/extract may remain as today).

**Checkpoint**: Edit Word and PDF yield new attachments; originals intact; corrupt/empty success impossible.

---

## Phase 5: User Story 3 - Edit a photo the user sent (Priority: P1)

**Goal**: Generative edit of an attached JPEG/PNG into a new image; original kept; visible without leaving chat.

**Independent Test**: Attach JPEG/PNG, ask for a concrete visual change; new image appears in the same conversation; original remains.

### Tests for User Story 3

- [x] T024 [P] [US3] Unit test `editOpenRouterImage` in `packages/integrations/src/openrouter.test.ts` with mocked fetch: request includes `input_references` (or documented equivalent); parses returned image bytes; maps 401/402/429 codes like generate.
- [x] T025 [P] [US3] Integration test: ready PNG source + mocked provider → new image file linked to assistant message; source unchanged; unsupported GIF policy covered.

### Implementation for User Story 3

- [x] T026 [US3] Implement `editOpenRouterImage` in `packages/integrations/src/openrouter.ts` (and export from `packages/integrations/src/index.ts`) using official image-to-image/`input_references` shape; validate against docs at implement time.
- [x] T027 [US3] Add model selection helper if needed (`pickImageEditModel` or extend `pickImageModel`) in `packages/services/src/models.ts` for image-output models that accept references.
- [x] T028 [US3] Implement worker `editImage` port in `apps/worker/src/index.ts`: load source bytes, call edit API, `saveAssistantFile` with lineage, return contract fields including optional cost.
- [x] T029 [US3] Tool guidance for explicit photo-edit requests; GIF → first-frame edit with honest note or clear refuse per FR-008.
- [ ] T030 [US3] Verify UI shows the new image when the run completes without leaving the chat (same invalidation path as `generate_image`).

**Checkpoint**: Photo edit happy path and fail-closed paths covered by automated tests; live OpenRouter check remains optional owner evidence.

---

## Phase 6: User Story 4 - Review before trusting external file actions (Priority: P2)

**Goal**: Create/edit only produce in-chat attachments; no email/drive send as part of this feature.

**Independent Test**: Create a document and edit a photo; only conversation files appear; no mail/calendar write tools are invoked by these flows by default.

### Implementation for User Story 4

- [x] T031 [US4] Assert in agent wiring that `create_document` / `edit_document` / `edit_image` are builtin non-write-approval tools and do not call Google mail/drive ports (`packages/agent-runtime/src/execute.ts`, `packages/contracts/src/limits.ts`).
- [x] T032 [P] [US4] Add a focused test or comment-free assertion in an existing agent/tool test file that these tools are not classified as external send/write-approval tools.
- [x] T033 [US4] Manual/scripted check recorded in progress: successful create/edit never auto-emails or uploads outside the account.

**Checkpoint**: Feature cannot silently exfiltrate files via mail/drive as part of create/edit.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Docs, UX copy, and full verification.

- [x] T034 [P] Update `docs/UX_SPEC.md` / `docs/EXPANSION_SPEC.md` owner notes: chat Word/PDF create+edit and photo edit are in scope; workspace versions still deferred.
- [x] T035 [P] Update `docs/API_CONTRACT.md` or tool inventory docs if the project lists builtin tools there.
- [x] T036 [P] Add Russian/English UI strings only if tool pills or errors need user-facing labels in `apps/client/src/translations.ts`.
- [ ] T037 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration`, relevant e2e, and `git diff --check` per `specs/002-chat-docs-photo-edit/quickstart.md`.
- [x] T038 Record commands, results, remaining live OpenRouter/device checks, and next steps in `docs/PROGRESS.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **blocks all stories**.
- **US1 (Phase 3)**: After Foundational — MVP.
- **US2 (Phase 4)**: After Foundational; shares document builders with US1 (prefer US1 first, or parallelize carefully on `documents/`).
- **US3 (Phase 5)**: After Foundational; independent of US1/US2 except shared `saveAssistantFile`.
- **US4 (Phase 6)**: After the tools exist (after US1–US3 registration at least).
- **Polish (Phase 7)**: After desired stories complete.

### User Story Dependencies

- **US1**: Needs T004–T011 + document builders.
- **US2**: Needs US1 builders + edit helpers; must not overwrite files from US1.
- **US3**: Needs T005 + OpenRouter edit helper; independent of document stories.
- **US4**: Cross-cutting assertions on tool classification.

### Parallel Opportunities

- T002 and T003 after T001.
- T006, T007, T008 in parallel after T005 starts/lands.
- T012/T013 in parallel; T018/T019; T024/T025.
- US3 can proceed in parallel with US1/US2 once Foundational is done.
- T034–T036 in parallel during polish.

### Parallel Example: After Foundational

```bash
# Developer A — US1 create
Task: T014 buildDocx/buildPdf
Task: T015 createDocument port

# Developer B — US3 photo edit
Task: T026 editOpenRouterImage
Task: T028 editImage port
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational  
3. Phase 3 US1 create Word/PDF  
4. **STOP and VALIDATE** with quickstart create scenarios  
5. Then US2 → US3 → US4 → polish  

### Incremental Delivery

1. Foundation ready  
2. Create documents (MVP demo)  
3. Edit documents  
4. Edit photos  
5. External-action guarantees + docs/PROGRESS  

---

## Notes

- Always **new** files on edit; set `derived_from_file_id` when migration is present.
- Mock OpenRouter in CI; owner may run one live photo-edit check separately.
- Do not implement workspace document versions in this feature.
- Commit only when the owner asks.
