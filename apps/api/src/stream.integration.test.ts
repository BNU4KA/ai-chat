import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  closePool,
  workerQuery,
  appendEvent,
  createConversation,
  createMessageRun,
  credentialAad,
  ensureProfile,
  loadKeyring,
  migrate,
  saveOpenRouter,
  seal,
} from '@ai-chat/database';
import { buildServer } from './server.ts';

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:54329/ai_chat';
  process.env.AI_CHAT_TEST_JWT_SECRET = 'synthetic-test-only-signing-secret';
  await migrate();
});
afterAll(async () => {
  await closePool();
});
it('serves authenticated terminal SSE with CORS and closes the stream', async () => {
  const owner = randomUUID();
  await ensureProfile(owner, { displayName: 'Synthetic SSE', avatarUrl: null, timezone: 'UTC' });
  const ring = loadKeyring('v1:' + randomBytes(32).toString('base64url'));
  await saveOpenRouter(owner, 0, {
    ...seal(ring, 'synthetic', credentialAad(owner, 'openrouter', 1)),
    lastFour: 'etic',
  });
  const chat = await createConversation(owner, { modelId: 'synthetic/model', enabledTools: [] });
  const created = await createMessageRun(owner, chat.id, randomUUID(), {
    clientMessageId: randomUUID(),
    text: 'Synthetic SSE',
    fileIds: [],
  });
  await workerQuery(async (tx) => {
    await tx.query("update runs set status='completed', finished_at=now() where id=$1", [
      created.body.run.id,
    ]);
    await tx.query("update messages set status='complete', content='SSE result' where id=$1", [
      created.body.run.assistant_message_id,
    ]);
    await appendEvent(tx, owner, created.body.run.id, 'run.completed', {
      assistant_message_id: created.body.run.assistant_message_id,
      final_content: 'SSE result',
      usage: {},
    });
  });
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(owner)
    .setIssuer('http://localhost/auth/v1')
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.AI_CHAT_TEST_JWT_SECRET));
  const app = buildServer();
  try {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const response = await fetch(`${address}/v1/runs/${created.body.run.id}/events`, {
      headers: { authorization: `Bearer ${token}`, origin: 'http://localhost:8081' },
      signal: AbortSignal.timeout(3000),
    });
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
    expect(response.headers.get('cache-control')).toContain('no-store');
    const text = await response.text();
    expect(text).toContain('event: run.completed');
    expect(text).toContain('SSE result');
    const ids = [...text.matchAll(/^id: (\d+)/gm)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  } finally {
    await app.close();
  }
});
