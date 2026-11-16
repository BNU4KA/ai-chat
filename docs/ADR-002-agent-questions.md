# ADR-002: Agent questions with answer options (`ask_user`)

Status: accepted for implementation (owner decisions, 2026-11-16). Extends the tool and run model in
`RUNTIME_SPEC.md`; the approval mechanism it mirrors is described there and in ADR-001 context.

## Context

When a request is ambiguous (for example a vague brief for a document), the model asks the user in plain
text. Users then type a free answer. Some clients show a card with options and an "other" field. The owner
wants the same: the agent pauses, shows a question with choices, and continues from the answer.

Chips (CHAT-204) are different: they are suggestions for the next message and never pause a run.

## Decisions

1. **Tool.** A built-in tool `ask_user` with arguments:
   - `questions`: 1 to 3 questions in one call. The owner decided that several questions may be asked
     when the agent needs them.
   - each question: `id` (short slug, unique in the call), `text` (max 300 characters), `options`
     (2 to 4 entries, each `label` max 80 characters and optional `description` max 160), and
     `allow_custom` (default true; the "Other" text field).
   - Single choice per question. Multi-select is out of scope.
2. **Skipping is allowed.** The user may skip the whole question set. The tool result then says the user
   skipped it, and the model must continue without inventing an answer.
3. **Waiting.** The run moves to a new status `waiting_input` and pauses without a model call. Waiting costs
   nothing, so the owner set the timeout to **12 hours**. After expiry the run ends as `failed` with error code
   `QUESTION_EXPIRED` (same handling as expired approvals); the model is not asked to guess.
4. **When to ask.** The owner wants questions only when they are needed: an ambiguous brief, a choice that
   changes the result materially, missing required input. Routine confirmations and questions the model can
   answer itself are not asked. This is enforced by the system prompt and by a limit of one `ask_user` call per
   run turn. Asking is a model decision, not a user setting.
5. **Persistence.** New table `agent_questions` (owner-scoped, RLS like `approvals`): `id`, `owner_id`,
   `run_id`, `tool_call_id`, `questions jsonb`, `answers jsonb null`, `status` (`pending`, `answered`,
   `skipped`, `expired`), `expires_at` (created_at + 12 h), `decided_at`. Migration adds `waiting_input` to the
   run status constraint.
6. **Resume.** Answer or skip writes the result to the tool call and moves the run to `queued`, then the
   existing continuation path runs (the same path as approval decisions). Concurrent answers are accepted once;
   later ones get 409.
7. **Recovery.** The run snapshot includes the pending question, so the card is restored after a reload or on
   another device. Expiry is swept by the same sweeper that expires approvals.
8. **Client.** A card in the chat stream: question text, option radio list, optional "Other" field, and
   buttons "Answer" and "Skip". Keyboard and screen reader behaviour follow the existing approval card.

## Consequences

- One more run state; every place that lists run statuses must handle `waiting_input` (snapshot, active-run
  checks, sidebar activity indicator should show it as running-with-question).
- The approval and question paths share the continuation code; tests must cover both.
- Cost: no model calls while waiting; the answer continuation uses the normal budget checks.

## Alternatives considered

- Ask in plain text and parse the reply: unreliable and gives no structure for options. Rejected.
- Use the existing approval table with a new kind: mixes two concepts with different rules (approval has
  arguments hash and write semantics). Rejected.
- Block indefinitely: holds a run slot. Rejected in favour of the 12-hour expiry.

## Verification plan

- Integration: ask pauses the run; answer resumes with the answer in the tool result; skip resumes with the
  skip marker; second answer gets 409; expired question cancels the run with `QUESTION_EXPIRED`; the question
  survives a snapshot reload.
- Runtime test: a scripted model asks, then continues after an answer.
- Client: card renders options and "Other"; answering and skipping update the stream; no duplicate card after
  reload.
- Existing approval and run tests must keep passing.

## Open items

- Exact prompt wording for when to ask; to be tuned with real conversations.
