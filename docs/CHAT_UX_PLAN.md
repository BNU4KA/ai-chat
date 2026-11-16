# Chat UX plan — pins, activity, suggestions, branching, drafts

Status: planned, not implemented. Tickets are sequenced in the order below. Each ticket lists
web behavior and mobile (iOS/Android, Expo native) behavior, because the shared React Native
UI renders on all three platforms and mobile is the primary use case for most of these features.

Evidence rules from AGENTS.md apply: a ticket is complete only with automated checks and, where
it changes behavior on a device, recorded browser/native evidence. Native checks remain blocked
by the iOS toolchain issue recorded in PROGRESS.md until a compatible toolchain is available.

## Order

1. CHAT-201 Composer focus during streaming (P0, bug)
2. CHAT-202 Message branching and edit UX (ADR first)
3. CHAT-203 Sidebar state: pinned chats and activity indicators
4. CHAT-204 Suggested replies
5. CHAT-205 Automatic chat titles
6. CHAT-206 Reasoning effort dropdown
7. CHAT-207 Draft panel before creating a file

CHAT-203 does not depend on CHAT-202 and may run in parallel once CHAT-201 is done.

## CHAT-201 — Composer focus during streaming

Root-cause candidates from reading `apps/client/src/chat.tsx` (not yet reproduced):

- The dock composer is rendered as `{!composerExpanded && composer}` (around line 1434). Any
  change of `composerExpanded` (for example `shape.tall` toggling) moves the composer into a
  different element tree and remounts the text input.
- `ComposerInput` is keyed by `inputEpoch`, which is incremented on every send (`resetComposer`).
  This is expected on send, but verify it is not triggered by run completion.
- `LayoutAnimationConfig` is keyed by `${id}:${loadingThread}:${optimisticUser === null}`
  (around line 1304). Changing the key remounts the whole message list. The edit field's
  `autoFocus` in `message-row.tsx` is one result of that remount and is related to the edit
  focus bug (CHAT-202).

Work:
- Reproduce in the desktop browser with the synthetic e2e provider fixture: send a message,
  type while the answer streams, record whether focus is lost and which component remounts.
- Fix the identified remount so the input node and focus survive streaming and status updates.
- Add a Playwright regression: focus stays in the composer for the whole streamed answer.

Mobile: on iOS and Android the keyboard dismisses when the input unmounts. The same remount
check must be done in a native build, not only in the web browser.

## CHAT-202 — Message branching and edit UX

Requires ADR (`docs/ADR-00X-message-branching.md`) covering: schema (`parent_message_id` on
`messages` vs. a branch table), the active leaf per conversation, migration of existing linear
chats, how model context is built from the leaf to the root, and how runs and attachments bind
to a branch. The existing edit-branch model from T15 (`message-edit branches`, see PROGRESS
"Implemented T15") must be reviewed first; this ticket may extend it rather than replace it.

Behavior:
- Edit on a user message creates a sibling branch. Later messages are not deleted.
- Regenerate creates a sibling assistant message.
- Branch switcher `‹ 2/3 ›` appears only when a message has siblings.
- The confirmation modal before editing is removed; an undo toast (about 5 seconds) replaces it.
- Edit field: no height cap up to the viewport; scrolls internally; keeps focus while typing;
  the field is not remounted by streaming or list updates.

Mobile:
- The branch switcher is a compact control under the message (44 pt touch target), not hover-only.
- Editing a long message opens a full-width sheet with the keyboard lifting the field; the
  Save/Cancel row stays above the keyboard.
- Undo toast appears above the composer dock and does not overlap the keyboard.

Risk: high. Touches data, runtime history, and streaming. Migration must keep existing chats
rendering identically (snapshot test).

## CHAT-203 — Sidebar state: pinned chats and activity indicators

Schema: `conversations.pinned_at timestamptz null`, `conversations.last_seen_at timestamptz null`.

Behavior:
- Pin/unpin endpoints; pinning does not change `updated_at`.
- Sort: pinned group first (by `pinned_at`), then `updated_at`.
- Running: spinner while the conversation has an active run.
- Unread: dot when a run completed after `last_seen_at`. Opening a chat sets `last_seen_at`.
  Server-side, so it syncs across devices.

Mobile:
- Pin via long-press on a chat row, and via a swipe action in the drawer, plus the menu.
- Indicators must be visible in the narrow drawer and in the search list without hover.
- The unread dot has an accessible label (for screen readers) and a color that is not the
  only signal (spinner vs. dot shape differs).
- Background/foreground: when the app returns to foreground, refresh indicator state.

## CHAT-204 — Suggested replies

Behavior: after an answer, 2–4 short suggestions appear as chips above the composer. Tapping a
chip sends it. Chips are shown only for the latest assistant message and hide when the user
types.

Server: optional `suggestions: string[]` in the assistant output, validated (max 4 items,
max 60 characters each, invalid values dropped without failing the answer).

Mobile:
- Chips scroll horizontally in one row; no wrapping that pushes the composer off screen.
- Chips are at least 44 pt high.
- Keyboard open: chips hide when the field is focused, to avoid covering the field.

## CHAT-205 — Automatic chat titles

Replace the current first-message truncation (`packages/database/src/repo.ts`, the
`nextSeq === '1'` branch) with a title generated after the first answer, using a small model.

Rules:
- Only when `title_source = 'auto'`; a manual rename is never overwritten.
- Max 60 characters. On failure, keep the truncated first-message title.
- Decision (owner, 2026-11-16): low-cost title model allowed; `AGENT_TASK.md` updated accordingly.
  This conflicts with the requested feature and must be resolved in the docs first (ADR or an
  explicit owner decision) before implementation. Options: use a zero-cost route, or keep
  truncation and only improve it (for example, strip greetings and take the first sentence).

Mobile: titles are shown in the drawer with one-line ellipsis; the update appears without a
manual refresh.

## CHAT-206 — Reasoning effort dropdown

Dropdown (low / medium / high) to the left of Tools, shown only for models whose catalog entry
declares reasoning support. Value passed to the provider as the documented reasoning parameter
(verify against OpenRouter docs at implementation time). Persist per conversation.

Mobile: the dropdown opens as a bottom sheet with three large options, not a small popover.

## CHAT-207 — Draft panel before creating a file

Behavior: when the user asks for a document, the model writes a draft into a side panel using a
`draft_document` tool. The draft is editable (title and blocks) and autosaved. The file is
created only by the "Create file" action, which uses the existing `file-actions` flow.
Later edits to a created file use the existing `revise` path.

Storage: `document_drafts` (id, conversation_id, owner_id, title, blocks jsonb, version,
status `draft | created`). Owner-scoped RLS, same as documents.

Web: right-side panel on wide screens; the chat stays visible.

Mobile: full-screen sheet with its own header (Back, Title, Create file). It must not stack
under the keyboard. Switching between chat and draft preserves scroll position and unsaved text.

Dependencies: uses the existing document/version schema from T16; it does not depend on
branching.

## Cross-cutting requirements

- Accessibility: every new control has an accessibility label and role; the focus order is
  preserved; reduced-motion settings disable spinner/animation where the app already does.
- Localization: new strings go through `apps/client/src/translations.ts` (English and Russian).
- Tests: contract tests for new DTOs; integration tests for schema/migrations (isolated Postgres);
  Playwright desktop and mobile-web scenarios; native smoke once the toolchain is available.
- Documentation: update `API_CONTRACT.md`, `DATA_MODEL.md`, `UX_SPEC.md`, and PROGRESS after each
  ticket, with exact commands and results.
