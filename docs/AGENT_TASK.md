# Implementation brief: AI Chat

## 1. Product objective

Build a production-oriented, single-user-per-account AI chat application for iOS, Android, and
web. A user signs in with Google, supplies an OpenRouter API key, chooses a model, and chats
with an agent that can research the web, read uploaded documents, and use connected Gmail
and Google Calendar tools. The interface should feel as simple as a conventional chat app.
Do not copy DeepSeek branding, visual assets, or proprietary UI code.

Implement real integrations, persistence, and agent execution. A UI prototype is not completion.

## 2. Confirmed requirements

| ID  | Requirement                                                                            |
| --- | -------------------------------------------------------------------------------------- |
| P01 | Shared React Native implementation for iOS, Android, and web.                          |
| P02 | Google SSO creates an account on first sign-in and restores it on subsequent sign-ins. |
| P03 | Bring-your-own OpenRouter key, encrypted on the server.                                |
| P04 | Accounts, conversation history, and cross-device synchronization in the first release. |
| P05 | Model-driven tool use with real execution, not persona-only chat.                      |
| P06 | Internet search and reading uploaded documents.                                        |
| P07 | Email and calendar access through explicit integration consent.                        |
| P08 | Persistent server tasks continue after the client disconnects.                         |
| P09 | Review the exact arguments before sending email or writing calendar data.              |

## 3. Fixed MVP scope

One agent, with server-authorized tools selected from those enabled in a conversation.
Default providers: OpenRouter, Tavily, Gmail, Google Calendar. The UI supports English and Russian, with automatic device-language/region selection and a
synchronized manual override in Profile → Region → Language. Existing stored choices are preserved.
All repository documentation remains English.

Owner-approved extension (2026-11-10): support attached photos (JPEG/PNG/WebP/GIF) and
legacy Word DOC alongside DOCX. Send private photos as real multimodal input to compatible
models and supply extracted Word text to the model. Retain private ownership and deletion rules.
Use the familiar Gemini chat layout and visual language with AI Chat branding.

Required: streaming chat, model catalog, conversation search by title, manual rename/delete,
retry last response, private uploads, sources, action cards, confirmation cards, connection
settings, light/dark/system theme, data/account deletion, and task recovery.

Excluded: multiple collaborating agents, custom agent builders, MCP, arbitrary code execution,
voice, image generation, OCR, vector databases/embeddings, organization accounts, billing,
Outlook, mailbox attachments, recurring/all-day calendar writes, and calendar deletion.
Do not expand scope until required scenarios pass.

Gmail and Calendar may connect to one Google account per application account. It may differ
from the Google account used to sign in; show its email clearly. The app has one OpenRouter
key per account and one active run per conversation, with at most three active runs per user.

## 4. Product behavior

- Google sign-in must not request Gmail or Calendar permissions.
- A missing key disables new model runs but does not hide existing history or settings.
- An unavailable optional tool does not disable normal chat.
- Model selection is explicit. Never silently switch models or providers outside the configured route.
- At conversation creation, default tools are web and files if available. Google tools start disabled.
- Enabling an integration globally does not silently enable it in every conversation.
- Users see actions, sources, and results, not hidden model reasoning.
- Model/tool errors never become fabricated successful answers.
- No automatic paid generation to create chat titles; use the first user message, truncated to 60 characters.
- The owner of the deployment supplies Tavily and infrastructure credentials. Users supply only their OpenRouter key and Google consent.

## 5. Sources of implementation detail

- ARCHITECTURE fixes the stack and responsibility boundaries.
- UX_SPEC defines each screen, empty/error/loading state, and interaction.
- DATA_MODEL defines persistence and access invariants.
- API_CONTRACT defines the internal application API. Provider API formats stay inside adapters.
- RUNTIME_SPEC defines execution, approval, retry, cancellation, and recovery.
- ACCEPTANCE_TESTS defines observable evidence; IMPLEMENTATION_PLAN defines task order.

Do not reinterpret a detailed rule through a vague summary in another file. Fix genuine conflicts
in the documents before implementing the affected code. Small internal helper choices are delegated;
changing product scope, service architecture, or data disclosure rules is not.

## 6. Delivery and honest readiness

Supply executable code, database migrations, lockfile, example configuration, tests, and setup
instructions for a fresh checkout. Provide separate API and worker processes, health checks,
structured redacted logs, and operational instructions for restart and backup/restore.
No secrets, private datasets, or real provider responses containing personal data in the public repo.

Distinguish these statuses in PROGRESS:

- Implemented: code and relevant automated checks exist.
- Live verified: the real provider flow was exercised with authorized test credentials.
- Blocked: a named external prerequisite is missing.

A blocked live check is not a passed check. Continue independent tasks without substituting
production mocks. Do not mark the entire MVP done while required live/platform checks are blocked.

For iOS public release, check Apple's current login-service requirements. If applicable, add
an equivalent privacy-preserving sign-in option, normally Sign in with Apple. Google sign-in
remains mandatory. Store publication is a separate release gate, not permission to add unrelated features.
Google Gmail scopes may require verification/security assessment before public use. Test-user
OAuth success alone does not establish production readiness.

## 7. Definition of done

All P01-P09 scenarios pass on the supported platforms; every required acceptance scenario has
recorded evidence; no external provider mock is used in production; account isolation, approval
races, uncertain side effects, and reconnect recovery are tested; a fresh checkout can be set up
from the documentation. State any uncompleted platform/provider/release checks explicitly.

Do not claim that a user's OpenRouter balance pays for hosting, search, storage, or Google
verification. Keep estimated usage distinct from confirmed provider usage and actual cost.

## Owner-approved functional expansion — 2026-11-11

Implement the eight primary and five additional improvements defined in EXPANSION_SPEC.md.
That specification supersedes conflicting original MVP scope rules for these specific features.
Original incomplete live/native checks remain required and must not block independent local work.
