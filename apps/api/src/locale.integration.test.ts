import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closePool, ensureProfile, workerQuery } from '@ai-chat/database';
import { buildServer } from './server.ts';
let owner: string;
beforeAll(() => {
  process.env.AI_CHAT_TEST_JWT_SECRET = 'synthetic-locale-test-secret';
});
afterAll(async () => {
  if (owner)
    await workerQuery(async (tx) => {
      await tx.query('delete from profiles where id=$1', [owner]);
    });
  await closePool();
});
it('persists language across API instances and rejects unsupported/stale changes', async () => {
  owner = randomUUID();
  await ensureProfile(owner, { displayName: 'Synthetic Locale', avatarUrl: null, timezone: 'UTC' });
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
    const initial = await app.inject({ method: 'GET', url: '/v1/profile', headers });
    expect(initial.statusCode).toBe(200);
    expect(initial.json().data.locale).toBe('auto');
    let version = initial.json().data.version;
    for (const locale of ['ru', 'en', 'auto']) {
      const saved = await app.inject({
        method: 'PATCH',
        url: '/v1/profile',
        headers: { ...headers, 'if-match': `"${version}"` },
        payload: { locale },
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().data.locale).toBe(locale);
      version = saved.json().data.version;
      const second = buildServer();
      try {
        const read = await second.inject({ method: 'GET', url: '/v1/profile', headers });
        expect(read.json().data.locale).toBe(locale);
      } finally {
        await second.close();
      }
    }
    const bad = await app.inject({
      method: 'PATCH',
      url: '/v1/profile',
      headers: { ...headers, 'if-match': `"${version}"` },
      payload: { locale: 'fr' },
    });
    expect(bad.statusCode).toBe(422);
    const stale = await app.inject({
      method: 'PATCH',
      url: '/v1/profile',
      headers: { ...headers, 'if-match': '"1"' },
      payload: { locale: 'ru' },
    });
    expect(stale.statusCode).toBe(409);
  } finally {
    await app.close();
  }
});
