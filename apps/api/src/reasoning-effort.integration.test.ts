import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  closePool,
  createConversation,
  createMessageRun,
  credentialAad,
  ensureProfile,
  getPool,
  lastFour,
  loadKeyring,
  migrate,
  saveOpenRouter,
  seal,
  workerQuery,
} from '@ai-chat/database';
import { buildServer } from './server.ts';

let owner: string;

beforeAll(() => {
  process.env.AI_CHAT_TEST_JWT_SECRET = 'synthetic-reasoning-effort-secret';
  process.env.ENCRYPTION_KEYS ??= `v1:${randomBytes(32).toString('base64url')}`;
  return migrate();
});

// Disposable database with an isolated synthetic owner; other integration tests keep their rows too.
afterAll(async () => {
  await closePool();
});

it('stores a per-conversation effort, rejects unknown values, and snapshots only supported efforts', async () => {
  owner = randomUUID();
  await ensureProfile(owner, { displayName: 'Synthetic Effort', avatarUrl: null, timezone: 'UTC' });
  const key = 'sk-or-test-key-effort';
  const ring = loadKeyring(process.env.ENCRYPTION_KEYS);
  await saveOpenRouter(owner, 0, {
    ...seal(ring, key, credentialAad(owner, 'openrouter', 1)),
    lastFour: lastFour(key),
  });
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(owner)
    .setIssuer('http://localhost/auth/v1')
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.AI_CHAT_TEST_JWT_SECRET));
  const headers = { authorization: `Bearer ${token}` };
  const app = buildServer();
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/conversations',
      headers,
      payload: { enabled_tools: [] },
    });
    const conversation = created.json().data as { id: string; version: number };
    expect(conversation.reasoning_effort ?? null).toBeNull();

    const saved = await app.inject({
      method: 'PATCH',
      url: `/v1/conversations/${conversation.id}`,
      headers: { ...headers, 'if-match': `"${conversation.version}"` },
      payload: { reasoning_effort: 'high' },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().data.reasoning_effort).toBe('high');

    const invalid = await app.inject({
      method: 'PATCH',
      url: `/v1/conversations/${conversation.id}`,
      headers: { ...headers, 'if-match': `"${saved.json().data.version}"` },
      payload: { reasoning_effort: 'extreme' },
    });
    expect(invalid.statusCode).toBeGreaterThanOrEqual(400);
  } finally {
    await app.close();
  }

  const withHighEffort = async () => {
    const chat = await createConversation(owner, { modelId: 'openai/gpt-test', enabledTools: [] });
    await getPool().query('update conversations set reasoning_effort = $2 where id = $1', [
      chat.id,
      'high',
    ]);
    return chat.id;
  };
  const sent = (conversationId: string, efforts: string[]) =>
    createMessageRun(owner, conversationId, randomUUID(), {
      clientMessageId: randomUUID(),
      text: `Effort check ${efforts.join(',')}`,
      fileIds: [],
      reasoningEfforts: efforts,
    });
  const supported = await sent(await withHighEffort(), ['low', 'high']);
  const unsupported = await sent(await withHighEffort(), ['low']);
  const snapshotEffort = async (runId: string) =>
    workerQuery(async (tx) => {
      const found = await tx.query('select tool_snapshot from runs where id = $1', [runId]);
      return (found.rows[0]?.tool_snapshot as { reasoningEffort?: string | null }).reasoningEffort;
    });
  expect(await snapshotEffort(supported.body.run.id)).toBe('high');
  expect(await snapshotEffort(unsupported.body.run.id)).toBeNull();
});
