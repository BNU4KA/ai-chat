import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  closePool,
  createConversation,
  createDocumentDraft,
  ensureProfile,
  markDocumentDraftCreated,
  migrate,
} from '@ai-chat/database';
import { buildServer } from './server.ts';

let owner: string;

beforeAll(async () => {
  process.env.AI_CHAT_TEST_JWT_SECRET = 'synthetic-document-draft-secret';
  process.env.ENCRYPTION_KEYS ??= `v1:${randomBytes(32).toString('base64url')}`;
  await migrate();
});

afterAll(async () => {
  await closePool();
});

it('keeps a draft editable with version checks until its file is created', async () => {
  owner = randomUUID();
  await ensureProfile(owner, { displayName: 'Synthetic Draft', avatarUrl: null, timezone: 'UTC' });
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(owner)
    .setIssuer('http://localhost/auth/v1')
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.AI_CHAT_TEST_JWT_SECRET));
  const headers = { authorization: `Bearer ${token}` };
  const conversation = await createConversation(owner, { modelId: 'openai/gpt-test', enabledTools: [] });
  const draft = await createDocumentDraft(owner, {
    conversationId: conversation.id,
    assistantMessageId: null,
    format: 'docx',
    title: 'Synthetic report',
    content: { blocks: [{ type: 'paragraph', text: 'First synthetic paragraph.' }] },
  });
  const app = buildServer();
  try {
    const listed = await app.inject({
      method: 'GET',
      url: `/v1/conversations/${conversation.id}/document-drafts`,
      headers,
    });
    expect(listed.json().data.map((item: { id: string }) => item.id)).toEqual([draft.id]);

    const saved = await app.inject({
      method: 'PATCH',
      url: `/v1/document-drafts/${draft.id}`,
      headers: { ...headers, 'if-match': `"${draft.version}"` },
      payload: {
        title: 'Edited report',
        content: { blocks: [{ type: 'heading', level: 1, text: 'Edited' }] },
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().data).toMatchObject({ title: 'Edited report', version: draft.version + 1 });

    const stale = await app.inject({
      method: 'PATCH',
      url: `/v1/document-drafts/${draft.id}`,
      headers: { ...headers, 'if-match': `"${draft.version}"` },
      payload: { title: 'Stale' },
    });
    expect(stale.statusCode).toBe(409);

    const withoutMessage = await app.inject({
      method: 'POST',
      url: `/v1/document-drafts/${draft.id}/create`,
      headers,
    });
    expect(withoutMessage.statusCode).toBe(422);

    await markDocumentDraftCreated(owner, draft.id, randomUUID());
    const locked = await app.inject({
      method: 'PATCH',
      url: `/v1/document-drafts/${draft.id}`,
      headers: { ...headers, 'if-match': `"${saved.json().data.version + 1}"` },
      payload: { title: 'After file' },
    });
    expect(locked.statusCode).toBe(409);
    expect(locked.json().error.code).toBe('DRAFT_CREATED');
  } finally {
    await app.close();
  }
});
