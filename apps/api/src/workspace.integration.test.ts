import { fetchModelCatalog } from '@ai-chat/integrations';
import { approvalFields, revisedArguments } from '@ai-chat/contracts';
import type * as IntegrationModule from '@ai-chat/integrations';
import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { buildServer } from './server.ts';
import {
  ensureProfile,
  migrate,
  closePool,
  withOwner,
  withWorker,
  createConversation,
  updateConversation,
  createMessageRun,
  getSnapshot,
  saveOpenRouter,
  seal,
  loadKeyring,
  credentialAad,
  decideApproval,
  saveProject,
  saveDocument,
  editDocumentRange,
  compactConversation,
  shareProjectFile,
  searchMessages,
  branchConversation,
  getConversation,
  deleteConversation,
  removeProject,
  removeDocument,
} from '@ai-chat/database';
import { executeRun, scriptedModel, type ModelAdapter } from '@ai-chat/agent-runtime';
import {
  filePorts,
  workspaceMessages,
  maintainSchedules,
  saveSchedule,
  pauseSchedule,
  purgeAccount,
  projectDocumentPorts,
  deleteSchedule,
} from '@ai-chat/services';
vi.mock('@ai-chat/integrations', async (original) => {
  const actual = await original<typeof IntegrationModule>();
  return {
    ...actual,
    deleteAuthUser: vi.fn(async () => undefined),
    removeStoredObjects: vi.fn(async () => undefined),
    fetchModelCatalog: vi.fn(async () => [
      {
        id: 'synthetic/model',
        name: 'Synthetic model',
        context_length: 100000,
        supports_tools: true,
        supports_images: true,
        max_output_tokens: 4096,
        input_price_per_million_usd: '1',
        output_price_per_million_usd: '2',
        supported_parameters: ['tools'],
        catalog_fetched_at: new Date().toISOString(),
        catalog_stale: false,
      },
    ]),
    getGoogleEvent: vi.fn(async () => ({
      id: 'synthetic-event',
      etag: 'synthetic-etag',
      summary: 'Original title',
      start: { dateTime: '2026-11-12T09:00:00Z', timeZone: 'UTC' },
      end: { dateTime: '2026-11-12T10:00:00Z', timeZone: 'UTC' },
      attendees: [{ email: 'guest@example.com' }],
      description: 'Preserve description',
    })),
    googleFreeBusy: vi.fn(async () => ({
      busy: [{ start: '2026-11-12T10:00:00Z', end: '2026-11-12T11:00:00Z' }],
      timezone: 'UTC',
    })),
  };
});
const owner = randomUUID(),
  other = randomUUID(),
  apiKey = 'synthetic-key-1234';
let token: string, otherToken: string;
const app = buildServer();
async function headers(who = token) {
  return { authorization: `Bearer ${who}` };
}
async function request(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  version?: number,
  who = token,
) {
  return app.inject({
    method,
    url,
    headers: {
      'content-type': 'application/json',
      ...(await headers(who)),
      ...(version ? { 'if-match': `"${version}"` } : {}),
    },
    ...(payload !== undefined ? { payload: JSON.stringify(payload) } : {}),
  });
}
async function chat(tools: ('web' | 'files' | 'gmail' | 'calendar')[] = []) {
  return createConversation(owner, { modelId: 'synthetic/model', enabledTools: tools });
}
async function run(chatId: string, text = 'Synthetic request', meta: Record<string, unknown> = {}) {
  return createMessageRun(owner, chatId, randomUUID(), {
    clientMessageId: randomUUID(),
    text,
    fileIds: [],
    contextLength: 100000,
    ...meta,
  });
}
const loadKey = async () => ({ version: 1, apiKey });
beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgres://postgres:synthetic-local-only@localhost:54329/ai_chat';
  process.env.AI_CHAT_TEST_JWT_SECRET = 'synthetic-workspace-secret';
  process.env.ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64url')}`;
  await migrate();
  for (const id of [owner, other])
    await ensureProfile(id, { displayName: 'Synthetic user', avatarUrl: null, timezone: 'UTC' });
  const ring = loadKeyring(process.env.ENCRYPTION_KEYS);
  await saveOpenRouter(owner, 0, {
    ...seal(ring, apiKey, credentialAad(owner, 'openrouter', 1)),
    lastFour: '1234',
  });
  const sign = async (id: string) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(id)
      .setIssuer('http://localhost/auth/v1')
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.AI_CHAT_TEST_JWT_SECRET));
  token = await sign(owner);
  otherToken = await sign(other);
});
beforeEach(async () => {
  await withOwner(owner, (tx) => tx.query('delete from rate_limits where owner_id=$1', [owner]));
});
afterAll(async () => {
  await app.close();
  await closePool();
});
it('isolates project memory and rejects cross-owner linking/stale edits', async () => {
  const created = await request('POST', '/v1/projects', {
    name: 'Career',
    memory: 'Use concise explanations',
  });
  expect(created.statusCode).toBe(201);
  const project = created.json().data;
  expect(
    (await request('GET', '/v1/projects', undefined, undefined, otherToken)).json().data,
  ).toEqual([]);
  expect(
    (await request('PATCH', `/v1/projects/${project.id}`, { name: 'Updated', memory: 'New' }, 1))
      .statusCode,
  ).toBe(200);
  expect(
    (await request('PATCH', `/v1/projects/${project.id}`, { name: 'Stale', memory: '' }, 1))
      .statusCode,
  ).toBe(409);
  const foreign = await createConversation(other, { modelId: 'synthetic/model', enabledTools: [] });
  await expect(
    updateConversation(other, foreign.id, 1, { projectId: project.id }),
  ).rejects.toMatchObject({ status: 404 });
  const c = await chat();
  await updateConversation(owner, c.id, 1, { projectId: project.id });
  const prepared = await workspaceMessages()(
    owner,
    c.id,
    [
      { role: 'system', content: 'Policy' },
      { role: 'user', content: 'Hello' },
    ],
    new AbortController().signal,
  );
  expect(JSON.stringify(prepared)).toContain('New');
  expect(JSON.stringify(prepared)).toContain('untrusted');
});
it('versions documents, applies exact selections and exports escaped private content', async () => {
  const d = await saveDocument(owner, {
    title: 'Plan',
    content: 'Before <script>alert(1)</script> after',
    project_id: null,
  });
  const id = String(d.id);
  const revised = await editDocumentRange(owner, id, 1, {
    start: 0,
    end: 6,
    expected: 'Before',
    replacement: 'Updated',
  });
  expect(revised.content).toContain('Updated <script>');
  await expect(
    editDocumentRange(owner, id, 1, { start: 0, end: 6, expected: 'Before', replacement: 'x' }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    editDocumentRange(owner, id, 2, { start: 0, end: 7, expected: 'wrong', replacement: 'x' }),
  ).rejects.toMatchObject({ status: 409 });
  const versions = await request('GET', `/v1/documents/${id}/revisions`);
  expect(versions.json().data.map((v: { version: number }) => v.version)).toEqual([2, 1]);
  const exported = await request('GET', `/v1/documents/${id}/export?format=html`);
  expect(exported.body).toContain('&lt;script&gt;');
  expect(exported.body).not.toContain('<script>');
  expect(
    (await request('GET', `/v1/documents/${id}/export`, undefined, undefined, otherToken))
      .statusCode,
  ).toBe(404);
});
it('shares only explicitly selected ready files and revokes future project reads', async () => {
  const p = await saveProject(owner, { name: 'Files', memory: '' }),
    a = await chat(),
    b = await chat();
  await updateConversation(owner, b.id, 1, { projectId: String(p.id) });
  const file = randomUUID();
  await withOwner(owner, async (tx) => {
    await tx.query(
      "insert into files(id,owner_id,conversation_id,object_key,original_name,detected_mime,byte_size,status) values($1,$2,$3,'synthetic/private','manual.pdf','application/pdf',1,'ready')",
      [file, owner, a.id],
    );
    await tx.query(
      "insert into document_chunks(owner_id,file_id,ordinal,text,page) values($1,$2,1,'Synthetic document evidence',7)",
      [owner, file],
    );
  });
  const ports = filePorts(owner, b.id);
  expect((await ports.listFiles!(b.id, owner)).data).toEqual([]);
  await shareProjectFile(owner, String(p.id), file);
  expect(
    (await ports.readFile!({ ownerId: owner, conversationId: b.id, fileId: file })).sources?.[0]
      ?.page,
  ).toBe(7);
  await expect(shareProjectFile(other, String(p.id), file)).rejects.toMatchObject({ status: 404 });
  await shareProjectFile(owner, String(p.id), file, true);
  await expect(
    ports.readFile!({ ownerId: owner, conversationId: b.id, fileId: file }),
  ).rejects.toMatchObject({ status: 404 });
  await shareProjectFile(owner, String(p.id), file);
  await deleteConversation(owner, a.id);
  expect((await ports.listFiles!(b.id, owner)).data).toEqual([]);
});
it('searches private message text, opens older hits and branches without modifying originals', async () => {
  const c = await chat(),
    r = await run(c.id, 'Find the ultraviolet milestone');
  await executeRun(r.body.run.id, {
    now: () => new Date(),
    model: scriptedModel([{ text: 'A private answer' }]),
    ports: {},
    loadKey,
  });
  const hits = await searchMessages(owner, 'ultraviolet', 0);
  expect(hits.some((h) => h.id === r.body.message.id)).toBe(true);
  expect(await searchMessages(other, 'ultraviolet', 0)).toEqual([]);
  expect(
    (await request('GET', `/v1/messages/${r.body.message.id}/context`)).json().data[0].content,
  ).toContain('ultraviolet');
  const branch = await branchConversation(owner, r.body.message.id, 'Edited prompt');
  expect(branch.draft).toBe('Edited prompt');
  expect(branch.attachments_copied).toBe(false);
  expect((await getConversation(owner, c.id)).title).toContain('ultraviolet');
  expect(
    (await request('GET', `/v1/conversations/${branch.conversation_id}/messages`)).json().data,
  ).toEqual([]);
  expect(
    (
      await request(
        'POST',
        `/v1/messages/${r.body.message.id}/branch`,
        { text: 'Steal' },
        undefined,
        otherToken,
      )
    ).statusCode,
  ).toBe(404);
});
it('uses only the reviewed note and uncovered turns while preserving full history', async () => {
  const c = await chat(),
    a = await run(c.id, 'Old long background');
  await executeRun(a.body.run.id, {
    now: () => new Date(),
    model: scriptedModel([{ text: 'Old answer' }]),
    ports: {},
    loadKey,
  });
  const b = await run(c.id, 'Latest full question');
  await executeRun(b.body.run.id, {
    now: () => new Date(),
    model: scriptedModel([{ text: 'Latest answer' }]),
    ports: {},
    loadKey,
  });
  await compactConversation(owner, c.id, 1, 'Reviewed decision: use plan B', '2');
  const next = await run(c.id, 'Continue');
  let observed = '';
  const model: ModelAdapter = {
    complete: async (req) => {
      observed = JSON.stringify(req.messages);
      return {
        text: 'Continued',
        toolCalls: [],
        usage: { input_tokens: 10, output_tokens: 2, cost_usd: null, cost_status: 'unknown' },
        generationId: 'synthetic',
        submitted: true,
      };
    },
  };
  await executeRun(next.body.run.id, { now: () => new Date(), model, ports: {}, loadKey });
  expect(observed).toContain('Reviewed decision');
  expect(observed).not.toContain('Old long background');
  expect(observed).toContain('Latest full question');
  expect((await request('GET', `/v1/conversations/${c.id}/messages`)).json().data).toHaveLength(6);
});
it('blocks capped requests before any model submission and checks every tool-loop call', async () => {
  const c = await chat();
  await updateConversation(owner, c.id, 1, { budgetUsd: '0.000000001' });
  const r = await run(c.id, 'Too expensive', { inputPrice: '1', outputPrice: '2' }),
    complete = vi.fn();
  await executeRun(r.body.run.id, {
    now: () => new Date(),
    model: { complete },
    ports: {},
    loadKey,
  });
  expect(complete).not.toHaveBeenCalled();
  expect((await getSnapshot(owner, r.body.run.id)).run.error_code).toBe('BUDGET_EXCEEDED');
  const u = await chat();
  await updateConversation(owner, u.id, 1, { budgetUsd: '1' });
  const unknown = await run(u.id);
  await executeRun(unknown.body.run.id, {
    now: () => new Date(),
    model: { complete },
    ports: {},
    loadKey,
  });
  expect((await getSnapshot(owner, unknown.body.run.id)).run.error_code).toBe(
    'BUDGET_PRICE_UNKNOWN',
  );
  const t = await chat(['web']);
  await updateConversation(owner, t.id, 1, { budgetUsd: '0.01' });
  const loop = await run(t.id, 'Research', { inputPrice: '0', outputPrice: '2' });
  let calls = 0;
  const model = scriptedModel([
    {
      calls: [{ name: 'search_web', arguments: { query: 'Synthetic' } }],
    },
    { text: 'Should be blocked' },
  ]);
  await executeRun(loop.body.run.id, {
    now: () => new Date(),
    model: {
      complete: (req) => {
        calls++;
        return model.complete(req);
      },
    },
    ports: { searchWeb: async () => ({ ok: true, data: 'Synthetic evidence' }) },
    loadKey,
  });
  expect(calls).toBe(1);
  expect((await getSnapshot(owner, loop.body.run.id)).run.error_code).toBe('BUDGET_EXCEEDED');
});
it('revises a pending action, invalidates the old approval and executes only revised arguments once', async () => {
  const c = await chat(['gmail']);
  const grant = await withOwner(owner, async (tx) => {
    const existing = (await tx.query("select * from integrations where provider='google'")).rows[0];
    if (existing) return existing;
    return (
      await tx.query(
        "insert into integrations(owner_id,provider,google_subject,account_email,capabilities,status) values($1,'google','synthetic-subject','synthetic@example.com','{\"gmail\":true,\"calendar\":true}','connected') returning *",
        [owner],
      )
    ).rows[0]!;
  });
  const ring = loadKeyring(process.env.ENCRYPTION_KEYS),
    sealed = seal(
      ring,
      JSON.stringify({
        access_token: 'synthetic-google-token',
        refresh_token: 'synthetic-refresh',
        expires_at: Date.now() + 3600000,
      }),
      credentialAad(owner, 'google', 1),
    );
  await withOwner(owner, (tx) =>
    tx.query(
      "insert into encrypted_credentials(owner_id,provider,integration_id,credential_version,ciphertext,nonce,auth_tag,encryption_key_version) values($1,'google',$2,1,$3,$4,$5,$6) on conflict do nothing",
      [
        owner,
        grant.id,
        sealed.ciphertext,
        sealed.nonce,
        sealed.authTag,
        sealed.encryptionKeyVersion,
      ],
    ),
  );
  const r = await run(c.id, 'Send a synthetic test proposal', {
    googleSubject: 'synthetic-subject',
    googleIntegrationId: grant.id,
  });
  const old = {
      to: [{ address: 'synthetic-recipient@example.com' }],
      subject: 'Old',
      body_text: 'Old body',
    },
    newArgs = { ...old, subject: 'Revised', body_text: 'Reviewed body' };
  const sent: unknown[] = [];
  const deps = {
    now: () => new Date(),
    model: scriptedModel([{ calls: [{ name: 'send_mail', arguments: old }] }, { text: 'Done' }]),
    ports: {
      sendMail: async (args: unknown) => {
        sent.push(args);
        return { ok: true };
      },
    },
    loadKey,
    authorizeTool: async () => String(grant.id),
  };
  await executeRun(r.body.run.id, deps);
  const a = (await getSnapshot(owner, r.body.run.id)).approvals[0]!;
  // API preparation checks the actual synthetic grant while the run waits for approval.
  const revised = await request('POST', `/v1/approvals/${a.id}/revise`, {
    args_hash: a.args_hash,
    arguments: newArgs,
  });
  expect(revised.statusCode).toBe(200);
  await expect(decideApproval(owner, a.id, 'approve', a.args_hash)).rejects.toMatchObject({
    status: 409,
  });
  const updated = (await getSnapshot(owner, r.body.run.id)).approvals.find(
    (p) => p.status === 'pending',
  )!;
  const decisions = await Promise.allSettled([
    decideApproval(owner, updated.id, 'approve', updated.args_hash),
    decideApproval(owner, updated.id, 'approve', updated.args_hash),
  ]);
  expect(decisions.every((d) => d.status === 'fulfilled')).toBe(true);
  await executeRun(r.body.run.id, deps);
  await executeRun(r.body.run.id, deps);
  expect(sent).toEqual([newArgs]);
});
it('durably deduplicates scheduled occurrences, pauses future dispatch and publishes result notices', async () => {
  const s = await saveSchedule(owner, {
    title: 'Daily synthetic',
    prompt: 'Prepare a synthetic daily plan',
    model_id: 'synthetic/model',
    enabled_tools: [],
    project_id: null,
    timezone: 'UTC',
    local_time: '09:00',
    weekday: null,
    budget_usd: '0.1',
  });
  await withWorker((tx) =>
    tx.query("update schedules set next_at=now()-interval '1 minute' where id=$1", [s.id]),
  );
  await Promise.all([maintainSchedules(), maintainSchedules()]);
  const occurrences = await withOwner(
    owner,
    async (tx) =>
      (await tx.query('select * from schedule_occurrences where schedule_id=$1', [s.id])).rows,
  );
  expect(occurrences).toHaveLength(1);
  const occurrence = occurrences[0]!;
  expect(occurrence.run_id).toBeTruthy();
  expect(
    (
      await withOwner(owner, (tx) =>
        tx.query('select id from runs where conversation_id=$1', [occurrence.conversation_id]),
      )
    ).rowCount,
  ).toBe(1);
  await executeRun(String(occurrence.run_id), {
    now: () => new Date(),
    model: scriptedModel([{ text: 'Scheduled synthetic result' }]),
    ports: {},
    loadKey,
  });
  await maintainSchedules();
  expect(
    (await request('GET', '/v1/notices'))
      .json()
      .data.some((n: { title: string }) => n.title === 'Daily synthetic: completed'),
  ).toBe(true);
  const current = (await request('GET', '/v1/schedules'))
    .json()
    .data.find((v: { id: string }) => v.id === s.id);
  await pauseSchedule(owner, String(s.id), current.version, true);
  await withWorker((tx) =>
    tx.query("update schedules set next_at=now()-interval '1 minute' where id=$1", [s.id]),
  );
  await maintainSchedules();
  expect(
    (
      await withOwner(owner, (tx) =>
        tx.query('select id from schedule_occurrences where schedule_id=$1', [s.id]),
      )
    ).rowCount,
  ).toBe(1);
});
it('finds meeting slots through current calendar consent without creating events', async () => {
  const response = await request('POST', '/v1/meetings/slots', {
    time_min: '2026-11-12T09:00:00Z',
    time_max: '2026-11-12T13:00:00Z',
    timezone: 'UTC',
    duration_minutes: 30,
    buffer_minutes: 15,
    work_start: 9,
    work_end: 18,
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().data.attendee_availability).toBe('not_checked');
  expect(
    response
      .json()
      .data.slots.every(
        (s: { start: string; end: string }) =>
          Date.parse(s.end) <= Date.parse('2026-11-12T09:45:00Z') ||
          Date.parse(s.start) >= Date.parse('2026-11-12T11:15:00Z'),
      ),
  ).toBe(true);
  expect(
    (
      await request(
        'POST',
        '/v1/meetings/slots',
        { time_min: '2026-11-12T09:00:00Z', time_max: '2026-11-12T13:00:00Z', timezone: 'UTC' },
        undefined,
        otherToken,
      )
    ).statusCode,
  ).toBe(422);
});

it('sums confirmed model usage across tool steps without inventing a total after unknown usage', async () => {
  const c = await chat(['web']),
    r = await run(c.id);
  let count = 0;
  const model: ModelAdapter = {
    complete: async (_req) => {
      count++;
      return {
        text: count === 1 ? '' : 'Final',
        toolCalls:
          count === 1
            ? [{ id: 'cost-call', name: 'search_web', arguments: '{"query":"Synthetic"}' }]
            : [],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cost_usd: count === 1 ? '0.1' : '0.2',
          cost_status: 'confirmed',
        },
        generationId: null,
        submitted: true,
      };
    },
  };
  await executeRun(r.body.run.id, {
    now: () => new Date(),
    model,
    ports: { searchWeb: async () => ({ ok: true, data: 'Synthetic' }) },
    loadKey,
  });
  expect((await getSnapshot(owner, r.body.run.id)).run.usage).toMatchObject({
    input_tokens: 20,
    output_tokens: 10,
    cost_usd: '0.3',
    cost_status: 'confirmed',
  });
  const u = await chat(['web']),
    unknown = await run(u.id);
  count = 0;
  await executeRun(unknown.body.run.id, {
    now: () => new Date(),
    model: {
      complete: async (req) => {
        const result = await model.complete(req);
        if (count === 1) result.usage = { ...result.usage, cost_usd: null, cost_status: 'unknown' };
        return result;
      },
    },
    ports: { searchWeb: async () => ({ ok: true, data: 'Synthetic' }) },
    loadKey,
  });
  expect((await getSnapshot(owner, unknown.body.run.id)).run.usage.cost_usd).toBeNull();
  expect((await getSnapshot(owner, unknown.body.run.id)).run.usage.cost_status).toBe('unknown');
});

it('recovers an occurrence created before a crash without requiring another model-catalog check', async () => {
  const s = await saveSchedule(owner, {
    title: 'Crash recovery',
    prompt: 'Synthetic recovery prompt',
    model_id: 'synthetic/model',
    enabled_tools: [],
    project_id: null,
    timezone: 'UTC',
    local_time: '10:00',
    weekday: null,
    budget_usd: '0.1',
  });
  await withWorker((tx) =>
    tx.query("update schedules set next_at=now()-interval '1 minute' where id=$1", [s.id]),
  );
  await maintainSchedules();
  const occurrence = (
    await withOwner(owner, (tx) =>
      tx.query('select * from schedule_occurrences where schedule_id=$1', [s.id]),
    )
  ).rows[0]!;
  await withWorker((tx) =>
    tx.query("update schedule_occurrences set status='pending',run_id=null where id=$1", [
      occurrence.id,
    ]),
  );
  await maintainSchedules();
  const recovered = (
    await withOwner(owner, (tx) =>
      tx.query('select * from schedule_occurrences where id=$1', [occurrence.id]),
    )
  ).rows[0]!;
  expect(recovered.run_id).toBe(occurrence.run_id);
  expect(
    (
      await withOwner(owner, (tx) =>
        tx.query('select id from runs where conversation_id=$1', [occurrence.conversation_id]),
      )
    ).rowCount,
  ).toBe(1);
  // Finish the safe synthetic run so the next test's concurrency budget remains independent.
  await executeRun(String(recovered.run_id), {
    now: () => new Date(),
    model: scriptedModel([{ text: 'Recovered' }]),
    ports: {},
    loadKey,
  });
});

it('research uses the chosen model and explicit project context while retaining real source references', async () => {
  const p = await saveProject(owner, {
    name: 'Research',
    memory: 'Prefer evidence over certainty.',
  });
  const c = await chat(['web']);
  await updateConversation(owner, c.id, 1, { projectId: String(p.id), researchMode: true });
  const r = await run(c.id, 'Compare synthetic options');
  let requestIndex = 0;
  const model: ModelAdapter = {
    complete: async (req) => {
      requestIndex++;
      expect(req.model).toBe('synthetic/model');
      expect(JSON.stringify(req.messages)).toContain('Prefer evidence');
      expect(JSON.stringify(req.messages)).toContain('Research mode:');
      if (requestIndex === 2) {
        expect(JSON.stringify(req.messages)).toContain('citation_id');
        expect(JSON.stringify(req.messages)).toContain('retrieved_at');
      }
      return {
        text: requestIndex === 1 ? '' : 'Supported result [S1].',
        toolCalls:
          requestIndex === 1
            ? [
                {
                  id: 'research-source',
                  name: 'search_web',
                  arguments: '{"query":"Synthetic evidence"}',
                },
              ]
            : [],
        usage: { input_tokens: 10, output_tokens: 4, cost_usd: null, cost_status: 'unknown' },
        generationId: 'synthetic',
        submitted: true,
      };
    },
  };
  await executeRun(r.body.run.id, {
    now: () => new Date(),
    model,
    ports: {
      searchWeb: async () => ({
        ok: true,
        data: 'Synthetic source text',
        sources: [
          {
            kind: 'web',
            title: 'Synthetic evidence',
            url: 'https://example.com/evidence',
            excerpt: 'An exact stored passage.',
          },
        ],
      }),
    },
    prepareMessages: workspaceMessages(),
    loadKey,
  });
  const snapshot = await getSnapshot(owner, r.body.run.id);
  expect(snapshot.sources[0]).toMatchObject({
    citation_id: 'S1',
    excerpt: 'An exact stored passage.',
  });
  expect(snapshot.sources[0]?.retrieved_at).toBeTruthy();
});

it('account cleanup removes projects, shared memberships, document revisions, schedules and notices', async () => {
  const cleanupOwner = randomUUID();
  await ensureProfile(cleanupOwner, {
    displayName: 'Synthetic cleanup',
    avatarUrl: null,
    timezone: 'UTC',
  });
  const p = await saveProject(cleanupOwner, { name: 'Cleanup', memory: 'Private memory' });
  await saveDocument(cleanupOwner, {
    title: 'Private document',
    content: 'Private content',
    project_id: String(p.id),
  });
  const c = await createConversation(cleanupOwner, {
      modelId: 'synthetic/model',
      enabledTools: [],
    }),
    file = randomUUID();
  await withOwner(cleanupOwner, async (tx) => {
    await tx.query(
      "insert into files(id,owner_id,conversation_id,object_key,original_name,byte_size,status,created_at) values($1,$2,$3,'synthetic/cleanup','test.txt',1,'ready',now()-interval '3 hours')",
      [file, cleanupOwner, c.id],
    );
    await tx.query('insert into project_files(owner_id,project_id,file_id) values($1,$2,$3)', [
      cleanupOwner,
      p.id,
      file,
    ]);
    await tx.query(
      "insert into schedules(owner_id,project_id,title,prompt,model_id,timezone,local_time,budget_usd,next_at) values($1,$2,'Cleanup','Synthetic','synthetic/model','UTC','09:00',0.1,now()+interval '1 day')",
      [cleanupOwner, p.id],
    );
    await tx.query("insert into notices(owner_id,title) values($1,'Synthetic private notice')", [
      cleanupOwner,
    ]);
    await tx.query('update profiles set deletion_requested_at=now() where id=$1', [cleanupOwner]);
  });
  await purgeAccount(cleanupOwner);
  await withWorker(async (tx) => {
    for (const table of [
      'projects',
      'project_files',
      'documents',
      'document_revisions',
      'schedules',
      'schedule_occurrences',
      'notices',
    ])
      expect(
        (await tx.query(`select 1 from ${table} where owner_id=$1`, [cleanupOwner])).rowCount,
      ).toBe(0);
    expect((await tx.query('select id from profiles where id=$1', [cleanupOwner])).rowCount).toBe(
      0,
    );
  });
});

async function scheduleOwner() {
  const id = randomUUID();
  await ensureProfile(id, {
    displayName: 'Synthetic schedule regression',
    avatarUrl: null,
    timezone: 'UTC',
  });
  await saveOpenRouter(id, 0, {
    ...seal(loadKeyring(process.env.ENCRYPTION_KEYS), apiKey, credentialAad(id, 'openrouter', 1)),
    lastFour: '1234',
  });
  return id;
}
async function insertSchedule(who: string, paused = false, due = true, timezone = 'UTC') {
  return withOwner(
    who,
    async (tx) =>
      (
        await tx.query(
          "insert into schedules(owner_id,title,prompt,model_id,enabled_tools,timezone,local_time,budget_usd,next_at,paused) values($1,'Synthetic regression','Synthetic prompt','synthetic/model','{}',$4,'09:00',1,now()+($2::int*interval '1 day'),$3) returning *",
          [who, due ? -1 : 1, paused, timezone],
        )
      ).rows[0]!,
  );
}
it('atomically refuses schedule creation after pause or deletion during metadata validation', async () => {
  for (const action of ['pause', 'delete'] as const) {
    const who = await scheduleOwner(),
      s = await insertSchedule(who);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      start = new Promise<void>((r) => (entered = r));
    const catalog = vi.mocked(fetchModelCatalog),
      original = catalog.getMockImplementation()!;
    catalog.mockImplementationOnce(async (key) => {
      entered();
      await gate;
      return original(key);
    });
    const work = maintainSchedules();
    await start;
    const current = (
      await withOwner(who, (tx) => tx.query('select version from schedules where id=$1', [s.id]))
    ).rows[0]!;
    try {
      if (action === 'pause') await pauseSchedule(who, String(s.id), Number(current.version), true);
      else await deleteSchedule(who, String(s.id), Number(current.version));
    } finally {
      release();
    }
    await work;
    expect(
      (await withOwner(who, (tx) => tx.query('select id from runs where owner_id=$1', [who])))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await withOwner(who, (tx) =>
          tx.query("select id from outbox where owner_id=$1 and topic='run.execute'", [who]),
        )
      ).rowCount,
    ).toBe(0);
  }
});
it('excludes paused pending occurrences before limiting a maintenance batch', async () => {
  const who = await scheduleOwner();
  for (let i = 0; i < 10; i++) {
    const s = await insertSchedule(who, true, false),
      c = await createConversation(who, { modelId: 'synthetic/model', enabledTools: [] });
    await withOwner(who, (tx) =>
      tx.query(
        "insert into schedule_occurrences(owner_id,schedule_id,due_at,conversation_id,created_at) values($1,$2,now(),$3,now()-interval '10 days')",
        [who, s.id, c.id],
      ),
    );
  }
  const active = await insertSchedule(who);
  await maintainSchedules();
  const result = (
    await withOwner(who, (tx) =>
      tx.query('select * from schedule_occurrences where schedule_id=$1', [active.id]),
    )
  ).rows[0]!;
  expect(result.status).toBe('queued');
  expect(result.run_id).toBeTruthy();
  await executeRun(String(result.run_id), {
    now: () => new Date(),
    model: scriptedModel([{ text: 'Synthetic completion' }]),
    ports: {},
    loadKey,
  });
});
it('isolates an invalid schedule and does not accumulate quota-delayed occurrences', async () => {
  const who = await scheduleOwner(),
    bad = await insertSchedule(who, false, true, 'Invalid/TimeZone'),
    good = await insertSchedule(who);
  await expect(maintainSchedules()).resolves.toBeUndefined();
  const failed = (
    await withOwner(who, (tx) =>
      tx.query('select paused,last_error from schedules where id=$1', [bad.id]),
    )
  ).rows[0]!;
  expect(failed).toMatchObject({ paused: true, last_error: 'INVALID_SCHEDULE' });
  const valid = (
    await withOwner(who, (tx) =>
      tx.query('select run_id from schedule_occurrences where schedule_id=$1', [good.id]),
    )
  ).rows[0]!;
  expect(valid.run_id).toBeTruthy();
  await executeRun(String(valid.run_id), {
    now: () => new Date(),
    model: scriptedModel([{ text: 'Synthetic completion' }]),
    ports: {},
    loadKey,
  });
  const delayed = await insertSchedule(who, true, false),
    c = await createConversation(who, { modelId: 'synthetic/model', enabledTools: [] });
  await withOwner(who, (tx) =>
    tx.query(
      'insert into schedule_occurrences(owner_id,schedule_id,due_at,conversation_id) values($1,$2,now(),$3)',
      [who, delayed.id, c.id],
    ),
  );
  // Occupy all three slots to keep the occurrence pending across two due periods.
  const occupied = [];
  for (let i = 0; i < 3; i++) {
    const chat = await createConversation(who, { modelId: 'synthetic/model', enabledTools: [] });
    occupied.push(
      (
        await createMessageRun(who, chat.id, randomUUID(), {
          clientMessageId: randomUUID(),
          text: 'Synthetic occupied slot',
          fileIds: [],
        })
      ).body.run.id,
    );
  }
  for (let i = 0; i < 2; i++) {
    await withWorker((tx) =>
      tx.query("update schedules set paused=false,next_at=now()-interval '1 minute' where id=$1", [
        delayed.id,
      ]),
    );
    await maintainSchedules();
  }
  expect(
    (
      await withOwner(who, (tx) =>
        tx.query('select id from schedule_occurrences where schedule_id=$1', [delayed.id]),
      )
    ).rowCount,
  ).toBe(1);
  for (const id of occupied)
    await executeRun(id, {
      now: () => new Date(),
      model: scriptedModel([{ text: 'Synthetic completion' }]),
      ports: {},
      loadKey,
    });
  const current = (
    await withOwner(who, (tx) =>
      tx.query('select version from schedules where id=$1', [delayed.id]),
    )
  ).rows[0]!;
  await pauseSchedule(who, String(delayed.id), Number(current.version), true);
});
it('removes an owned project with hidden deleted chats while preserving documents and rejecting other owners', async () => {
  const p = await saveProject(owner, { name: 'Deletion regression', memory: 'Synthetic memory' }),
    c = await chat();
  await updateConversation(owner, c.id, 1, { projectId: String(p.id) });
  const d = await saveDocument(owner, {
    title: 'Preserved document',
    content: 'Keep this',
    project_id: String(p.id),
  });
  await deleteConversation(owner, c.id);
  await expect(removeProject(other, String(p.id), 1)).rejects.toMatchObject({ status: 404 });
  await expect(removeProject(owner, String(p.id), 1)).resolves.toBeUndefined();
  const deleted = await withWorker(
    async (tx) =>
      (
        await tx.query('select project_id from conversations where id=$1 and owner_id=$2', [
          c.id,
          owner,
        ])
      ).rows[0],
  );
  expect(deleted?.project_id).toBeNull();
  const doc = (await request('GET', `/v1/documents/${d.id}`)).json().data;
  expect(doc).toMatchObject({ content: 'Keep this', project_id: null, version: 2 });
  expect((await request('GET', `/v1/documents/${d.id}/revisions`)).json().data).toHaveLength(2);
});
it('reads complete paginated project documents with version checks, ownership and persisted evidence', async () => {
  const p = await saveProject(owner, { name: 'Complete project documents', memory: '' }),
    c = await chat(['files']);
  await updateConversation(owner, c.id, 1, { projectId: String(p.id) });
  const large = await saveDocument(owner, {
    title: 'Large reference',
    content: 'A'.repeat(9000) + 'IMPORTANT_FINAL_CLAUSE',
    project_id: String(p.id),
  });
  for (let i = 0; i < 5; i++)
    await saveDocument(owner, {
      title: `Reference ${i}`,
      content: 'Other synthetic text',
      project_id: String(p.id),
    });
  const ports = projectDocumentPorts(owner, c.id),
    page = await ports.listProjectDocuments!(0, 2);
  expect(page.data).toMatchObject({ next_offset: 2 });
  const all = [];
  for (let offset = 0; offset < 6; offset += 2)
    all.push(
      ...((await ports.listProjectDocuments!(offset, 2)).data as { documents: { id: string }[] })
        .documents,
    );
  expect(all).toHaveLength(6);
  const first = await ports.readProjectDocument!({
    documentId: String(large.id),
    offset: 0,
    limit: 8000,
    version: 1,
  });
  expect(first.data).toMatchObject({ next_offset: 8000 });
  const end = await ports.readProjectDocument!({
    documentId: String(large.id),
    offset: 8000,
    limit: 8000,
    version: 1,
  });
  expect(JSON.stringify(end.data)).toContain('IMPORTANT_FINAL_CLAUSE');
  await expect(
    projectDocumentPorts(other, c.id).readProjectDocument!({
      documentId: String(large.id),
      offset: 0,
      limit: 100,
    }),
  ).rejects.toMatchObject({ status: 404 });
  const r = await run(c.id, 'Read the end of the reference');
  await executeRun(r.body.run.id, {
    now: () => new Date(),
    model: scriptedModel([
      {
        calls: [
          {
            name: 'read_project_document',
            arguments: { document_id: large.id, offset: 8000, limit: 8000, version: 1 },
          },
        ],
      },
      { text: 'Final clause [S1].' },
    ]),
    ports,
    prepareMessages: workspaceMessages(),
    loadKey,
  });
  expect((await getSnapshot(owner, r.body.run.id)).sources[0]).toMatchObject({
    document_id: large.id,
    section: expect.stringContaining('Version 1'),
  });
  await saveDocument(
    owner,
    { title: 'Large reference', content: 'Revised', project_id: String(p.id) },
    String(large.id),
    1,
  );
  await expect(
    ports.readProjectDocument!({ documentId: String(large.id), offset: 0, limit: 100, version: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  await updateConversation(owner, c.id, 2, { projectId: null });
  await expect(
    ports.readProjectDocument!({ documentId: String(large.id), offset: 0, limit: 100 }),
  ).rejects.toMatchObject({ status: 404 });
  await removeDocument(owner, String(large.id), 2);
  expect((await getSnapshot(owner, r.body.run.id)).sources[0]?.document_id).toBeNull();
});
it('accepts a title-only calendar revision from the form without clearing attendees or description', async () => {
  const c = await chat(['calendar']),
    grant = (
      await withOwner(owner, (tx) =>
        tx.query("select id from integrations where provider='google'"),
      )
    ).rows[0]!;
  const args = {
    event_id: 'synthetic-event',
    expected_etag: 'synthetic-etag',
    title: 'Proposed title',
    timezone: 'UTC',
  };
  const r = await run(c.id, 'Change the event title', {
    googleSubject: 'synthetic-subject',
    googleIntegrationId: grant.id,
  });
  const writes: unknown[] = [];
  const deps = {
    now: () => new Date(),
    model: scriptedModel([
      { calls: [{ name: 'update_calendar_event', arguments: args }] },
      { text: 'Done' },
    ]),
    ports: {
      updateEvent: async (a: unknown) => {
        writes.push(a);
        return { ok: true };
      },
    },
    authorizeTool: async () => String(grant.id),
    loadKey,
  };
  await executeRun(r.body.run.id, deps);
  const approval = (await getSnapshot(owner, r.body.run.id)).approvals[0]!;
  const initial = approvalFields('update_calendar_event', args, {
    start: '2026-11-12T09:00:00Z',
    end: '2026-11-12T10:00:00Z',
    attendees: [{ address: 'guest@example.com' }],
    description: 'Preserve description',
  });
  const revised = revisedArguments(args, initial, { ...initial, title: 'Edited title' });
  const response = await request('POST', `/v1/approvals/${approval.id}/revise`, {
    args_hash: approval.args_hash,
    arguments: revised,
  });
  expect(response.statusCode).toBe(200);
  const updated = (await getSnapshot(owner, r.body.run.id)).approvals.find(
    (a) => a.status === 'pending',
  )!;
  expect(updated.structured_preview).toMatchObject({
    attendees: [{ address: 'guest@example.com' }],
    description: 'Preserve description',
  });
  await decideApproval(owner, updated.id, 'approve', updated.args_hash);
  await executeRun(r.body.run.id, deps);
  expect(writes).toEqual([{ ...args, title: 'Edited title' }]);
});
