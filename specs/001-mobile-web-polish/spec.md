# Feature Specification: Mobile and Web Polish Pass

**Feature Branch**: `001-mobile-web-polish`

**Created**: 2026-11-14

**Status**: Draft

**Input**: Owner feedback from iOS testing (12 items) plus a production web audit. Goal: a smooth,
native-feeling chat on iOS and web, with fixes for launch theme flash, drawer layout, missing generated
images, chat background clipping, abrupt animations, copy feedback, and Gemini-style message editing.
Word/PDF file creation is excluded and tracked as a separate feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit a sent message and get a new answer in place (Priority: P1)

A user notices a mistake in a message they sent earlier. They tap Edit, change the text, and submit. The
conversation stays the same. The edited message replaces the original, every later turn disappears from
view, and a fresh answer to the edited message is generated below it.

**Why this priority**: This is a behavior change the owner explicitly asked for. It replaces the current
branch-into-a-new-chat flow, which breaks the user's place in the conversation.

**Independent Test**: In a conversation with at least three turns, edit the first user message and submit.
The same conversation shows the edited text, no later turns, and a new answer streaming in.

**Acceptance Scenarios**:

1. **Given** a conversation with several turns and no answer in progress, **When** the user edits any of
   their own messages and submits, **Then** the conversation stays open, the message shows the new text,
   every later message is hidden, and a new answer starts.
2. **Given** an answer is still being generated, **When** the user tries to submit an edit, **Then** the
   edit is refused with a clear message and nothing changes.
3. **Given** an edit was submitted, **When** the user reopens the conversation on another device, **Then**
   they see the same edited state, and the hidden turns stay hidden.
4. **Given** later turns were hidden by an edit, **When** the assistant answers the edited message, **Then**
   it does not use the hidden turns as context.
5. **Given** the user retried the last answer earlier, **When** they view the conversation, **Then** only
   the most recent answer to that message is shown.
6. **Given** the edit box is open, **When** the user cancels, **Then** the original message returns
   unchanged.

---

### User Story 2 - Smooth, native-feeling chat (Priority: P1)

A user chats on an iPhone or in a desktop browser. Sending a message, the answer appearing, the loading
placeholder, opening the edit box, copying a reply, opening the sidebar, and showing or hiding the keyboard
all move smoothly, with no jumps, flashes, or hard cuts. Messages scroll freely under a floating header and
input bar instead of being clipped by solid strips.

**Why this priority**: The owner's main goal is a native-feeling experience. This story covers most of the
feedback items (5, 6, 9, 10, 11) and the web audit findings.

**Independent Test**: On iOS and on desktop web, send a message in a long conversation, open and cancel an
edit, copy a reply, and scroll. Every change animates or stays in place; no visible content jumps.

**Acceptance Scenarios**:

1. **Given** an open conversation, **When** the user sends a message, **Then** the new message and the
   answer placeholder appear with a smooth entrance and existing content does not jump.
2. **Given** a long conversation, **When** the user scrolls, **Then** messages pass under the header and the
   input bar with no solid background strip clipping them.
3. **Given** a reply, **When** the user taps Copy, **Then** the Copy button itself briefly turns into a
   confirmation mark, no text appears below the message, and nothing below it moves.
4. **Given** a user message, **When** the user taps Edit, **Then** the edit box expands smoothly from the
   message, and the text cursor is placed at the end.
5. **Given** a conversation is opened, **When** its messages load, **Then** they appear together without
   every message animating in one by one.
6. **Given** an answer is streaming, **When** new text arrives, **Then** scrolling and typing stay smooth
   and earlier messages do not visibly redraw.
7. **Given** the keyboard opens or closes on iOS, **When** it moves, **Then** the input bar follows it in
   sync, and dragging the conversation down dismisses the keyboard interactively.
8. **Given** the device has Reduce Motion enabled, **When** any of the above happens, **Then** animations
   are replaced by instant or minimal transitions.
9. **Given** the user sends a message, copies a reply, opens the sidebar, or submits an edit on iOS,
   **Then** a light haptic confirms the action.

---

### User Story 3 - Generated image shows up immediately (Priority: P1)

A user asks the assistant to generate a picture. When the answer finishes, the picture is shown inside the
answer right away, without leaving and reopening the conversation.

**Why this priority**: The feature currently looks broken: the description appears but the image does not.

**Independent Test**: Ask for an image in an open conversation and wait for the answer to finish. The image
appears in the answer without navigation.

**Acceptance Scenarios**:

1. **Given** an image request, **When** the image tool finishes, **Then** a loading placeholder appears in
   the answer and is replaced by the image as soon as it is available.
2. **Given** the answer has finished, **When** the user stays in the conversation, **Then** the image
   remains visible and can be opened.

---

### User Story 4 - Launch without a theme flash (Priority: P2)

A user who chose dark (or light) theme opens the app. The first thing they see is either the launch screen
or the app already in their chosen theme. They never see the other theme flash first.

**Why this priority**: The flash is visible on every launch, but it is cosmetic.

**Independent Test**: Set a theme that differs from the system theme, force-quit the app, and relaunch
several times. No frame shows the wrong theme.

**Acceptance Scenarios**:

1. **Given** a signed-in user whose saved theme differs from the system theme, **When** they launch the
   app, **Then** the launch screen stays until the saved theme is known, and the app appears in that theme.
2. **Given** the profile service is slow or unreachable, **When** the app launches, **Then** the launch
   screen is released within 3 seconds using the last known theme.
3. **Given** a signed-out user, **When** they launch the app, **Then** the sign-in screen appears without
   waiting for profile data.

---

### User Story 5 - Sidebar and layout fixes (Priority: P2)

On a phone, opening the conversation sidebar covers the whole screen, including the header. The top of the
sidebar has no unexplained empty space above the brand name. On desktop web, turns are spaced evenly, and
the settings dialog has no large empty area.

**Why this priority**: These are visible layout defects with small, contained fixes.

**Independent Test**: Open the sidebar on an iPhone and check that it overlays the header and that the brand
row sits right under the status bar. Open settings on desktop web.

**Acceptance Scenarios**:

1. **Given** a phone-sized screen, **When** the user opens the sidebar, **Then** it overlays the header and
   the dimmed backdrop covers the rest of the screen.
2. **Given** the sidebar is open on a phone, **When** the user looks at its top, **Then** the brand row
   starts directly below the status bar, with standard spacing.
3. **Given** the user drags the sidebar open or closed, **When** they release, **Then** it settles to open
   or closed in the direction of the swipe and tracks the finger without lag while dragging.
4. **Given** desktop web, **When** the user opens Settings, **Then** the dialog height fits its content.
5. **Given** desktop web, **When** the user reads a conversation, **Then** the spacing between turns is
   consistent and hidden hover actions take no space.

---

### User Story 6 - Clean native build (Priority: P3)

A developer builds the iOS app. The build log no longer shows hundreds of warnings from third-party
libraries, so warnings from the app's own code are noticeable.

**Why this priority**: Developer-facing only. It has no effect on users.

**Independent Test**: Run a clean iOS build and count the warnings before and after.

**Acceptance Scenarios**:

1. **Given** a clean iOS build, **When** it completes, **Then** third-party library warnings are
   suppressed, and warnings from the app target remain visible.
2. **Given** the native project is regenerated from configuration, **When** it is rebuilt, **Then** the
   suppression still applies.

---

### Edge Cases

- **The edited message has attachments.** Its attachments stay attached; files on later, hidden messages
  remain in conversation files but are not used as context.
- **Two quick edits.** The second submission must not create a duplicate answer.
- **Edit while offline or on a server error.** The original state is kept, the edit box stays open with the
  text, and an error is shown.
- **The edited message is the first message in the conversation.** The conversation keeps its title.
- **Deep link to a hidden message (search result or notice).** It shows a "message no longer in
  conversation" state instead of a broken scroll.
- **Image generation fails.** The answer shows the error state and no endless placeholder.
- **Very long conversation.** Opening a conversation of 200+ messages stays responsive; scrolling holds a
  steady frame rate.
- **Light/dark switch while the app is open.** No flash; colors update in place.
- **Phone rotation or split-view on iPad.** The floating input bar and the drawer still lay out correctly.

## Requirements *(mandatory)*

### Functional Requirements

**Editing**

- **FR-001**: Users MUST be able to edit any of their own messages in a conversation when no answer is in
  progress.
- **FR-002**: Submitting an edit MUST keep the user in the same conversation, replace the message text,
  hide all later messages, and start a new answer to the edited message.
- **FR-003**: Hidden messages MUST NOT be shown in the conversation, MUST NOT be used as assistant context,
  and MUST NOT appear in message search. They MUST be kept in storage so usage and spending history stay
  intact.
- **FR-004**: An edit submitted while an answer is in progress MUST be rejected with a clear message.
- **FR-005**: Repeated submission of the same edit MUST NOT start more than one answer.
- **FR-006**: The conversation MUST show only the most recent answer to a given user message (retries and
  edits replace, not stack).
- **FR-007**: The edit control MUST no longer create a new conversation branch.

**Smoothness and feedback**

- **FR-008**: New messages, the answer placeholder, the edit box, and the copy confirmation MUST appear
  through smooth transitions without moving unrelated content.
- **FR-009**: Opening a conversation MUST NOT animate every existing message individually.
- **FR-010**: Messages MUST scroll beneath a floating header and input bar; no opaque strip may clip
  content.
- **FR-011**: While an answer streams, only the streaming message may update visually; other messages MUST
  stay static.
- **FR-012**: On iOS, the input bar MUST follow the keyboard in sync, and the keyboard MUST be dismissible
  by dragging the conversation.
- **FR-013**: The sidebar drawer MUST track the finger during a drag and settle in the swipe direction.
- **FR-014**: On iOS, sending a message, copying, opening the drawer, and submitting an edit MUST give a
  light haptic.
- **FR-015**: All motion MUST respect the system Reduce Motion setting.
- **FR-016**: Copy MUST confirm in place of the Copy button for about 1.5 seconds and MUST NOT add text
  under the message.

**Correctness and layout**

- **FR-017**: A generated image MUST appear in the answer as soon as it is stored, without navigation.
- **FR-018**: The app MUST NOT display a theme other than the user's saved theme during launch; the launch
  screen MUST be released within 3 seconds at most.
- **FR-019**: On phones, the open drawer MUST overlay the header.
- **FR-020**: The drawer's top spacing MUST equal the status-bar inset plus standard padding, applied once.
- **FR-021**: On desktop web, the settings dialog MUST size to its content, and spacing between turns MUST
  be consistent.

**Build hygiene**

- **FR-022**: iOS builds MUST suppress third-party library warnings while keeping app-target warnings, and
  this MUST survive regeneration of the native project.

### Key Entities

- **Message**: A user or assistant turn in a conversation. Gains a "hidden by edit" state that removes it
  from display, context, and search while keeping it stored.
- **Answer attempt**: One generation for a user message. Retries and edits create a new attempt; only the
  latest attempt is shown.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 10 consecutive cold launches with a non-system theme, 0 frames show the wrong theme.
- **SC-002**: A generated image becomes visible within 2 seconds of the answer finishing in 10 of 10 trials,
  with no navigation.
- **SC-003**: Editing a message produces a new answer in the same conversation in 100% of trials, and no new
  conversation is created.
- **SC-004**: During streaming in a 100-message conversation, scrolling holds at least 55 fps on an iPhone
  from the last three generations and on a mid-range laptop browser.
- **SC-005**: Copy, edit open and close, send, and keyboard show and hide produce no visible content jump
  (0 px layout shift of content outside the changed element).
- **SC-006**: A clean iOS build reports at least 90% fewer warnings than the 242-warning baseline.
- **SC-007**: The owner rates the iOS and web experience as "native-feeling" in a hands-on review covering
  all 12 feedback items and the web audit list.

## Assumptions

- The existing account, theme setting, and profile data stay the source of truth for the user's theme. The
  last known theme is cached on the device.
- Editing is limited to the user's own messages. Assistant messages are not editable.
- Hidden messages are not recoverable from the UI in this feature. A version switcher, as in Gemini, is out
  of scope.
- Word/PDF file creation and editing are out of scope and tracked separately.
- Haptics apply on iOS only; web has no haptic feedback.
- Narrow (mobile-browser) web layout follows the same rules, but this pass does not audit it separately.
- The native app will be rebuilt for this release. Adding native capabilities is acceptable.
- The original branch-on-edit behavior described in EXPANSION_SPEC is superseded by the owner's instruction.
  Project docs will record the change.
