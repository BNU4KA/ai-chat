import { randomBytes, randomUUID } from 'node:crypto';
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
} from '@ai-chat/database';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { executeRun } from './execute.ts';
import { scriptedModel } from './scripted.ts';
import type { AgentDeps, ModelAdapter, ToolOutcome } from './types.ts';

beforeAll(async () => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/ai_chat';
  process.env.ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64url')}`;
  await migrate();
});

afterAll(async () => {
  await closePool();
});

const key = 'sk-or-test-key-5678';

async function run(
  model: ModelAdapter,
  ports: AgentDeps['ports'],
) {
  const owner = randomUUID();
  await ensureProfile(owner, { displayName: 'Files', avatarUrl: null, timezone: 'UTC' });
  const ring = loadKeyring(process.env.ENCRYPTION_KEYS);
  await saveOpenRouter(owner, 0, { ...seal(ring, key, credentialAad(owner, 'openrouter', 1)), lastFour: '5678' });
  const chat = await createConversation(owner, { modelId: 'openai/gpt-test', enabledTools: [] });
  const created = await createMessageRun(owner, chat.id, randomUUID(), {
    clientMessageId: randomUUID(),
    text: 'Make a document',
    fileIds: [],
  });
  await executeRun(created.body.run.id, {
    now: () => new Date(),
    model,
    ports,
    loadKey: async () => ({ version: 1, apiKey: key }),
  });
  return getSnapshot(owner, created.body.run.id);
}

const document = {
  format: 'docx',
  title: 'Synthetic report',
  content: { blocks: [{ type: 'paragraph', text: 'Synthetic body.' }] },
};

it('dispatches create_document to its port without an approval step', async () => {
  let received: unknown;
  let offered: string[] = [];
  const script = scriptedModel([
    { calls: [{ name: 'create_document', arguments: document }] },
    { text: 'Created' },
  ]);
  const captured: ModelAdapter = {
    complete: async (request) => {
      offered = request.tools.map((tool) => tool.name);
      return script.complete(request);
    },
  };
  const outcome: ToolOutcome = {
    ok: true,
    data: { file_id: randomUUID(), filename: 'Synthetic-report.docx', format: 'docx' },
  };
  const snapshot = await run(captured, {
    createDocument: async (input) => {
      received = input;
      return outcome;
    },
    editDocument: async () => ({ ok: false }),
    editImage: async () => ({ ok: false }),
  });
  expect(offered).toContain('create_document');
  expect(offered).toContain('edit_document');
  expect(offered).toContain('edit_image');
  expect(received).toMatchObject({ format: 'docx', title: 'Synthetic report' });
  expect(snapshot.tool_calls).toHaveLength(1);
  expect(snapshot.tool_calls[0]).toMatchObject({ name: 'create_document', status: 'succeeded' });
  expect(snapshot.approvals).toHaveLength(0);
});

it('does not offer or execute file tools when their ports are absent', async () => {
  let offered: string[] = ['sentinel'];
  const script = scriptedModel([
    { calls: [{ name: 'create_document', arguments: document }] },
    { text: 'Could not create it' },
  ]);
  const model: ModelAdapter = {
    complete: async (request) => {
      offered = request.tools.map((tool) => tool.name);
      return script.complete(request);
    },
  };
  const snapshot = await run(model, {});
  expect(offered).not.toContain('create_document');
  expect(offered).not.toContain('edit_image');
  expect(snapshot.tool_calls[0]).toMatchObject({ name: 'create_document', status: 'failed' });
  expect(JSON.stringify(snapshot.tool_calls[0]?.safe_result)).toContain('not enabled');
});

it('rejects malformed document arguments before the port runs', async () => {
  let calls = 0;
  const snapshot = await run(
    scriptedModel([
      {
        calls: [
          {
            name: 'create_document',
            arguments: { format: 'docx', title: 'T', content: { blocks: [] } },
          },
        ],
      },
    ]),
    {
      createDocument: async () => {
        calls += 1;
        return { ok: true };
      },
    },
  );
  expect(calls).toBe(0);
  expect(snapshot.tool_calls[0]).toMatchObject({ name: 'create_document', status: 'failed' });
});

it('passes the source file id for edit_document and edit_image', async () => {
  const source = randomUUID();
  const seen: Record<string, unknown> = {};
  const snapshot = await run(
    scriptedModel([
      { calls: [{ name: 'edit_document', arguments: { source_file_id: source, instructions: 'Change price' } }] },
      { calls: [{ name: 'edit_image', arguments: { source_file_id: source, prompt: 'Brighten' } }] },
      { text: 'Done' },
    ]),
    {
      editDocument: async (input) => {
        seen.document = input;
        return { ok: true, data: { file_id: randomUUID(), fidelity: 'best_effort' } };
      },
      editImage: async (input) => {
        seen.image = input;
        return { ok: true, data: { file_id: randomUUID() } };
      },
    },
  );
  expect(seen.document).toMatchObject({ sourceFileId: source, instructions: 'Change price' });
  expect(seen.image).toMatchObject({ sourceFileId: source, prompt: 'Brighten' });
  expect(snapshot.tool_calls.map((tool) => tool.status)).toEqual(['succeeded', 'succeeded']);
  expect(snapshot.run.status).toBe('completed');
});
