import { randomBytes, randomUUID } from 'node:crypto';
import {
  answerAgentQuestion,
  closePool,
  createConversation,
  createMessageRun,
  credentialAad,
  ensureProfile,
  getSnapshot,
  lastFour,
  loadKeyring,
  migrate,
  saveOpenRouter,
  seal,
  workerQuery,
} from '@ai-chat/database';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { executeRun } from './execute.ts';
import { scriptedModel } from './scripted.ts';

const owner = randomUUID();
const key = 'sk-or-test-key-questions';
const questionArgs = {
  questions: [
    {
      id: 'format',
      text: 'Which format should the report use?',
      options: [{ label: 'Short' }, { label: 'Detailed', description: 'With tables' }],
      allow_custom: true,
    },
  ],
};

beforeAll(async () => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/ai_chat';
  process.env.ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64url')}`;
  await migrate();
  await ensureProfile(owner, { displayName: 'Questions', avatarUrl: null, timezone: 'UTC' });
  const ring = loadKeyring(process.env.ENCRYPTION_KEYS);
  await saveOpenRouter(owner, 0, {
    ...seal(ring, key, credentialAad(owner, 'openrouter', 1)),
    lastFour: lastFour(key),
  });
});

afterAll(async () => {
  await closePool();
});

function deps(model: ReturnType<typeof scriptedModel>) {
  return {
    now: () => new Date(),
    model,
    ports: {},
    loadKey: async () => ({ version: 1, apiKey: key }),
  };
}

async function startTurn(text: string) {
  const conversation = await createConversation(owner, { modelId: 'openai/gpt-test', enabledTools: [] });
  const created = await createMessageRun(owner, conversation.id, randomUUID(), {
    clientMessageId: randomUUID(),
    text,
    fileIds: [],
  });
  const runId = created.body.run.id;
  await executeRun(
    runId,
    deps(
      scriptedModel([
        { calls: [{ name: 'ask_user', arguments: questionArgs }] },
        { text: 'Here is the report.' },
      ]),
    ),
  );
  return runId;
}

it('pauses for a question, resumes with the chosen option, and records the answer for the model', async () => {
  const runId = await startTurn('Write a report about our quarter');
  const waiting = await getSnapshot(owner, runId);
  expect(waiting.run.status).toBe('waiting_input');
  expect(waiting.questions).toHaveLength(1);
  const questionId = waiting.questions[0]!.id;

  const answered = await answerAgentQuestion(owner, questionId, {
    answers: [{ question_id: 'format', option_index: 1 }],
  });
  expect(answered.status).toBe('answered');
  await executeRun(runId, deps(scriptedModel([{ text: 'Here is the detailed report.' }])));

  const done = await getSnapshot(owner, runId);
  expect(done.run.status).toBe('completed');
  expect(done.questions).toHaveLength(0);
  const call = await workerQuery(async (tx) =>
    tx.query("select status, safe_result from tool_calls where run_id = $1 and name = 'ask_user'", [
      runId,
    ]),
  );
  expect(call.rows[0]?.status).toBe('succeeded');
  expect(call.rows[0]?.safe_result).toMatchObject({
    ok: true,
    data: { answers: [{ question: 'Which format should the report use?', selected: 'Detailed' }] },
  });
});

it('lets the user skip a question and answers only once', async () => {
  const runId = await startTurn('Plan something vague');
  const questionId = (await getSnapshot(owner, runId)).questions[0]!.id;
  expect(await answerAgentQuestion(owner, questionId, { skip: true })).toEqual({ status: 'skipped' });
  await expect(
    answerAgentQuestion(owner, questionId, { answers: [{ question_id: 'format', option_index: 0 }] }),
  ).rejects.toMatchObject({ status: 409, code: 'QUESTION_ALREADY_ANSWERED' });
  await executeRun(runId, deps(scriptedModel([{ text: 'Going ahead with a sensible default.' }])));
  expect((await getSnapshot(owner, runId)).run.status).toBe('completed');
});

it('rejects an answer after the wait expired', async () => {
  const runId = await startTurn('Another vague brief');
  const questionId = (await getSnapshot(owner, runId)).questions[0]!.id;
  await workerQuery(async (tx) =>
    tx.query("update agent_questions set expires_at = now() - interval '1 minute' where id = $1", [
      questionId,
    ]),
  );
  await expect(
    answerAgentQuestion(owner, questionId, { skip: true }),
  ).rejects.toMatchObject({ status: 410, code: 'QUESTION_EXPIRED' });
});
