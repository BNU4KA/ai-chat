import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildServer } from './server.ts';
import {
  closePool,
  createConversation,
  createMessageRun,
  credentialAad,
  ensureProfile,
  loadKeyring,
  migrate,
  open,
  readEffectiveOpenRouterSecret,
  saveOpenRouter,
  seal,
  withOwner,
  withWorker,
} from '@ai-chat/database';

const adminId = randomUUID();
const memberId = randomUUID();
const serverKey = 'sk-or-synthetic-managed-4242';
const previousFetch = globalThis.fetch;
const previousAdmins = process.env.ADMIN_EMAILS;
const app = buildServer();

async function tokenFor(id: string, email: string, name: string) {
  return new SignJWT({ email, user_metadata: { name } })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuer('http://localhost/auth/v1')
    .setAudience('authenticated')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.AI_CHAT_TEST_JWT_SECRET));
}

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgres://postgres:synthetic-local-only@localhost:54329/ai_chat';
  process.env.AI_CHAT_TEST_JWT_SECRET = 'synthetic-admin-secret';
  process.env.ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64url')}`;
  process.env.ADMIN_EMAILS = 'Admin@Example.com';
  globalThis.fetch = async (input, init) => {
    if (String(input) === 'https://openrouter.ai/api/v1/key') {
      const auth = new Headers(init?.headers).get('authorization') ?? '';
      if (auth.includes('reject-me')) return new Response('no', { status: 401 });
      return new Response('{}', { status: 200 });
    }
    return previousFetch(input, init);
  };
  await migrate();
  await ensureProfile(adminId, {
    displayName: 'Admin Person',
    avatarUrl: null,
    timezone: 'UTC',
    email: 'admin@example.com',
  });
  await ensureProfile(memberId, {
    displayName: 'Member Person',
    avatarUrl: null,
    timezone: 'UTC',
    email: 'member@example.com',
  });
});

afterAll(async () => {
  globalThis.fetch = previousFetch;
  if (previousAdmins === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = previousAdmins;
  await app.close();
  await closePool();
});

it('keeps server keys admin-only, prefers a personal key, and schedules account purge', async () => {
  const adminToken = await tokenFor(adminId, 'admin@example.com', 'Admin Person');
  const memberToken = await tokenFor(memberId, 'member@example.com', 'Member Person');
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const denied = await app.inject({
    method: 'GET',
    url: '/v1/admin/users',
    headers: auth(memberToken),
  });
  expect(denied.statusCode).toBe(403);

  const adminProfile = await app.inject({
    method: 'GET',
    url: '/v1/profile',
    headers: auth(adminToken),
  });
  expect(adminProfile.statusCode).toBe(200);
  expect(adminProfile.json().data.is_admin).toBe(true);
  expect(adminProfile.json().data.email).toBe('admin@example.com');
  const memberProfile = await app.inject({
    method: 'GET',
    url: '/v1/profile',
    headers: auth(memberToken),
  });
  expect(memberProfile.json().data.is_admin).toBe(false);

  const invalid = await app.inject({
    method: 'POST',
    url: '/v1/admin/openrouter-keys',
    headers: { ...auth(adminToken), 'content-type': 'application/json' },
    payload: { label: 'Rejected', api_key: 'reject-me' },
  });
  expect(invalid.statusCode).toBe(422);
  expect(invalid.json().error.code).toBe('KEY_INVALID');

  const created = await app.inject({
    method: 'POST',
    url: '/v1/admin/openrouter-keys',
    headers: { ...auth(adminToken), 'content-type': 'application/json' },
    payload: { label: 'Shared', api_key: serverKey },
  });
  expect(created.statusCode).toBe(201);
  const key = created.json().data;
  expect(key.last_four).toBe('4242');
  expect(JSON.stringify(created.json())).not.toContain(serverKey);
  expect(created.json().data.api_key).toBeUndefined();

  await expect(
    withOwner(memberId, (tx) => tx.query('select id from managed_openrouter_keys')),
  ).rejects.toThrow(/permission denied/i);

  const assigned = await app.inject({
    method: 'PATCH',
    url: `/v1/admin/users/${memberId}/openrouter-key`,
    headers: { ...auth(adminToken), 'content-type': 'application/json' },
    payload: { managed_key_id: key.id },
  });
  expect(assigned.statusCode).toBe(200);
  expect(assigned.json().data.key_source).toBe('managed');
  expect(assigned.json().data.managed_key.last_four).toBe('4242');

  const credential = await app.inject({
    method: 'GET',
    url: '/v1/credentials/openrouter',
    headers: auth(memberToken),
  });
  expect(credential.json().data).toMatchObject({
    configured: true,
    source: 'managed',
    last_four: null,
    status: 'valid',
    version: 0,
  });

  const chat = await createConversation(memberId, {
    modelId: 'synthetic/model',
    enabledTools: [],
  });
  const run = await createMessageRun(memberId, chat.id, randomUUID(), {
    clientMessageId: randomUUID(),
    text: 'Hello from a server key',
    fileIds: [],
  });
  const stored = await withWorker(
    async (tx) =>
      (
        await tx.query(
          'select tool_snapshot, credential_version, cancel_requested_at from runs where id = $1',
          [run.body.run.id],
        )
      ).rows[0],
  );
  expect(stored?.tool_snapshot).toMatchObject({ keySource: 'managed', managedKeyId: key.id });
  expect(Number(stored?.credential_version)).toBe(1);
  const secret = await readEffectiveOpenRouterSecret(memberId);
  expect(secret?.source).toBe('managed');
  expect(open(loadKeyring(process.env.ENCRYPTION_KEYS), secret!.sealed, secret!.aad)).toBe(serverKey);

  await withWorker(async (tx) => {
    await tx.query(
      `update runs set usage = '{"input_tokens":1,"output_tokens":1,"cost_usd":"1.50","cost_status":"estimated"}'::jsonb where id = $1`,
      [run.body.run.id],
    );
  });
  const users = await app.inject({
    method: 'GET',
    url: '/v1/admin/users?query=Member%20Person',
    headers: auth(adminToken),
  });
  expect(users.statusCode).toBe(200);
  const listed = users.json().data.find((row: { id: string }) => row.id === memberId);
  expect(listed.conversations_count).toBe(1);
  expect(listed.total_cost_usd).toBe('1.5');
  expect(listed.key_source).toBe('managed');

  const ring = loadKeyring(process.env.ENCRYPTION_KEYS);
  await saveOpenRouter(memberId, 0, {
    ...seal(ring, 'personal-secret-1111', credentialAad(memberId, 'openrouter', 1)),
    lastFour: '1111',
  });
  expect((await readEffectiveOpenRouterSecret(memberId))?.source).toBe('personal');
  await saveOpenRouter(memberId, 1, {
    ...seal(ring, 'personal-secret-2222', credentialAad(memberId, 'openrouter', 2)),
    lastFour: '2222',
  });
  const afterReplace = await withWorker(
    async (tx) =>
      (await tx.query('select cancel_requested_at from runs where id = $1', [run.body.run.id]))
        .rows[0],
  );
  expect(afterReplace?.cancel_requested_at).toBeNull();
  const personal = await app.inject({
    method: 'GET',
    url: '/v1/credentials/openrouter',
    headers: auth(memberToken),
  });
  expect(personal.json().data).toMatchObject({
    configured: true,
    source: 'personal',
    last_four: '2222',
    version: 2,
  });

  const self = await app.inject({
    method: 'DELETE',
    url: `/v1/admin/users/${adminId}`,
    headers: auth(adminToken),
  });
  expect(self.statusCode).toBe(422);

  const removedUser = await app.inject({
    method: 'DELETE',
    url: `/v1/admin/users/${memberId}`,
    headers: auth(adminToken),
  });
  expect(removedUser.statusCode).toBe(202);
  const purge = await withWorker(
    async (tx) =>
      (
        await tx.query(
          `select id from outbox where owner_id = $1 and topic = 'account.purge'`,
          [memberId],
        )
      ).rowCount,
  );
  expect(purge).toBe(1);

  const removedKey = await app.inject({
    method: 'DELETE',
    url: `/v1/admin/openrouter-keys/${key.id}`,
    headers: auth(adminToken),
  });
  expect(removedKey.statusCode).toBe(204);
});
