import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  closePool,
  createConversation,
  createMessageRun,
  credentialAad,
  ensureProfile,
  finalizeFile,
  getSnapshot,
  loadKeyring,
  migrate,
  reserveFile,
  saveOpenRouter,
  seal,
  withWorker,
  deleteFile,
} from '@ai-chat/database';
import { executeRun } from '@ai-chat/agent-runtime';
import { attachmentMessages } from './attachments.ts';
import { processFile } from './files.ts';
import { downloadStoredObject } from '@ai-chat/integrations';
import type * as Integrations from '@ai-chat/integrations';

vi.mock('@ai-chat/integrations', async (original) => ({
  ...(await original<typeof Integrations>()),
  downloadStoredObject: vi.fn(),
}));
beforeAll(async () => {
  process.env.ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64url')}`;
  await migrate();
});
afterAll(async () => {
  await closePool();
});
async function fixture() {
  const owner = randomUUID();
  await ensureProfile(owner, {
    displayName: 'Synthetic attachments',
    avatarUrl: null,
    timezone: 'UTC',
  });
  await saveOpenRouter(owner, 0, {
    ...seal(
      loadKeyring(process.env.ENCRYPTION_KEYS),
      'synthetic',
      credentialAad(owner, 'openrouter', 1),
    ),
    lastFour: 'etic',
  });
  const chat = await createConversation(owner, { modelId: 'synthetic/vision', enabledTools: [] });
  return { owner, chat };
}
async function file(owner: string, chat: string, name: string, bytes: Uint8Array) {
  const row = await reserveFile(owner, {
    conversation_id: chat,
    filename: name,
    byte_size: bytes.length,
    declared_mime: 'application/octet-stream',
  });
  vi.mocked(downloadStoredObject).mockResolvedValue(Buffer.from(bytes));
  await finalizeFile(owner, String(row.id));
  await processFile(String(row.id));
  return String(row.id);
}
it('passes actual photo content to the model without persisting base64 or signed URLs', async () => {
  const sharp = (await import('sharp')).default;
  const bytes = await sharp({
    create: { width: 40, height: 20, channels: 3, background: '#cc4422' },
  })
    .png()
    .toBuffer();
  const { owner, chat } = await fixture();
  const id = await file(owner, chat.id, 'synthetic.png', bytes);
  const created = await createMessageRun(owner, chat.id, randomUUID(), {
    clientMessageId: randomUUID(),
    text: 'What color is this?',
    fileIds: [id],
  });
  let submitted = '';
  await executeRun(created.body.run.id, {
    now: () => new Date(),
    prepareMessages: attachmentMessages(),
    loadKey: async () => ({ version: 1, apiKey: 'synthetic' }),
    ports: {},
    model: {
      complete: async (request) => {
        submitted = JSON.stringify(request.messages);
        return {
          text: 'Synthetic answer',
          toolCalls: [],
          usage: {
            input_tokens: null,
            output_tokens: null,
            cost_usd: null,
            cost_status: 'unknown',
          },
          generationId: null,
          submitted: true,
        };
      },
    },
  });
  expect(submitted).toContain('data:image/jpeg;base64,');
  expect(submitted).not.toContain('file_ref');
  expect((await getSnapshot(owner, created.body.run.id)).run.status).toBe('completed');
  const checkpoint = await withWorker(
    async (tx) =>
      (await tx.query('select checkpoint from runs where id=$1', [created.body.run.id])).rows[0]!
        .checkpoint,
  );
  expect(JSON.stringify(checkpoint)).toContain('file_ref');
  expect(JSON.stringify(checkpoint)).not.toContain('base64,');
  const other = await fixture();
  const hydrate = attachmentMessages();
  const denied = await hydrate(
    other.owner,
    other.chat.id,
    [{ role: 'user', content: [{ type: 'file_ref', file_id: id }] }],
    new AbortController().signal,
  );
  expect(JSON.stringify(denied)).not.toContain('base64,');
  const anotherChat = await createConversation(owner, {
    modelId: 'synthetic/vision',
    enabledTools: [],
  });
  const wrongChat = await hydrate(
    owner,
    anotherChat.id,
    [{ role: 'user', content: [{ type: 'file_ref', file_id: id }] }],
    new AbortController().signal,
  );
  expect(JSON.stringify(wrongChat)).not.toContain('base64,');
  await deleteFile(owner, id, 3);
  const removed = await hydrate(
    owner,
    chat.id,
    [{ role: 'user', content: [{ type: 'file_ref', file_id: id }] }],
    new AbortController().signal,
  );
  expect(JSON.stringify(removed)).not.toContain('base64,');
});
it('includes the extracted Word text even when document tools are disabled', async () => {
  const bytes = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(
      '<w:document><w:p><w:t>Synthetic budget is 123 euros.</w:t></w:p></w:document>',
    ),
  });
  const { owner, chat } = await fixture();
  const id = await file(owner, chat.id, 'budget.docx', bytes);
  const result = await attachmentMessages()(
    owner,
    chat.id,
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is the budget?' },
          { type: 'file_ref', file_id: id },
        ],
      },
    ],
    new AbortController().signal,
  );
  expect(JSON.stringify(result)).toContain('123 euros');
  expect(JSON.stringify(result)).not.toContain('file_ref');
});

it('rejects photo questions for a text-only model before starting paid inference', async () => {
  const sharp = (await import('sharp')).default;
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();
  const { owner, chat } = await fixture();
  const id = await file(owner, chat.id, 'photo.png', bytes);
  const provider = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      Response.json({
        data: [
          {
            id: 'synthetic/vision',
            name: 'Text only',
            architecture: { input_modalities: ['text'] },
            supported_parameters: [],
            context_length: 32000,
            pricing: {},
          },
        ],
      }),
    );
  try {
    const { validateChatModel } = await import('./models.ts');
    await expect(validateChatModel(owner, chat.id, [id])).rejects.toMatchObject({
      code: 'MODEL_IMAGES_UNSUPPORTED',
    });
  } finally {
    provider.mockRestore();
  }
});
