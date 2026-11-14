# Feature Specification: Chat Documents and Photo Edit

**Feature Branch**: `002-chat-docs-photo-edit`

**Created**: 2026-11-15

**Status**: Draft

**Input**: Owner deferred Word/PDF create/edit from the mobile-web polish pass, and additionally
requires that the agent can modify a photo the user sent. Goal: in chat, create and edit Word/PDF
files the user can download, and produce an edited version of an attached photo on request.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a Word or PDF in chat (Priority: P1)

A user asks the assistant to write a document (for example a short contract, report, or checklist).
The assistant produces a Word or PDF file, shows it as an attachment in the answer, and the user can
open or download it without leaving the conversation.

**Why this priority**: This is the deferred product gap from the polish pass. Users currently get
text in the chat only and cannot take away a real document file.

**Independent Test**: Ask for a short Word document and a short PDF in two separate chats. Each
answer includes a downloadable file of the requested type whose content matches the request.

**Acceptance Scenarios**:

1. **Given** a conversation with a capable model and tools available, **When** the user asks for a
   new Word document with specific content, **Then** the answer includes a Word attachment the user
   can download, and opening it shows that content.
2. **Given** the same setup, **When** the user asks for a PDF instead, **Then** the answer includes a
   PDF attachment they can download with the requested content.
3. **Given** document creation fails (provider or processing error), **When** the run finishes,
   **Then** the user sees a clear failure message and no fake successful file card.
4. **Given** a created document appears in the answer, **When** the user reopens the conversation
   later, **Then** the same attachment remains available under the same ownership and deletion rules
   as other chat files.

---

### User Story 2 - Edit a Word or PDF from the conversation (Priority: P1)

A user has a Word or PDF in the conversation (uploaded by them or created earlier by the assistant)
and asks to change it (for example “replace the price with 1200” or “add a summary section”). The
assistant produces an updated file as a new attachment. The previous file stays available.

**Why this priority**: Create-only is incomplete for the owner’s “edit Word/PDF” request. Users need
iteration without leaving chat.

**Independent Test**: Attach or create a short Word document, then ask to change a named detail.
A new downloadable Word file appears with that change; the earlier file is still listed.

**Acceptance Scenarios**:

1. **Given** a Word file in the conversation, **When** the user asks to change specific text or
   structure, **Then** a new Word attachment appears reflecting the change, and the original file
   remains unchanged.
2. **Given** a PDF in the conversation, **When** the user asks for an edit, **Then** a new PDF
   attachment appears with the change, and the original PDF remains unchanged.
3. **Given** an edit request on a structured document, **When** the assistant produces the result,
   **Then** it is always a **new** file, and the product attempts to preserve the source structure
   (sections, headings, lists, tables, and layout where recoverable). If fidelity cannot be kept
   safely, the assistant explains the limit and does not present a corrupted or empty file as success.
4. **Given** an answer is still generating, **When** the user sends another edit request, **Then**
   normal conversation rules apply (queue or refuse with a clear message); no silent overwrite of an
   in-progress file.

---

### User Story 3 - Edit a photo the user sent (Priority: P1)

A user attaches a photo and asks the assistant to change it (for example remove the background,
brighten it, or crop to the subject). The assistant returns a new image attachment with the edit.
The original photo stays in the conversation.

**Why this priority**: Explicitly added by the owner for this feature. Today photos are model input
and the assistant can generate new images, but it does not modify a user-sent photo into a new file.

**Independent Test**: Attach a JPEG or PNG, ask for a concrete visual change, and confirm a new
image attachment appears that reflects the request while the original remains.

**Acceptance Scenarios**:

1. **Given** a JPEG or PNG attached in the conversation, **When** the user asks to modify that
   photo, **Then** a new image attachment appears with the edit applied, and the original photo
   remains available.
2. **Given** the selected model or provider cannot edit images, **When** the user asks for a photo
   edit, **Then** the user gets a clear incompatibility or failure message instead of a silent no-op.
3. **Given** a successful photo edit, **When** the answer finishes, **Then** the new image is visible
   in the answer without leaving and re-entering the chat (same expectation as generated images).
4. **Given** an animated GIF or other limited format, **When** editing is requested, **Then** the
   product either edits the first frame into a still image and states that, or refuses with a clear
   reason — never claims a full animation edit it did not perform.

---

### User Story 4 - Review before trusting external file actions (Priority: P2)

When creating or editing files involves a tool step that spends balance or writes a file, the user
can see that a file action happened (tool activity / attachment card) and can open the result. No
automatic send of the file to email or third parties happens as part of this feature.

**Why this priority**: Keeps file creation aligned with existing “review external actions” product
rules without blocking the core create/edit loops.

**Independent Test**: Create a document and edit a photo; confirm only in-chat attachments are
produced and nothing is emailed or shared externally by default.

**Acceptance Scenarios**:

1. **Given** a successful create or edit, **When** the user inspects the answer, **Then** they see
   the resulting attachment and can download it themselves.
2. **Given** this feature alone, **When** a file is created or edited, **Then** the product does not
   email it, upload it to a third-party drive, or share it outside the user’s account.

---

### Edge Cases

- User asks for Word but the content is empty or only whitespace → refuse with a clear message; no
  empty successful file.
- User asks to edit a file that is still processing or failed to process → refuse until the source is
  ready, with a clear status.
- User asks to edit a file they do not own / not in this conversation → not found / not allowed.
- Very large documents or photos beyond existing product limits → same size/type limits as current
  uploads; clear error when over limit.
- Model returns text that claims a file was created but no file was stored → show failure; never show
  a download link to a missing file.
- Concurrent edit requests on the same source → each successful run yields its own new file; no
  silent clobber of another run’s result.
- Reduced-motion / slow network → file cards still appear when ready; no permanent spinner without
  error after the run ends.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to ask the assistant to create a new Word document in a
  conversation and receive a downloadable Word attachment in the answer.
- **FR-002**: Users MUST be able to ask the assistant to create a new PDF in a conversation and
  receive a downloadable PDF attachment in the answer.
- **FR-003**: Users MUST be able to ask the assistant to edit a Word or PDF that already belongs to
  the conversation (uploaded or previously created) and receive a **new** downloadable file; the
  source file MUST remain unchanged.
- **FR-004**: Users MUST be able to ask the assistant to modify a photo they attached (at least
  JPEG and PNG) and receive a **new** image attachment; the original photo MUST remain unchanged.
- **FR-005**: Created and edited files MUST follow the same ownership, privacy, and conversation
  deletion rules as other chat attachments.
- **FR-006**: When create/edit fails or the model/provider cannot perform the action, the product
  MUST show a clear user-visible error and MUST NOT present a successful file card.
- **FR-007**: Successful photo edits MUST appear in the open conversation when the run completes,
  without requiring the user to leave and re-enter the chat.
- **FR-008**: The product MUST label or refuse limited formats honestly (for example GIF first-frame
  only) rather than claiming unsupported fidelity.
- **FR-009**: This feature MUST NOT by itself send created or edited files to email, calendars, or
  external drives.
- **FR-010**: Every document create or edit MUST yield a **new** conversation file. For edit
  requests, the product MUST attempt to preserve the source document’s structure (sections,
  headings, lists, tables, and recoverable layout). Perfect pixel/layout identity is not required,
  but silent loss of major structure without explanation is not allowed.
- **FR-011**: Photo modification MUST be a generative / model-based edit of the user’s image that
  produces a **new** image attachment (not only local crop/rotate/filter tools).
- **FR-012**: For this feature, created and edited files MUST live as chat attachments only.
  Saving into Projects & tasks / workspace document versions is out of scope and may be added later.

### Key Entities

- **Conversation file**: An owned attachment in a chat (Word, PDF, photo, or other existing types)
  with processing status, download availability, and deletion tied to the conversation/account rules.
- **Derived file**: A new conversation file produced by create or edit, linked in product language to
  its source when it was an edit (user can tell which file is the update).
- **File action**: A single assistant tool step that creates or edits a file during a run, with
  success or failure visible to the user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a scripted happy-path test, a user can obtain a downloadable Word file from a chat
  request in one send, without leaving the conversation.
- **SC-002**: In a scripted happy-path test, a user can obtain a downloadable PDF the same way.
- **SC-003**: In a scripted edit test, changing one named detail in a short Word or PDF yields a new
  file containing that detail, while the previous file still downloads with the old detail.
- **SC-004**: In a scripted photo-edit test, an attached JPEG or PNG plus a clear edit request yields
  a new visible image in the same conversation within the normal run completion wait (same class of
  wait as today’s image generation).
- **SC-005**: Failure paths (unsupported model, processing error, oversize source) show an error in
  100% of scripted negative tests and never a downloadable empty/corrupt “success” file.
- **SC-006**: After conversation deletion (or account rules that remove chat files), derived files
  from this feature are removed under the same rules as other attachments — verified by a scripted
  ownership/deletion check.

## Assumptions

- First version targets the existing signed-in chat product (iOS, Android where applicable, and web),
  not a separate document editor app.
- Create/edit are assistant-mediated (user asks in natural language); no full desktop Word UI inside
  the chat is required.
- Owner decision (2026-11-15): document create/edit always builds a **new** file. On “edit”, the
  product tries to fully preserve structure from the source, then writes the result as a new
  attachment; the source is never overwritten.
- Owner decision (2026-11-15): photo modify is generative edit of the sent image into a new image
  attachment (option A); the original photo is kept.
- Owner decision (2026-11-15): workspace / Projects & tasks document versions are deferred. This
  feature ships chat attachments only; workspace save can be added in a later feature.
- Legacy `.doc` (non-DOCX) editing is out of scope for v1; reading/extraction may continue as today.
- HEIC remains unsupported for edit input unless the platform already converts it; existing photo
  type rules apply.
- No billing, multi-agent orchestration, plugins, or code-execution sandbox is introduced for this
  feature.
- Production remains fail-closed: missing provider credentials or tools do not silently fake a file.
