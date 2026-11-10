# UX specification

## Layout and visual rules

Use a quiet chat interface: neutral surfaces, one accent color, system typography, consistent
8-point spacing, 16 px base text on web, accessible native text scaling. Use tokens for color,
spacing, radii, and typography. Do not add marketing screens, dashboards, mascots, animations,
or an agent marketplace. No fake screenshots or completed-feature claims.

Desktop >= 1024 px: 280 px history sidebar, flexible main area, chat column max-width 800 px.
Below 1024 px: history in a dismissible drawer, top bar in the chat. Settings becomes full-screen
on narrow layouts. Composer stays above native keyboard and safe area; code blocks scroll
horizontally without overflowing the page. Respect reduced motion and focus visibility.

Theme choices: System (default), Light, Dark. All interactive controls have accessible labels;
web supports keyboard navigation and Escape closes non-destructive overlays. Color alone is
not a status signal. Use native pickers where appropriate.

## Screens and routes

| Route | Content and actions |
| --- | --- |
| /sign-in | App name, short purpose, Continue with Google, privacy/data-flow explanation |
| /auth/callback | Web OAuth completion, spinner, recoverable error with Back to sign in |
| /onboarding/key | Masked key entry, Show/Hide, Save and continue, Skip for now |
| / | Conversation list/new chat; redirect to selected conversation after creation |
| /chat/:id | Header, messages, tool cards, composer, sources, active-run state |
| /settings | Profile, key, connections, theme, data controls, sign out |
| /settings/connections | Independent Gmail/Calendar capability status and consent actions |
| /settings/data | Conversation deletion and account deletion explanation |

Native paths map to Expo Router dynamic files. Unauthenticated deep links resume the intended
owned route after login. Unauthorized/missing conversation IDs show a generic Not found screen.

## Sign-in and onboarding

One primary button: Continue with Google. It is disabled during an in-flight login. Cancellation
returns to the sign-in screen without a scary error. A real failure shows Try again and a safe
error message. No password form, organization picker, or simultaneous second auth provider in MVP
except a release-required iOS alternative.

First successful sign-in opens key onboarding. Subsequent sign-in opens the most recently used
conversation or empty state. Skip for now opens history but disables new runs with Add your
OpenRouter key. Never block access to settings or delete controls because a key is missing.

Key save states: idle, validating, valid, invalid, provider unavailable. Invalid input keeps the
previous working key. On success erase the full key from form state; settings shows only a mask.

## Conversation list and header

New chat creates a server conversation before opening it. Title starts as New chat; first message
provides a deterministic title, unless manually renamed. For an attachment-only first message,
use the first attached filename truncated to 60 characters. Search is title substring search,
case-insensitive, not semantic history search. Newest updated conversations first; pagination.
Rename is explicit; delete explains that active tasks stop and uploads dedicated to the chat are deleted.

Header: title, model selector, Tools menu, settings/history access. Tools menu groups Web,
Files, Gmail, Calendar; explain unavailable/not connected states. Web and Files are initially on
only if configured; Google capabilities start off. Tool toggles affect future runs, not a running snapshot.

Model selector: searchable catalog, price per million input/output tokens, context length,
Tools supported label, stale catalog marker if applicable. Unknown fields render as Not provided.
Plain chat may use a text model without tools only when no executable tools are selected.
Disable Run with an explanation for an incompatible model/tool combination.

## Messages and composer

Empty state: Start a conversation, plus small example prompts. Examples never imply a connected
Google account. Composer: multiline input, attach file, Send; Stop replaces Send during the
conversation's active run, including waiting_approval. Draft text is local and is not sent until Send.
Keep drafts in memory on mobile; web may use session-scoped storage, never a public cache.

Web Enter sends; Shift+Enter inserts a newline; IME composition does not submit. Mobile uses
an explicit Send button. Disable duplicate submissions; reuse the same idempotency key for a
network retry of the same message. While a run is active, keep draft editing but disable Send.

Messages show role, time, Markdown, copy action, attachment badges, sources, and task state.
No raw HTML rendering, executable embeds, or automatic remote image loading from model Markdown.
Open external links only for safe http/https schemes. Preserve scroll position while reading above
the bottom; show Jump to latest rather than force-scrolling on every token.

Retry is available only on the latest assistant result of the latest user turn, after its run is terminal.
Label that a retry creates a new paid run. It appends another attempt; it does not overwrite history.
Earlier attempts remain collapsible and link to their run. Do not add message editing/branching in MVP.

## Tool, source, and confirmation cards

Read action: tool name, concise safe target, running/completed/failed state, expandable bounded
result, source links where relevant. Never show credentials, raw headers, or hidden reasoning.
Citation numbering resolves to stored sources for that run, not model-invented URLs/page numbers.

Write proposal: exact recipients, subject/body, or calendar details; Confirm and Reject buttons.
Recipients include To/Cc/Bcc. Event preview includes calendar, title, start/end, timezone,
attendees, notifications, and reminder policy. All content is escaped text; no HTML mail preview.
Display expires-at and status. Editing a proposal in-place is outside MVP: reject and ask for changes.
After any decision disable both buttons; stale decisions show current server state.

Pending approval banner: Waiting for your confirmation; safe to close the app. Expired approval
shows Expired — ask the agent to prepare a new action. A successful action displays a provider
reference/link when available. Unknown outcome displays Outcome unconfirmed — check the provider
before trying again; never render it as Sent or automatically offer one-click resend.

## Files

Show uploading -> processing -> ready, with failure reason and remove action. Send cannot include
an unready file. File deletion removes the original and retrieval index; explain that existing
conversation answers may still quote it and deleting the conversation removes those copies. Accept PDF, TXT, MD, DOCX within the documented limits. Label scanned PDFs
with No extractable text; OCR is not supported yet. A file is scoped to one conversation.
Do not reuse another chat's file silently. Download requires current authorization.

## Settings and destructive operations

Connections show which Google account is connected, enabled capability, required authorization,
last error, and disconnect action. Disconnecting a capability immediately stops its new actions;
explain that already-submitted external operations may still finish.

Sign out clears local session, query cache, drafts, and open streams. It does not cancel server runs.
Account deletion requires explicit confirmation; show that tasks stop, connections are revoked
where possible, primary data is removed, and backups age out under the documented retention.
The client signs out after the deletion request is accepted. Do not promise deletion of messages
already sent to email recipients or data retained under provider policies.

## Loading, offline, and failure states

| Situation | Required behavior |
| --- | --- |
| Initial load | Skeleton, no fabricated history |
| No network | Persistent offline indicator; cached history if available, disable new requests |
| Lost SSE | Reconnecting indicator; fetch status/history and replay events from cursor |
| Invalid key | Add/update key action; retain draft and partial output |
| Insufficient balance | Explain OpenRouter balance; link to provider settings |
| Rate limit | Show retry availability; do not start a duplicate paid run |
| Tool unavailable | Explain which capability is unavailable; normal chat remains usable |
| Cancelled run | Keep partial text, label Cancelled; no claim that an external action was undone |
| Expired session | Refresh once, then sign-in with a return route; clear private cache on account change |
| Live integration absent | Not configured/Connect action; never simulated successful data |
