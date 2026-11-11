import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
  closePool,
  createConversation,
  createMessageRun,
  credentialAad,
  deleteFile,
  deleteOpenRouter,
  ensureProfile,
  finalizeFile,
  getOpenRouter,
  getSnapshot,
  loadKeyring,
  migrate,
  ownedFile,
  reserveFile,
  saveOpenRouter,
  seal,
  withWorker,
} from '@ai-chat/database';
import { executeRun } from '@ai-chat/agent-runtime';
import { scriptedModel } from '../../agent-runtime/src/scripted.ts';
import { connectGoogle, finishGoogle } from './google.ts';
import { maintainTasks } from './maintenance.ts';

beforeAll(async () => {
  process.env.ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64url')}`;
  await migrate();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await closePool();
});

async function fixture(tools: ('web' | 'files' | 'gmail' | 'calendar')[] = []) {
  const owner = randomUUID();
  await ensureProfile(owner, {
    displayName: 'Synthetic lifecycle test',
    avatarUrl: null,
    timezone: 'UTC',
  });
  const key = (version: number) => ({
    ...seal(
      loadKeyring(process.env.ENCRYPTION_KEYS),
      'synthetic-openrouter-key',
      credentialAad(owner, 'openrouter', version),
    ),
    lastFour: '-key',
  });
  await saveOpenRouter(owner, 0, key(1));
  const chat = await createConversation(owner, { modelId: 'synthetic/model', enabledTools: tools });
  return { owner, chat, key };
}
async function waitingRun(owner: string, chat: string) {
  const created = await createMessageRun(owner, chat, randomUUID(), {
    clientMessageId: randomUUID(),
    text: 'Prepare a synthetic email',
    fileIds: [],
  });
  await executeRun(created.body.run.id, {
    now: () => new Date(),
    loadKey: async () => ({ version: 1, apiKey: 'synthetic' }),
    ports: {},
    model: scriptedModel([
      {
        calls: [
          {
            name: 'send_mail',
            arguments: {
              to: [{ address: 'synthetic@example.com' }],
              subject: 'Synthetic',
              body_text: 'Test',
            },
          },
        ],
      },
    ]),
  });
  expect((await getSnapshot(owner, created.body.run.id)).run.status).toBe('waiting_approval');
  return created.body.run.id;
}

it('keeps key revisions monotonic across deletion and rejects stale replacement', async () => {
  const { owner, key } = await fixture();
  await deleteOpenRouter(owner, 1);
  expect(await getOpenRouter(owner)).toMatchObject({ configured: false, credential_version: 2 });
  await expect(saveOpenRouter(owner, 0, key(1))).rejects.toMatchObject({
    code: 'VERSION_CONFLICT',
  });
  await saveOpenRouter(owner, 2, key(3));
  expect(await getOpenRouter(owner)).toMatchObject({ configured: true, credential_version: 3 });
});

it('isolates private uploads, finalizes once, and cancels a waiting approval on deletion', async () => {
  const { owner, chat } = await fixture(['gmail']);
  const other = await fixture();
  const file = await reserveFile(owner, {
    conversation_id: chat.id,
    filename: 'synthetic.txt',
    byte_size: 4,
    declared_mime: 'text/plain',
  });
  await expect(ownedFile(other.owner, String(file.id))).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  await finalizeFile(owner, String(file.id));
  await finalizeFile(owner, String(file.id));
  const jobs = await withWorker(
    async (tx) =>
      (await tx.query("select id from outbox where owner_id=$1 and topic='file.process'", [owner]))
        .rows,
  );
  expect(jobs).toHaveLength(1);
  const run = await waitingRun(owner, chat.id);
  await deleteFile(owner, String(file.id), 2);
  const snapshot = await getSnapshot(owner, run);
  expect(snapshot.run).toMatchObject({ status: 'queued' });
  expect(snapshot.approvals[0]).toMatchObject({ status: 'cancelled' });
  await expect(ownedFile(owner, String(file.id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await executeRun(run, {
    now: () => new Date(),
    loadKey: async () => ({ version: 1, apiKey: 'synthetic' }),
    ports: {},
    model: scriptedModel([]),
  });
  expect((await getSnapshot(owner, run)).run.status).toBe('cancelled');
});

it('expires an unconsumed proposal without executing its write', async () => {
  const { owner, chat } = await fixture(['gmail']);
  const run = await waitingRun(owner, chat.id);
  await withWorker(async (tx) => {
    await tx.query("update approvals set expires_at=now()-interval '1 minute' where run_id=$1", [
      run,
    ]);
  });
  await maintainTasks();
  const snapshot = await getSnapshot(owner, run);
  expect(snapshot.run).toMatchObject({ status: 'failed', error_code: 'APPROVAL_EXPIRED' });
  expect(snapshot.approvals[0]).toMatchObject({ status: 'expired' });
});

it('consumes denied OAuth state once without requesting provider tokens', async () => {
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'synthetic-client');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'synthetic-secret');
  vi.stubEnv('GOOGLE_OAUTH_REDIRECT_URL', 'http://localhost:3001/integrations/google/callback');
  const { owner } = await fixture();
  const request = await connectGoogle(owner, 'gmail', 'web');
  const url = new URL(request.authorization_url);
  const state = url.searchParams.get('state')!;
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('scope')).not.toContain('calendar');
  expect(await finishGoogle(state, undefined, 'access_denied')).toEqual({
    target: 'web',
    ok: false,
  });
  await expect(finishGoogle(state, 'synthetic-code')).rejects.toMatchObject({
    code: 'INVALID_REQUEST',
  });
});
