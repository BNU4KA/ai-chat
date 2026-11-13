# UX specification

## Layout and visual rules

Use the owner-approved ChatGPT UI Kit visual language while retaining AI Chat branding and
original assets: neutral monochrome surfaces, compact controls, a rounded floating composer,
borderless assistant responses, restrained user bubbles, and dense conversation navigation.
Light palette: white canvas, #f9f9f9 sidebar, #0d0d0d primary action. Dark palette:
#000000 canvas/sidebar, #212121 composer/surfaces, #2f2f2f controls, white primary action. Keep semantic
color, spacing, radius, typography, and elevation tokens shared by chat, dialogs, settings,
workspace, and authentication. Do not copy ChatGPT logos, names, or proprietary assets.
Use system typography and consistent
8-point spacing, 16 px base text on web, accessible native text scaling. Use tokens for color,
spacing, radii, and typography. Do not add marketing screens, dashboards, mascots, animations,
or an agent marketplace. No fake screenshots or completed-feature claims.

Desktop >= 1024 px: 260 px history sidebar that collapses to a 60 px icon rail, flexible main
area, chat column max-width 800 px. On web it starts collapsed and expands over the chat on
mouse hover, without shifting content. It collapses when the pointer leaves, except while
search is focused. The menu toggle pins/unpins the expanded sidebar. Width changes use a 180 ms eased
transition, disabled when the web user prefers reduced motion.
The sidebar has a menu toggle, compact New chat action,
search, recent conversations, and bottom-anchored settings/account controls.
Below 1024 px: history in a full-height left drawer up to 320 px wide, with a dimmed backdrop
and no centered dialog or duplicate heading. Close with its menu button, backdrop, Escape on
web, or the native back action. Keep the top bar in the chat. Settings becomes full-screen
on narrow layouts. Composer stays above native keyboard and safe area; code blocks scroll
horizontally without overflowing the page. Respect reduced motion and focus visibility.

Theme choices: System (default), Light, Dark. All interactive controls have accessible labels;
web supports keyboard navigation and Escape closes non-destructive overlays. Color alone is
not a status signal. Use native pickers where appropriate.

## Screens and routes

| Route                 | Content and actions                                                          |
| --------------------- | ---------------------------------------------------------------------------- |
| /sign-in              | App name, short purpose, Continue with Google, privacy/data-flow explanation |
| /auth/callback        | Web OAuth completion, spinner, recoverable error with Back to sign in        |
| /onboarding/key       | Redirects to `/?panel=key`. Dialog: masked key, Show/Hide, Save, Skip        |
| /                     | Conversation list/new chat; redirect to selected conversation after creation |
| /chat/:id             | Header, messages, tool cards, composer, sources, active-run state            |
| /settings             | Redirects to `/?panel=settings`. Dialog over the current chat                |
| /settings/connections | Redirects to `/?panel=connections`. Back returns to settings in the dialog   |
| /settings/data        | Redirects to `/?panel=data`. Typed account deletion stays in the dialog      |

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
conversation answers may still quote it and deleting the conversation removes those copies. Accept JPEG, PNG, WebP and GIF photos, Word DOC/DOCX, PDF, TXT and MD within the
documented limits. Show photo thumbnails and document cards in the composer and message
history, with remove and processing/failure states. Models without image input must show
a clear compatibility error rather than silently ignoring the attachment. Label scanned PDFs
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

| Situation               | Required behavior                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Initial load            | Skeleton, no fabricated history                                                       |
| No network              | Persistent offline indicator; cached history if available, disable new requests       |
| Lost SSE                | Reconnecting indicator; fetch status/history and replay events from cursor            |
| Invalid key             | Add/update key action; retain draft and partial output                                |
| Insufficient balance    | Explain OpenRouter balance; link to provider settings                                 |
| Rate limit              | Show retry availability; do not start a duplicate paid run                            |
| Tool unavailable        | Explain which capability is unavailable; normal chat remains usable                   |
| Cancelled run           | Keep partial text, label Cancelled; no claim that an external action was undone       |
| Expired session         | Refresh once, then sign-in with a return route; clear private cache on account change |
| Live integration absent | Not configured/Connect action; never simulated successful data                        |

### Start screen and attachment behavior

The home route starts a fresh conversation draft with a centered greeting, composer and
suggestion chips. Existing conversations remain in history. New chat clears the draft and
returns home without creating an empty server conversation. The first message or attachment
creates the conversation. Model selection and Tools are next to the send control; the profile
avatar opens settings. Keep all controls inside narrow screens.

Photo bytes are decoded and normalized server-side, with orientation corrected and metadata
stripped before inference. Only the five most recent distinct photo attachments are included
in a model request; earlier omitted photos are explicitly labelled in context. The current
limit is 40 megapixels per source photo and 2048 pixels per side for model input. GIF uses
its first frame. Word documents are text-extracted; this does not preserve embedded pictures
or page layout and does not implement editing/export. Google Docs links need a separate
Drive integration and are not supported by this attachment feature.

### Response action bar

Use a compact row of outlined icons under an assistant response: helpful, unhelpful,
retry (only when permitted), share, more. No full-width retry control or permanent text Copy
link. More opens a small dismissible menu with Copy response. Keep accessible names and
hover labels. Helpful/unhelpful choices toggle and are stored per account/message on the
current device; they do not train a model or imply feedback has been sent to a provider.
Share opens the device share UI or copies the response for sharing when unsupported; it
must not automatically publish a conversation or send content to another person. Retry keeps
the existing paid-request confirmation. User messages use a single outlined copy icon.

### Current message controls and motion

Assistant messages expose compact retry (latest terminal response only), share, and direct
copy controls. There are no rating controls or overflow menus. User copy appears outside,
below, and right-aligned with the user bubble. Icons are subdued gray at rest and become
clearer on hover; accessible names remain available without hover. Retry retains confirmation.

The focused composer has no inner textarea outline. The whole composer receives a restrained
high-contrast focus boundary and subtle elevation. Message/attachment entry, dialogs, tooltips,
sidebar width, and control states use gentle transitions. Shared loading visuals use neutral
skeletons for content and compact activity marks for inline work. Respect reduced-motion
preferences by disabling shimmer and motion while preserving a visible static focus boundary.


### Language and loading motion

Profile settings expose Region → Language → Automatic / Русский / English. New profiles use
Automatic; preserve existing saved values. Supported preferred device languages take priority;
if none is supported, a Russian region selects Russian and all other regions fall back to
English. No IP lookup or geolocation permission is involved. Manual choices sync through the
profile API, override device locale, and survive sign-out/device changes. Localized UI chrome
includes labels, placeholders, loading, settings, onboarding and action controls. Model output,
user input, original documents, filenames and provider/model names retain their original language.

The composer uses a quiet border at rest and a stronger focus boundary while editing. Loading
uses content-shaped skeletons without implying percentage progress. Inline model, file, tool,
and streaming work uses a compact activity mark. Respect reduced motion with static skeletons
and pause non-essential motion while the app is hidden.

## Owner-approved workspace expansion — 2026-11-11

EXPANSION_SPEC.md supersedes the original no-branching/no-proposal-editing and isolated-file
rules for the explicitly listed features. Workspace opens as a wide dialog over the current chat
(`panel=workspace`): projects, documents, full-text message search, daily/weekly tasks and
persisted notices. `/workspace` redirects there and keeps a `document` query when present. Work tools and Projects & tasks open from the chat header, beside the profile control. The work-tools sidebar closes with its own close control, Escape, or Back. Chat Work tools exposes project
membership, reviewed context boundaries, documents, workflow starters, research, run budgets
and primary-calendar meeting suggestions. Selection actions prepare drafts without submitting.
Original chats and document versions remain available. Source citations open saved evidence;
PDF links use actual stored page references. Scheduled results use in-app notices; background
push outside the application is not claimed. Export is Markdown or escaped standalone HTML.

### Shared workspace styling and proposal edits — 2026-11-12

Workspace and chat work tools use shared horizontally scrollable section navigation, outlined
selected controls matching Settings, theme tokens and the existing rounded fields/panels.
Only primary save/create/confirm actions use filled accents. Secondary response/editor actions
use subdued compact controls. Scheduled model selection reuses the chat's searchable catalog
inside the same dialog; it never renders the full catalog as a long stack of primary buttons.
Work tools close with Escape on web or Back on native. Layout remains usable without page-wide
horizontal overflow in narrow viewports. Russian chrome keeps original model/document/user text.

When editing a proposal, show full preview values but send only fields explicitly changed from
the edit baseline, preserving absent PATCH fields and untouched recipient names. Clearing an
existing recipient list is explicit; untouched optional attendees/description are never emptied.
Saving still invalidates the old approval and requires review/confirmation of the new preview.
