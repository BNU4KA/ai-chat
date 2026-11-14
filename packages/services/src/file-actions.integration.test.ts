import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
  buildDocx,
  buildPdf,
  readDocxStructureBytes,
  completeOpenRouterJson,
  editOpenRouterImage,
} from '@ai-chat/integrations';
import type * as Integrations from '@ai-chat/integrations';
import {
  closePool,
  createConversation,
  createMessageRun,
  credentialAad,
  ensureProfile,
  getSnapshot,
  loadKeyring,
  migrate,
  saveOpenRouter,
  seal,
  withWorker,
} from '@ai-chat/database';
import { createDocumentFile, editDocumentFile, editImageFile } from './file-actions.ts';

const objects = new Map<string, Buffer>();

vi.mock('@ai-chat/integrations', async (original) => ({
  ...(await original<typeof Integrations>()),
  storageConfigured: vi.fn(() => true),
  uploadStoredObject: vi.fn(async (key: string, bytes: Uint8Array) => {
    objects.set(key, Buffer.from(bytes));
  }),
  downloadStoredObject: vi.fn(async (key: string) => {
    const value = objects.get(key);
    if (!value) throw new Error('Stored file could not be read');
    return value;
  }),
  completeOpenRouterJson: vi.fn(),
  editOpenRouterImage: vi.fn(),
}));

beforeAll(async () => {
  process.env.ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64url')}`;
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/ai_chat';
  await migrate();
});

afterAll(async () => {
  await closePool();
});

async function fixture() {
  const owner = randomUUID();
  await ensureProfile(owner, { displayName: 'Synthetic files', avatarUrl: null, timezone: 'UTC' });
  await saveOpenRouter(owner, 0, {
    ...seal(loadKeyring(process.env.ENCRYPTION_KEYS), 'synthetic', credentialAad(owner, 'openrouter', 1)),
    lastFour: 'etic',
  });
  const chat = await createConversation(owner, { modelId: 'synthetic/text', enabledTools: [] });
  const created = await createMessageRun(owner, chat.id, randomUUID(), {
    clientMessageId: randomUUID(),
    text: 'Make a file',
    fileIds: [],
  });
  const snapshot = await getSnapshot(owner, created.body.run.id);
  return { owner, chat: chat.id, assistant: String(snapshot.assistant_message.id) };
}

async function sourceFile(
  owner: string,
  chat: string,
  name: string,
  mime: string,
  bytes: Uint8Array,
  status = 'ready',
) {
  const id = randomUUID();
  const key = `${owner}/${chat}/${id}-${name}`;
  objects.set(key, Buffer.from(bytes));
  await withWorker(async (tx) => {
    await tx.query(
      `insert into files (id, owner_id, conversation_id, object_key, original_name, detected_mime, byte_size, status, sha256)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'0000')`,
      [id, owner, chat, key, name, mime, bytes.length, status],
    );
  });
  return id;
}

async function fileRow(id: string) {
  return withWorker(
    async (tx) => (await tx.query('select * from files where id=$1', [id])).rows[0]!,
  );
}

async function derivedCount(source: string) {
  return withWorker(
    async (tx) =>
      Number(
        (await tx.query('select count(*)::int as n from files where derived_from_file_id=$1', [source]))
          .rows[0]!.n,
      ),
  );
}

const contract = {
  title: 'Synthetic contract',
  blocks: [
    { type: 'heading' as const, level: 1 as const, text: 'Scope' },
    { type: 'paragraph' as const, text: 'Price: 1000 EUR for synthetic work.' },
    { type: 'list' as const, ordered: false, items: ['Delivery in 30 days'] },
    {
      type: 'table' as const,
      header: ['Item', 'Amount'],
      rows: [['Design', '1000']],
    },
  ],
};

it('creates Word and PDF attachments linked to the assistant message and refuses empty content', async () => {
  const { owner, chat, assistant } = await fixture();
  const docx = await createDocumentFile({
    ownerId: owner,
    conversationId: chat,
    assistantMessageId: assistant,
    format: 'docx',
    title: 'Report',
    content: { blocks: [{ type: 'paragraph', text: 'Synthetic report body.' }] },
  });
  expect(docx.ok).toBe(true);
  const docxId = String((docx.data as { file_id: string }).file_id);
  expect((await fileRow(docxId)).detected_mime).toContain('wordprocessingml');
  expect(String(objects.get(String((await fileRow(docxId)).object_key))?.subarray(0, 2))).toBe('PK');

  const pdf = await createDocumentFile({
    ownerId: owner,
    conversationId: chat,
    assistantMessageId: assistant,
    format: 'pdf',
    title: 'Checklist',
    content: { blocks: [{ type: 'list', ordered: true, items: ['Sign', 'Pay'] }] },
  });
  expect(pdf.ok).toBe(true);
  const pdfRow = await fileRow(String((pdf.data as { file_id: string }).file_id));
  expect(pdfRow.detected_mime).toBe('application/pdf');
  expect(objects.get(String(pdfRow.object_key))?.subarray(0, 5).toString()).toBe('%PDF-');

  const links = await withWorker(
    async (tx) =>
      (await tx.query('select file_id from message_files where message_id=$1', [assistant])).rows,
  );
  expect(links.length).toBeGreaterThanOrEqual(2);

  const before = objects.size;
  const empty = await createDocumentFile({
    ownerId: owner,
    conversationId: chat,
    assistantMessageId: assistant,
    format: 'docx',
    title: '   ',
    content: { blocks: [{ type: 'paragraph', text: '   ' }] },
  });
  expect(empty).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  expect(objects.size).toBe(before);
});

it('uses a requested file name once, with the correct extension', async () => {
  const { owner, chat, assistant } = await fixture();
  const outcome = await createDocumentFile({
    ownerId: owner,
    conversationId: chat,
    assistantMessageId: assistant,
    format: 'docx',
    title: 'Quarterly',
    filename: 'Quarterly-plan.docx',
    content: { blocks: [{ type: 'paragraph', text: 'Plan.' }] },
  });
  expect(outcome.ok).toBe(true);
  expect((outcome.data as { filename: string }).filename).toBe('Quarterly-plan.docx');
});

it('creates a new Word revision, keeps the source unchanged, and reports structure as preserved', async () => {
  const { owner, chat, assistant } = await fixture();
  const sourceBytes = await buildDocx(contract);
  const source = await sourceFile(
    owner,
    chat,
    'contract.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sourceBytes,
  );
  const sourceKey = String((await fileRow(source)).object_key);
  const sourceBefore = Buffer.from(objects.get(sourceKey)!);
  vi.mocked(completeOpenRouterJson).mockResolvedValueOnce({
    costUsd: '0.002',
    text: JSON.stringify({
      blocks: [
        { type: 'heading', level: 1, text: 'Synthetic contract' },
        { type: 'heading', level: 1, text: 'Scope' },
        { type: 'paragraph', text: 'Price: 1200 EUR for synthetic work.' },
        { type: 'list', ordered: false, items: ['Delivery in 30 days'] },
        { type: 'table', header: ['Item', 'Amount'], rows: [['Design', '1200']] },
      ],
    }),
  });

  const outcome = await editDocumentFile({
    ownerId: owner,
    conversationId: chat,
    assistantMessageId: assistant,
    sourceFileId: source,
    instructions: 'Change the price to 1200',
    apiKey: 'synthetic',
  });

  expect(outcome.ok).toBe(true);
  const data = outcome.data as { file_id: string; fidelity: string; cost_usd: string };
  expect(data).toMatchObject({ fidelity: 'structure_preserved', cost_usd: '0.002' });
  expect(data.file_id).not.toBe(source);
  const revised = await fileRow(data.file_id);
  expect(revised.derived_from_file_id).toBe(source);
  const revisedStructure = readDocxStructureBytes(objects.get(String(revised.object_key))!);
  expect(JSON.stringify(revisedStructure.blocks)).toContain('1200');
  expect(objects.get(sourceKey)!.equals(sourceBefore)).toBe(true);
  expect((await fileRow(source)).sha256).toBe('0000');
  expect(await derivedCount(source)).toBe(1);
});

it('marks a regenerated PDF revision as best effort and never saves an invalid model answer', async () => {
  const { owner, chat, assistant } = await fixture();
  const source = await sourceFile(
    owner,
    chat,
    'notes.pdf',
    'application/pdf',
    await buildPdf({ blocks: [{ type: 'paragraph', text: 'Original notes about budget.' }] }),
  );
  vi.mocked(completeOpenRouterJson).mockResolvedValueOnce({
    costUsd: null,
    text: JSON.stringify({ blocks: [{ type: 'paragraph', text: 'Revised budget notes.' }] }),
  });
  const pdfOutcome = await editDocumentFile({
    ownerId: owner,
    conversationId: chat,
    assistantMessageId: assistant,
    sourceFileId: source,
    instructions: 'Revise the budget wording',
    apiKey: 'synthetic',
  });
  expect(pdfOutcome.ok).toBe(true);
  const pdfData = pdfOutcome.data as { fidelity: string; notes: string[]; mime: string };
  expect(pdfData.fidelity).toBe('best_effort');
  expect(pdfData.notes.join(' ')).toContain('regenerated');

  vi.mocked(completeOpenRouterJson).mockResolvedValueOnce({ costUsd: null, text: 'not json' });
  const before = await derivedCount(source);
  const broken = await editDocumentFile({
    ownerId: owner,
    conversationId: chat,
    assistantMessageId: assistant,
    sourceFileId: source,
    instructions: 'Anything',
    apiKey: 'synthetic',
  });
  expect(broken).toMatchObject({ ok: false, error: { code: 'PROVIDER_ERROR' } });
  expect(await derivedCount(source)).toBe(before);
});

it('refuses unavailable, foreign, legacy, and keyless document edits with clear codes', async () => {
  const { owner, chat, assistant } = await fixture();
  const other = await fixture();
  const processing = await sourceFile(
    owner,
    chat,
    'slow.pdf',
    'application/pdf',
    new Uint8Array([1]),
    'processing',
  );
  const legacy = await sourceFile(owner, chat, 'old.doc', 'application/msword', new Uint8Array([2]));
  const docx = await sourceFile(
    owner,
    chat,
    'ok.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    await buildDocx(contract),
  );
  const run = (overrides: Partial<Parameters<typeof editDocumentFile>[0]>) =>
    editDocumentFile({
      ownerId: owner,
      conversationId: chat,
      assistantMessageId: assistant,
      sourceFileId: docx,
      instructions: 'Edit',
      apiKey: 'synthetic',
      ...overrides,
    });
  expect(await run({ sourceFileId: processing })).toMatchObject({
    error: { code: 'FILE_NOT_READY' },
  });
  expect(await run({ sourceFileId: legacy })).toMatchObject({
    error: { code: 'UNSUPPORTED_FILE' },
  });
  expect(await run({ apiKey: null })).toMatchObject({ error: { code: 'KEY_MISSING' } });
  expect(await run({ ownerId: other.owner })).toMatchObject({ error: { code: 'NOT_FOUND' } });
});

it('edits a photo into a new image while the original remains', async () => {
  const sharp = (await import('sharp')).default;
  const { owner, chat, assistant } = await fixture();
  const png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#2266cc' },
  })
    .png()
    .toBuffer();
  const source = await sourceFile(owner, chat, 'photo.png', 'image/png', png);
  const sourceKey = String((await fileRow(source)).object_key);
  const newPng = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  vi.mocked(editOpenRouterImage).mockResolvedValueOnce({
    bytes: new Uint8Array(newPng),
    mime: 'image/png',
    costUsd: '0.03',
  });
  const outcome = await editImageFile({
    ownerId: owner,
    conversationId: chat,
    assistantMessageId: assistant,
    sourceFileId: source,
    prompt: 'Make it white',
    apiKey: 'synthetic',
  });
  expect(outcome.ok).toBe(true);
  const data = outcome.data as { file_id: string; cost_usd: string; mime: string };
  expect(data).toMatchObject({ mime: 'image/png', cost_usd: '0.03' });
  expect((await fileRow(data.file_id)).derived_from_file_id).toBe(source);
  expect(objects.get(sourceKey)!.equals(png)).toBe(true);
});

it('refuses animated GIF edits before any provider call', async () => {
  const { owner, chat, assistant } = await fixture();
  vi.mocked(editOpenRouterImage).mockClear();
  const gif = await sourceFile(owner, chat, 'anim.gif', 'image/gif', new Uint8Array([0x47, 0x49]));
  const outcome = await editImageFile({
    ownerId: owner,
    conversationId: chat,
    assistantMessageId: assistant,
    sourceFileId: gif,
    prompt: 'Brighten',
    apiKey: 'synthetic',
  });
  expect(outcome).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_FILE' } });
  expect(editOpenRouterImage).not.toHaveBeenCalled();
});

it('fails closed when object storage is not configured and stores no file', async () => {
  const { owner, chat, assistant } = await fixture();
  const { storageConfigured: configured } = await import('@ai-chat/integrations');
  vi.mocked(configured).mockReturnValueOnce(false);
  const before = objects.size;
  const outcome = await createDocumentFile({
    ownerId: owner,
    conversationId: chat,
    assistantMessageId: assistant,
    format: 'pdf',
    title: 'Offline',
    content: { blocks: [{ type: 'paragraph', text: 'Text' }] },
  });
  expect(outcome).toMatchObject({ ok: false, error: { code: 'TOOL_NOT_CONFIGURED' } });
  expect(objects.size).toBe(before);
});
