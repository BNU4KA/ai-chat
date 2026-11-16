import { randomBytes, randomUUID } from 'node:crypto';
import {
  closePool,
  createConversation,
  createMessageRun,
  credentialAad,
  editMessage,
  ensureProfile,
  getSnapshot,
  lastFour,
  loadKeyring,
  migrate,
  saveOpenRouter,
  seal,
  selectMessageVariant,
  withOwner,
  getPool,
  listMessages,
} from '@ai-chat/database';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { executeRun } from './execute.ts';
import { scriptedModel } from './scripted.ts';

const owner = randomUUID();
const key = 'sk-or-test-key-branching';

beforeAll(async () => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/ai_chat';
  process.env.ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64url')}`;
  await migrate();
  await ensureProfile(owner, { displayName: 'Branches', avatarUrl: null, timezone: 'UTC' });
  const ring = loadKeyring(process.env.ENCRYPTION_KEYS);
  await saveOpenRouter(owner, 0, {
    ...seal(ring, key, credentialAad(owner, 'openrouter', 1)),
    lastFour: lastFour(key),
  });
});

afterAll(async () => {
  await closePool();
});

async function answer(conversationId: string, text: string, reply: string) {
  const created = await createMessageRun(owner, conversationId, randomUUID(), {
    clientMessageId: randomUUID(),
    text,
    fileIds: [],
  });
  await executeRun(created.body.run.id, {
    now: () => new Date(),
    model: scriptedModel([{ text: reply }]),
    ports: {},
    loadKey: async () => ({ version: 1, apiKey: key }),
  });
  const snapshot = await getSnapshot(owner, created.body.run.id);
  expect(snapshot.run.status).toBe('completed');
  return created.body.run.user_message_id as string;
}

async function visibleTexts(conversationId: string) {
  const page = await listMessages(owner, conversationId, 100, null);
  return page.items.map((message) => message.content);
}

it('edits keep the original turn, switch between variants, and leave earlier history intact', async () => {
  const conversation = await createConversation(owner, { modelId: 'openai/gpt-test', enabledTools: [] });
  const firstUser = await answer(conversation.id, 'one', 'answer one');
  const secondUser = await answer(conversation.id, 'two', 'answer two');
  expect(await visibleTexts(conversation.id)).toEqual(['one', 'answer one', 'two', 'answer two']);

  const edited = await editMessage(owner, secondUser, 'two edited', randomUUID(), 'hash-edit');
  expect(edited.status).toBe(202);
  const editedBody = edited.body as { run: { id: string; user_message_id: string } };
  const editedUser = editedBody.run.user_message_id;
  expect(await visibleTexts(conversation.id)).toEqual(['one', 'answer one', 'two edited', '']);

  const original = await withOwner(owner, async (tx) =>
    tx.query('select id, content, superseded_at from messages where id = $1', [secondUser]),
  );
  expect(original.rows[0]).toMatchObject({ content: 'two', superseded_at: null });

  await executeRun(editedBody.run.id, {
    now: () => new Date(),
    model: scriptedModel([{ text: 'answer two edited' }]),
    ports: {},
    loadKey: async () => ({ version: 1, apiKey: key }),
  });
  const latest = await listMessages(owner, conversation.id, 100, null);
  const turn = latest.items.find((message) => message.id === editedUser);
  expect(turn?.branch).toEqual({ index: 2, count: 2, message_ids: [secondUser, editedUser] });

  await selectMessageVariant(owner, editedUser, secondUser);
  expect(await visibleTexts(conversation.id)).toEqual(['one', 'answer one', 'two', 'answer two']);

  await selectMessageVariant(owner, secondUser, editedUser);
  expect(await visibleTexts(conversation.id)).toEqual([
    'one',
    'answer one',
    'two edited',
    'answer two edited',
  ]);

  const earlier = await withOwner(owner, async (tx) =>
    tx.query('select count(*)::int as n from messages where conversation_id = $1', [
      conversation.id,
    ]),
  );
  expect(earlier.rows[0]?.n).toBe(6);
  expect(firstUser).toEqual(expect.any(String));
  await getPool().query('select 1');
});

it('creates a root branch for each new conversation so messages always have a branch', async () => {
  const conversation = await createConversation(owner, { modelId: 'openai/gpt-test', enabledTools: [] });
  const row = await withOwner(owner, async (tx) =>
    tx.query(
      'select c.active_leaf_branch_id, b.parent_branch_id from conversations c join conversation_branches b on b.id = c.active_leaf_branch_id where c.id = $1',
      [conversation.id],
    ),
  );
  expect(row.rows[0]?.active_leaf_branch_id).toBeTruthy();
  expect(row.rows[0]?.parent_branch_id).toBeNull();
});
