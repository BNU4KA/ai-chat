---

description: "Task list for the Mobile and Web Polish Pass"
---

# Tasks: Mobile and Web Polish Pass

**Input**: Design documents from `specs/001-mobile-web-polish/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/edit-message.md, quickstart.md

**Tests**: `AGENTS.md` requires automated tests for code tasks, and quickstart.md lists the edit integration cases.
Tests are included only for server behavior (edit) and the one pure client helper. UI motion is verified
manually per quickstart.md.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 edit · US2 smooth chat · US3 generated image · US4 launch theme · US5 sidebar/layout · US6 build hygiene

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Native dependencies and config that several stories rely on.

- [X] T001 Add `react-native-reanimated@4.7.1`, `react-native-worklets@0.13.0`, `react-native-keyboard-controller@1.22.7`, `expo-haptics@~58.0.7`, and `expo-splash-screen@~58.0.13` to `apps/client/package.json` via `pnpm --filter @ai-chat/client exec expo install` and update `pnpm-lock.yaml`.
- [X] T002 Register `expo-splash-screen` (light `#ffffff` / dark `#212121` background) in `apps/client/app.json` plugins.
- [X] T003 Verify that `babel-preset-expo` auto-enables the worklets plugin by running `pnpm --filter @ai-chat/client build` (web export). If worklets fail, create `apps/client/babel.config.js` with `babel-preset-expo` and `react-native-worklets/plugin`.
- [X] T004 Wrap the root in `GestureHandlerRootView` and `KeyboardProvider` (keyboard provider native-only, pass-through on web) in `apps/client/app/_layout.tsx`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared building blocks used by US1 and US2.

**⚠️ CRITICAL**: US1 and US2 client work depends on T005–T008.

- [X] T005 Add a `haptic(kind)` helper (`expo-haptics` light impact on iOS, no-op on web/Android when unsupported) and switch `useReducedMotion` to Reanimated's `useReducedMotion` in `apps/client/src/motion.ts`.
- [X] T006 [P] Memoize parsed markdown per `text` (module-level LRU of ~200 entries or `useMemo` in the `Markdown` component) in `apps/client/src/markdown.tsx`.
- [X] T007 Extract the per-message render (user bubble, assistant body, attachments, status line, `MessageActions`, `PassageActions`, edit box) from `apps/client/src/chat.tsx` into a `React.memo` component `MessageRow` with `StyleSheet.create` styles and props typed by `interface` in `apps/client/src/message-row.tsx`. Move `StreamingMarkdown` with it and make it tick via `requestAnimationFrame` on all platforms.
- [X] T008 Replace the inline `visibleMessages.map` in `apps/client/src/chat.tsx` with `MessageRow`, passing stable `useCallback` handlers keyed by message id (`onEdit`, `onRetry`, `onCitation`, `onWorkWithResponse`, `onSaveDocument`, `onError`).

**Checkpoint**: The chat renders exactly as before, but a stream delta re-renders only the streaming row (verify with React DevTools "highlight updates" on web).

---

## Phase 3: User Story 1 - Edit a sent message and get a new answer in place (Priority: P1) 🎯 MVP

**Goal**: Edit any of your own messages; the same conversation hides later turns and regenerates the answer.

**Independent Test**: Edit the first message of a 3-turn conversation. The same chat shows the new text, no later turns, and a new answer streaming.

### Tests for User Story 1

- [X] T009 [P] [US1] Add integration tests for `POST /v1/messages/:id/edit` in `apps/api/src/workspace.integration.test.ts`:
  - 202 with a new run, later messages superseded, content updated;
  - 404 for another owner or an assistant message;
  - 409 while a run is active;
  - an idempotent replay creates one run;
  - superseded messages are absent from the message list, `/v1/search/messages`, and `/v1/messages/:id/context`;
  - `loadRunBundle` excludes superseded messages.
- [X] T010 [P] [US1] Add unit test `apps/client/src/visible-messages.test.ts` for `collapseAttempts()`: consecutive assistant messages keep only the last one, user messages are preserved, and an empty list is handled.

### Implementation for User Story 1

- [X] T011 [US1] Create migration `supabase/migrations/0008_message_supersede.sql`: `alter table messages add column superseded_at timestamptz` and partial index `messages_visible_seq_idx on messages (conversation_id, seq) where superseded_at is null`.
- [X] T012 [P] [US1] Add `editMessageSchema` (`{ text }` trimmed, 1..`LIMITS` max message chars) and export it in `packages/contracts/src/schemas.ts`.
- [X] T013 [US1] Extract `startAttempt(tx, ownerId, userRow, chatRow, modelMeta)` from `retryMessage` (run-key lookup, attempt and seq allocation, assistant insert, run insert, `run_id` link, outbox) and make `retryMessage` call it in `packages/database/src/repo.ts`.
- [X] T014 [US1] Implement `editMessage(ownerId, messageId, text, idempotencyKey, requestHash, modelMeta)` in `packages/database/src/repo.ts`, following [contracts/edit-message.md](./contracts/edit-message.md):
  - claim idempotency `'POST /messages/edit'`;
  - lock the profile, rate-limit, and lock the message `for update`;
  - require a non-superseded user message;
  - lock the conversation; return 409 on an active run or the user run limit;
  - set `superseded_at = now()` on messages with `seq > m.seq`;
  - update the content, then call `startAttempt`;
  - finish idempotency with 202.
- [X] T015 [US1] Filter `superseded_at is null` in the message list and tail query in `packages/database/src/repo.ts` (`listMessages`, around line 988, and the tail variant).
- [X] T016 [P] [US1] Filter `superseded_at is null` in the lease bundle messages query in `packages/database/src/lease.ts`.
- [X] T017 [P] [US1] Filter `superseded_at is null` in `searchMessages`, the branch copy in `branchConversation`, and the compaction queries in `packages/database/src/workspace.ts`. Also filter the message-context query in `apps/api/src/workspace.ts` (line ~150) and return 404 when the target is superseded.
- [X] T018 [US1] Register `POST /v1/messages/:id/edit` in `apps/api/src/server.ts`, mirroring the retry route: idempotency replay, owner lookup, `validateChatModel`, `editMessage`, and status passthrough.
- [X] T019 [P] [US1] Add `collapseAttempts(messages)` in `apps/client/src/visible-messages.ts` and apply it to `visibleMessages` in `apps/client/src/chat.tsx`.
- [X] T020 [US1] Replace the branch call in the edit box with `POST /v1/messages/:id/edit` (with a `Crypto.randomUUID()` idempotency key per edit session) in `apps/client/src/message-row.tsx`.
  - On success: close the editor, prepend the returned run to the `['runs', id]` cache, invalidate `['messages', id]`, and call `haptic('light')`.
  - On error: keep the editor open with the text and show the error.
  - Replace the copy "Original chat is preserved…" and the "Create branch" button label with "Save & regenerate".
- [X] T021 [US1] Enable Edit for every user message when no run is active (`busy || running` disables it) and change the action label to "Edit message" in `apps/client/src/message-actions.tsx`.

**Checkpoint**: Run T009/T010 green, then complete the manual US1 check in quickstart.md.

---

## Phase 4: User Story 2 - Smooth, native-feeling chat (Priority: P1)

**Goal**: Every chat interaction animates on the UI thread; content scrolls under the floating chrome; no jumps.

**Independent Test**: On iOS and desktop web, send, edit, copy, and scroll in a long chat. Nothing jumps, motion is smooth, and haptics fire on iOS.

- [X] T022 [US2] Wrap `MessageRow` in `Animated.View` with `entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)}` and `layout={LinearTransition}`, and wrap the thread in `LayoutAnimationConfig skipEntering` keyed by conversation id so the initial load does not animate, in `apps/client/src/message-row.tsx` and `apps/client/src/chat.tsx`.
- [X] T023 [US2] Animate the edit box open and close (`entering={FadeIn}`, `layout={LinearTransition}` on the bubble container), `autoFocus` with the selection at the end of the text, in `apps/client/src/message-row.tsx`.
- [X] T024 [P] [US2] Copy morph in `apps/client/src/message-actions.tsx`:
  - remove the `notice` state and its `<Text>`;
  - crossfade the icon `copy → check` via a Reanimated opacity and scale on the icon for 1.5 s;
  - hide the web tooltip after a press;
  - call `haptic('light')` on copy.
- [X] T025 [P] [US2] Rewrite `ThinkingSkeleton`, `ThinkingDot`, `FoolSpinner`, and `ChatThreadSkeleton` loops with Reanimated `withRepeat(withTiming(...))`, and add a container `entering={FadeIn.duration(180)}`, in `apps/client/src/fool-spinner.tsx`.
- [X] T026 [P] [US2] Rewrite the `PhotoSkeleton` pulse with Reanimated in `apps/client/src/attachment.tsx`.
- [X] T027 [US2] Floating chrome in `apps/client/src/chat.tsx`. Make the header (`testID="chat-header"`) and the chat-mode composer absolutely positioned, measure their heights with `onLayout`, and apply them as the ScrollView `contentContainerStyle` top and bottom padding. Header styling:
  - native: semi-transparent `c.background` with a hairline shown when `contentOffset.y > 0`;
  - web: `backdropFilter: 'blur(12px) saturate(180%)'`.
- [X] T028 [US2] Replace the `keyboardInset` `Animated.Value` and the Keyboard listeners in `apps/client/src/chat.tsx`:
  - wrap the floating composer in `KeyboardStickyView`;
  - drive the list bottom inset from `useReanimatedKeyboardAnimation`;
  - use `KeyboardGestureArea` (`interpolator="ios"`) around the ScrollView for interactive dismiss;
  - on web, render the plain views.
- [X] T029 [US2] Remove the hand-written web FLIP (`pendingFlipTop` and the `useLayoutEffect`) and replace it with a `layout={LinearTransition}` on the composer wrapper in `apps/client/src/chat.tsx`.
- [X] T030 [US2] Call `haptic('light')` in `send()` once the POST succeeds, in `apps/client/src/chat.tsx`.
- [X] T031 [P] [US2] In `apps/client/src/web-effects.web.tsx`:
  - delete the `[data-testid="chat-message"]` and `[data-testid="attachment-card"]` CSS enter animations and the skeleton or spinner CSS loops now driven by Reanimated;
  - add a composer gradient fade (`[data-testid="composer-fade"]`, `linear-gradient` to the background);
  - make hidden user-message actions overlay instead of reserving height.
- [X] T032 [US2] Tighten thread rhythm: gap 16 between turns and overlay hover actions on web in `apps/client/src/chat.tsx` and `apps/client/src/message-row.tsx`.

**Checkpoint**: The quickstart US2 manual rows pass on iOS and web; Reduce Motion gives instant transitions.

---

## Phase 5: User Story 3 - Generated image shows up immediately (Priority: P1)

**Goal**: A generated image appears in the answer without re-entering the chat.

**Independent Test**: Ask for an image; it renders in place when the answer finishes.

- [X] T033 [US3] In `apps/client/src/use-run.ts`, on `tool.completed` and on `run.completed | run.failed | run.cancelled`, also `invalidateQueries({ queryKey: ['run', runId] })` so `assistant_message.file_ids` refresh.

**Checkpoint**: The image appears within 2 s of completion (SC-002).

---

## Phase 6: User Story 4 - Launch without a theme flash (Priority: P2)

**Goal**: No wrong-theme frame at launch.

**Independent Test**: Theme ≠ system. Ten cold launches show no flash.

- [X] T034 [US4] Launch gate in `apps/client/app/_layout.tsx`:
  - call `SplashScreen.preventAutoHideAsync()` at module scope;
  - in `Navigation`, read `useProfile()` when a session exists;
  - when `profile.data` arrives, call `setChoice(profile.data.theme)`;
  - call `SplashScreen.hideAsync()` once `themeReady && ready && (!session || profile settled)`, or after a 3 s timeout (cleared on unmount);
  - render the `Loading` overlay only after `themeReady`.
- [X] T035 [US4] Remove the `profile.data → setChoice` effect from `apps/client/src/chat.tsx`.

**Checkpoint**: The quickstart US4 row passes on device.

---

## Phase 7: User Story 5 - Sidebar and layout fixes (Priority: P2)

**Goal**: The drawer covers the header, the top spacing is correct, the drag tracks the finger, and the web dialog and spacing are clean.

**Independent Test**: Open and drag the drawer on iPhone; open Settings on desktop web.

- [X] T036 [US5] Remove `topInset={52}` from `<ConversationDrawer>` in `apps/client/src/chat.tsx`.
- [X] T037 [US5] In `apps/client/src/sidebar.tsx`, set the mobile `paddingTop` to `8` instead of `Math.max(inset.top, 8)` (the root `SafeAreaView` already applies the inset).
- [X] T038 [US5] Rewrite `ConversationDrawer` in `apps/client/src/sidebar.tsx`:
  - replace `PanResponder` and `Animated` with Gesture Handler `Gesture.Pan()` (edge-open and close variants) driving a Reanimated `useSharedValue` translateX;
  - backdrop opacity via `useAnimatedStyle`;
  - `withSpring` snap in the swipe direction (velocity threshold);
  - `runOnJS(onOpenChange)`;
  - `haptic('light')` on snap open.
- [X] T039 [P] [US5] Make the settings dialog body content-sized (`maxHeight` instead of a fixed height) in `apps/client/src/settings-modal.tsx`.

**Checkpoint**: The quickstart US5 rows pass on iOS and web.

---

## Phase 8: User Story 6 - Clean native build (Priority: P3)

**Goal**: Third-party pod warnings are suppressed and app warnings stay visible, persistently across prebuild.

**Independent Test**: A clean prebuild and build shows at least 90% fewer than 242 warnings.

- [X] T040 [P] [US6] Create the config plugin `apps/client/plugins/with-quiet-pods.js` using `withPodfile` from `expo/config-plugins`. In `post_install`, for every `installer.pods_project.targets` build configuration, set `GCC_WARN_INHIBIT_ALL_WARNINGS=YES`, `SWIFT_SUPPRESS_WARNINGS=YES`, and `CLANG_WARN_DOCUMENTATION_COMMENTS=NO`. The insertion must be idempotent.
- [X] T041 [US6] Register `./plugins/with-quiet-pods` in `apps/client/app.json` plugins.

**Checkpoint**: Measure the warning count per quickstart.md.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T042 [P] Document `POST /messages/:id/edit` and the superseded filtering in `docs/API_CONTRACT.md`. Add an owner-decision note to `docs/EXPANSION_SPEC.md` and `docs/UX_SPEC.md` stating that edit regenerates in place and replaces branch-on-edit.
- [X] T043 Update existing e2e expectations that reference "Create branch", the copy notice, or per-message CSS animations in `e2e/*.spec.ts`.
- [X] T044 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, and `git diff --check`; fix any failures.
- [X] T045 Run the iOS prebuild and build and record the warning count per `specs/001-mobile-web-polish/quickstart.md`.
- [X] T046 Record the exact commands, results, environment, the remaining owner device checks, and the next task (Word/PDF feature) in `docs/PROGRESS.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001–T004)**: Start immediately. T002–T004 depend on T001.
- **Foundational (T005–T008)**: Depends on Setup. T008 depends on T007.
- **US1**: The server part (T009, T011–T018) depends only on Setup, so it can start in parallel with Foundational. The client part (T019–T021) depends on T007/T008.
- **US2**: Depends on Foundational and touches `message-row.tsx` and `chat.tsx`, so run it after the US1 client tasks to avoid conflicts.
- **US3 (T033)**: Independent; it can run any time.
- **US4 (T034–T035)**: Depends on T004 (same file `_layout.tsx`).
- **US5 (T036–T039)**: T038 depends on T004 (GestureHandlerRootView) and T005 (haptic).
- **US6 (T040–T041)**: Independent of the client JS; T041 conflicts with T002 on `app.json`, so do it after T002.
- **Polish**: After all stories.

### User Story Dependencies

- US1 ← Foundational (client part only)
- US2 ← Foundational, after the US1 client tasks (shared files)
- US3, US6 — none
- US4 ← T004
- US5 ← T004, T005

### Parallel Opportunities

- T006 runs alongside T005/T007.
- Server US1 tasks T011, T012, T016, T017 run in parallel (different files). T013 → T014 → T015 run sequentially in `repo.ts`.
- T009 and T010 tests can be written in parallel.
- T024, T025, T026, T031, and T039 are separate files and can run in parallel.
- US3 (T033) and US6 (T040) can run at any time.

---

## Parallel Example: User Story 1

```bash
Task: "Create migration supabase/migrations/0008_message_supersede.sql"
Task: "Add editMessageSchema in packages/contracts/src/schemas.ts"
Task: "Filter superseded messages in packages/database/src/lease.ts"
Task: "Filter superseded messages in packages/database/src/workspace.ts and apps/api/src/workspace.ts"
Task: "Write edit integration tests in apps/api/src/workspace.integration.test.ts"
```

## Parallel Example: User Story 2

```bash
Task: "Copy morph in apps/client/src/message-actions.tsx"
Task: "Reanimated skeletons in apps/client/src/fool-spinner.tsx"
Task: "Reanimated photo skeleton in apps/client/src/attachment.tsx"
Task: "Web CSS cleanup in apps/client/src/web-effects.web.tsx"
```

---

## Implementation Strategy

### MVP First

1. Setup (T001–T004) and Foundational (T005–T008).
2. US1 (edit in place) plus US3 (one-line image fix): the two behavior changes the owner explicitly asked for.
3. **STOP and VALIDATE**: integration tests green; the owner checks edit and image on device.

### Incremental Delivery

1. Add US2 (motion and floating chrome), then validate on iOS and web.
2. Add US4 and US5 (launch, sidebar), then validate on device.
3. Add US6 (warnings), then measure.
4. Polish: docs, e2e updates, the full check suite, and PROGRESS.

---

## Notes

- Do not commit or push unless the owner asks. Preserve the owner's existing staged changes in `apps/client`.
- No inline comments in new code (owner rule). Use `console.log({ ... })` objects if logging is ever needed.
- A native rebuild is required after T001/T002/T041; web keeps working without it.
- Production deploy is out of scope for these tasks; it needs explicit owner authorization.
