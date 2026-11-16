import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { executeRun, scriptedModel } from '@ai-chat/agent-runtime';
import {
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
import { maintainTasks } from './maintenance.ts';

const owner = randomUUID();
const key = 'sk-or-test-key-question-expiry';

beforeAll(async () => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/ai_chat';
  process.env.ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64url')}`;
  await migrate();
  await ensureProfile(owner, { displayName: 'Expiry', avatarUrl: null, timezone: 'UTC' });
  const ring = loadKeyring(process.env.ENCRYPTION_KEYS);
  await saveOpenRouter(owner, 0, {
    ...seal(ring, key, credentialAad(owner, 'openrouter', 1)),
    lastFour: lastFour(key),
  });
});

afterAll(async () => {
  await closePool();
});

it('ends a run whose question was not answered within the wait window', async () => {
  const conversation = await createConversation(owner, { modelId: 'openai/gpt-test', enabledTools: [] });
  const created = await createMessageRun(owner, conversation.id, randomUUID(), {
    clientMessageId: randomUUID(),
    text: 'A brief that needs a choice',
    fileIds: [],
  });
  const runId = created.body.run.id as string;
  await executeRun(runId, {
    now: () => new Date(),
    model: scriptedModel([
      {
        calls: [
          {
            name: 'ask_user',
            arguments: {
              questions: [
                {
                  id: 'scope',
                  text: 'Which scope?',
                  options: [{ label: 'Quarter' }, { label: 'Year' }],
                },
              ],
            },
          },
        ],
      },
    ]),
    ports: {},
    loadKey: async () => ({ version: 1, apiKey: key }),
  });
  expect((await getSnapshot(owner, runId)).run.status).toBe('waiting_input');

  await workerQuery(async (tx) =>
    tx.query("update agent_questions set expires_at = now() - interval '1 minute' where run_id = $1", [
      runId,
    ]),
  );
  await maintainTasks();

  const after = await getSnapshot(owner, runId);
  expect(after.run.status).toBe('failed');
  expect(after.run.error_code).toBe('QUESTION_EXPIRED');
  expect(after.questions).toHaveLength(0);
  const row = await workerQuery(async (tx) =>
    tx.query('select status from agent_questions where run_id = $1', [runId]),
  );
  expect(row.rows[0]?.status).toBe('expired');
});
