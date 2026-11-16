import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closePool, ensureProfile, workerQuery } from '@ai-chat/database';
import { buildServer } from './server.ts';

let owner: string;

beforeAll(() => {
  process.env.AI_CHAT_TEST_JWT_SECRET = 'synthetic-chat-activity-test-secret';
});

afterAll(async () => {
  if (owner)
    await workerQuery(async (tx) => {
      await tx.query('delete from runs where owner_id=$1', [owner]);
      await tx.query('delete from messages where owner_id=$1', [owner]);
      await tx.query('delete from conversations where owner_id=$1', [owner]);
      await tx.query('delete from profiles where id=$1', [owner]);
    });
  await closePool();
});

async function seedRun(conversationId: string, status: 'completed' | 'running') {
  await workerQuery(async (tx) => {
    const user = randomUUID();
    const assistant = randomUUID();
    const run = randomUUID();
    await tx.query(
      `insert into messages (id, owner_id, conversation_id, seq, role, content, status)
       values ($1, $3, $2, (select coalesce(max(seq), 0) + 1 from messages where conversation_id = $2), 'user', 'synthetic', 'complete')`,
      [user, conversationId, owner],
    );
    await tx.query(
      `insert into messages (id, owner_id, conversation_id, seq, role, content, status)
       values ($1, $3, $2, (select coalesce(max(seq), 0) + 1 from messages where conversation_id = $2), 'assistant', '', 'complete')`,
      [assistant, conversationId, owner],
    );
    await tx.query(
      `insert into runs (id, owner_id, conversation_id, user_message_id, assistant_message_id, attempt, status, model_id, tool_snapshot, credential_version, finished_at)
       values ($1, $2, $3, $4, $5, 1, $6, 'synthetic/model', '[]'::jsonb, 1, $7)`,
      [
        run,
        owner,
        conversationId,
        user,
        assistant,
        status,
        status === 'completed' ? new Date() : null,
      ],
    );
  });
}

it('pins, reports running and unread activity, and clears unread when seen', async () => {
  owner = randomUUID();
  await ensureProfile(owner, { displayName: 'Synthetic Activity', avatarUrl: null, timezone: 'UTC' });
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
    expect(created.statusCode).toBe(201);
    const conversation = created.json().data as { id: string; version: number; updated_at: string };
    expect(conversation.updated_at).toBeTruthy();

    const pin = await app.inject({
      method: 'PUT',
      url: `/v1/conversations/${conversation.id}/pin`,
      headers,
    });
    expect(pin.statusCode).toBe(200);
    expect(pin.json().data.pinned_at).toEqual(expect.any(String));

    const pinnedList = await app.inject({
      method: 'GET',
      url: '/v1/conversations?pinned=true',
      headers,
    });
    expect(pinnedList.json().data.map((c: { id: string }) => c.id)).toEqual([conversation.id]);

    const afterPin = await app.inject({
      method: 'GET',
      url: `/v1/conversations/${conversation.id}`,
      headers,
    });
    expect(afterPin.json().data.version).toBe(conversation.version);
    expect(afterPin.json().data.updated_at).toBe(conversation.updated_at);

    await seedRun(conversation.id, 'completed');
    const unread = await app.inject({
      method: 'GET',
      url: `/v1/conversations/${conversation.id}`,
      headers,
    });
    expect(unread.json().data.activity).toBe('unread');

    const seen = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${conversation.id}/seen`,
      headers,
    });
    expect(seen.json().data.activity).toBe('idle');

    await seedRun(conversation.id, 'running');
    const running = await app.inject({
      method: 'GET',
      url: '/v1/conversations?limit=10',
      headers,
    });
    const listed = running
      .json()
      .data.find((c: { id: string }) => c.id === conversation.id) as { activity: string };
    expect(listed.activity).toBe('running');

    const unpin = await app.inject({
      method: 'DELETE',
      url: `/v1/conversations/${conversation.id}/pin`,
      headers,
    });
    expect(unpin.json().data.pinned_at).toBeNull();

    const missing = await app.inject({
      method: 'PUT',
      url: `/v1/conversations/${randomUUID()}/pin`,
      headers,
    });
    expect(missing.statusCode).toBe(404);
  } finally {
    await app.close();
  }
});
