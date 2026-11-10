<div align="center">

# AI Chat

### Your models. Your tools. One conversation.

An AI agent chat for iOS, Android, and the web — powered by your own OpenRouter API key.

**iOS · Android · Web**

[Product specification](docs/AGENT_TASK.md) · [Roadmap](docs/IMPLEMENTATION_PLAN.md) · [Development status](docs/PROGRESS.md)

</div>

---

> **Project status: specification complete; implementation has not started.**
> The features below describe the planned product. No application builds or hosted demo are available yet.

## A familiar chat, with tools to get things done

AI Chat is designed around a simple flow: sign in with Google, connect your OpenRouter key,
choose a model, and start a conversation. When a request needs more than a text response,
the agent can use connected tools and show its progress directly in the chat.

### Planned capabilities

| Capability | What it enables |
| --- | --- |
| **Bring your own key** | Use your own OpenRouter account and choose compatible models. |
| **Google sign-in** | Create an account and access the same conversations across devices. |
| **Web research** | Search the web and follow links back to the sources. |
| **Document conversations** | Ask questions about uploaded PDF, TXT, Markdown, and DOCX files. |
| **Gmail & Google Calendar** | Find messages, check availability, and prepare actions. |
| **Review before acting** | Confirm the exact email or calendar change before it is executed. |
| **Background tasks** | Return to a running task after closing the app or switching devices. |

## Designed for control

- **Choose your model.** Model selection stays visible; paid model changes are never silent.
- **See what happens.** Tool activity, sources, and requests for confirmation appear in the conversation.
- **Manage your connections.** Replace your model key or disconnect a Google integration from settings.

The planned architecture stores user API keys and integration tokens encrypted on the server
so agents can continue working independently of the client. Conversations and uploaded files
are also stored server-side for synchronization. Relevant content is sent to the model or tool
provider when needed to answer a request. This is a hosted architecture, not an on-device-only app.

OpenRouter model usage is billed to the user's OpenRouter account. Hosting, file storage, and
web search have separate infrastructure costs; bringing a model key does not cover those services.

## Built as one cross-platform product

| Layer | Planned stack |
| --- | --- |
| App | Expo · React Native · React Native Web · Expo Router |
| API & background execution | TypeScript · Fastify · PostgreSQL job queue |
| Accounts & data | Supabase Auth · PostgreSQL · private Storage |
| Models & integrations | OpenRouter · Tavily · Gmail · Google Calendar |

## Roadmap

- [ ] Project foundation and Google authentication
- [ ] Streaming chat, model selection, and cross-device history
- [ ] Durable agent execution and action approvals
- [ ] Web research and document tools
- [ ] Gmail and Google Calendar integrations
- [ ] Platform testing and release preparation

## For developers

Start with the [documentation index](docs/README.md). Implementation instructions live in
[AGENTS.md](AGENTS.md), with a sequenced [implementation plan](docs/IMPLEMENTATION_PLAN.md).
Setup commands will be added when the runnable scaffold exists; this repository currently
contains the product and engineering specifications only.

No license has been selected yet. Public source visibility does not by itself grant a software license.
