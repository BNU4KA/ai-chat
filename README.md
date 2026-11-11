<div align="center">

# AI Chat

### Your models. Your tools. One conversation.

An AI agent chat for iOS, Android, and the web — powered by your own OpenRouter API key.

**iOS · Android · Web**

[Product specification](docs/AGENT_TASK.md) · [Roadmap](docs/IMPLEMENTATION_PLAN.md) · [Development status](docs/PROGRESS.md)

</div>

---

> **Project status: MVP implementation in active verification.**
> Google sign-in, streaming chat, document processing, action approvals, and Google adapters
> are implemented. Automated browser and backend tests use synthetic fixtures. Full live-provider
> journeys, native platform checks, and release preparation remain incomplete.

## A familiar chat, with tools to get things done

AI Chat is designed around a simple flow: sign in with Google, connect your OpenRouter key,
choose a model, and start a conversation. When a request needs more than a text response,
the agent can use connected tools and show its progress directly in the chat.

### Capabilities

| Capability                  | What it enables                                                              |
| --------------------------- | ---------------------------------------------------------------------------- |
| **Bring your own key**      | Use your own OpenRouter account and choose compatible models.                |
| **Google sign-in**          | Create an account and access the same conversations across devices.          |
| **Web research**            | Search the web and follow links back to the sources.                         |
| **Document conversations**  | Ask questions about uploaded Word DOC/DOCX, PDF, TXT, and Markdown files.    |
| **Photo questions**         | Attach JPG, PNG or WebP photos and ask a compatible vision model about them. |
| **Gmail & Google Calendar** | Find messages, check availability, and prepare actions.                      |
| **Review before acting**    | Confirm the exact email or calendar change before it is executed.            |
| **Russian & English**      | Follow device language/region or save a language preference in your profile. |
| **Background tasks**        | Return to a running task after closing the app or switching devices.         |

## Designed for control

- **Choose your model.** Model selection stays visible; paid model changes are never silent.
- **See what happens.** Tool activity, sources, and requests for confirmation appear in the conversation.
- **Manage your connections.** Replace your model key or disconnect a Google integration from settings.

The server stores user API keys and integration tokens encrypted on the server
so agents can continue working independently of the client. Conversations and uploaded files
are also stored server-side for synchronization. Relevant content is sent to the model or tool
provider when needed to answer a request. This is a hosted architecture, not an on-device-only app.

OpenRouter model usage is billed to the user's OpenRouter account. Hosting, file storage, and
web search have separate infrastructure costs; bringing a model key does not cover those services.

## Built as one cross-platform product

| Layer                      | Stack                                                |
| -------------------------- | ---------------------------------------------------- |
| App                        | Expo · React Native · React Native Web · Expo Router |
| API & background execution | TypeScript · Fastify · PostgreSQL job queue          |
| Accounts & data            | Supabase Auth · PostgreSQL · private Storage         |
| Models & integrations      | OpenRouter · Tavily · Gmail · Google Calendar        |

## Roadmap

- [x] Shared client, API, worker, and Google sign-in implementation
- [x] Streaming chat, model selection, and synchronized history implementation
- [x] Durable runs, tool execution, and confirmation cards
- [x] Document extraction and web research adapters
- [x] Gmail and Calendar consent and action adapters
- [ ] Complete live-provider and native acceptance checks
- [ ] Operational restore drill and release preparation

## For developers

Start with the [documentation index](docs/README.md). Implementation instructions live in
[AGENTS.md](AGENTS.md), with a sequenced [implementation plan](docs/IMPLEMENTATION_PLAN.md).
Setup commands are in [docs/SETUP.md](docs/SETUP.md). Provider checks require local credentials and explicitly authorized test data.

No license has been selected yet. Public source visibility does not by itself grant a software license.
