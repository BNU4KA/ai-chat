import { randomBytes, randomUUID } from 'node:crypto';
import {
  closePool,
  createConversation,
  createMessageRun,
  cancelRun,
  claimLease,
  renewLease,
  workerQuery,
  recoverExpiredRuns,
  purgeConversation,
  deleteConversation,
  credentialAad,
  decideApproval,
  ensureProfile,
  getPool,
  getSnapshot,
  lastFour,
  loadKeyring,
  migrate,
  saveOpenRouter,
  seal,
  withOwner,
} from '@ai-chat/database';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { executeRun } from './execute.ts';
import { scriptedModel } from './scripted.ts';
import type { AgentDeps, ModelAdapter, ModelResult } from './types.ts';

const ownerA = randomUUID();
const ownerB = randomUUID();

beforeAll(async () => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/ai_chat';
  process.env.ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64url')}`;
  await migrate();
  // Never truncate a developer's database; every test uses isolated owner identities.
});

afterAll(async () => {
  await closePool();
});

it('runs a scripted reply and hides the chat from another account', async () => {
  await ensureProfile(ownerA, { displayName: 'A', avatarUrl: null, timezone: 'UTC' });
  await ensureProfile(ownerB, { displayName: 'B', avatarUrl: null, timezone: 'UTC' });
  const key = 'sk-or-test-key-1234';
  const ring = loadKeyring(process.env.ENCRYPTION_KEYS);
  const sealed = seal(ring, key, credentialAad(ownerA, 'openrouter', 1));
  await saveOpenRouter(ownerA, 0, { ...sealed, lastFour: lastFour(key) });
  const conversation = await createConversation(ownerA, {
    modelId: 'openai/gpt-test',
    enabledTools: [],
  });
  const created = await createMessageRun(ownerA, conversation.id, randomUUID(), {
    clientMessageId: randomUUID(),
    text: 'Hello from the test',
    fileIds: [],
  });
  await executeRun(created.body.run.id, {
    now: () => new Date(),
    model: scriptedModel([{ text: 'Hello back' }]),
    ports: {},
    loadKey: async () => ({ version: 1, apiKey: key }),
  });
  const snapshot = await getSnapshot(ownerA, created.body.run.id);
  expect(snapshot.run.status).toBe('completed');
  expect(snapshot.assistant_message.content).toBe('Hello back');
  const hidden = await withOwner(ownerB, async (tx) => {
    const found = await tx.query('select id from conversations');
    return found.rows;
  });
  expect(hidden).toEqual([]);
});

it('does not send mail until a matching approval, and a rejection does not send', async () => {
  let sent = 0;
  const conversation = await createConversation(ownerA, {
    modelId: 'openai/gpt-test',
    enabledTools: ['gmail'],
  });
  const created = await createMessageRun(ownerA, conversation.id, randomUUID(), {
    clientMessageId: randomUUID(),
    text: 'Email Ada',
    fileIds: [],
  });
  await executeRun(created.body.run.id, {
    now: () => new Date(),
    model: scriptedModel([
      {
        calls: [
          {
            name: 'send_mail',
            arguments: { to: [{ address: 'ada@example.com' }], subject: 'Hi', body_text: 'Hello' },
          },
        ],
      },
      { text: 'I did not send it' },
    ]),
    ports: {
      sendMail: async () => {
        sent += 1;
        return { ok: true, reference: 'msg-1' };
      },
    },
    loadKey: async () => ({ version: 1, apiKey: 'sk-or-test-key-1234' }),
  });
  const waiting = await getSnapshot(ownerA, created.body.run.id);
  expect(waiting.run.status).toBe('waiting_approval');
  expect(sent).toBe(0);
  const approvalId = String(waiting.approvals[0]?.id);
  const argsHash = String(waiting.approvals[0]?.args_hash);
  await decideApproval(ownerA, approvalId, 'reject', argsHash);
  await executeRun(created.body.run.id, {
    now: () => new Date(),
    model: scriptedModel([{ text: 'I did not send it' }]),
    ports: {
      sendMail: async () => {
        sent += 1;
        return { ok: true };
      },
    },
    loadKey: async () => ({ version: 1, apiKey: 'sk-or-test-key-1234' }),
  });
  const done = await getSnapshot(ownerA, created.body.run.id);
  expect(sent).toBe(0);
  expect(done.run.status).toBe('completed');
  expect(done.assistant_message.content).toContain('did not send');
});

async function fixture(groups: ('web' | 'gmail')[] = []) {
  const owner = randomUUID();
  await ensureProfile(owner, {
    displayName: 'Synthetic regression',
    avatarUrl: null,
    timezone: 'UTC',
  });
  const ring = loadKeyring(process.env.ENCRYPTION_KEYS);
  await saveOpenRouter(owner, 0, {
    ...seal(ring, 'synthetic', credentialAad(owner, 'openrouter', 1)),
    lastFour: 'etic',
  });
  const chat = await createConversation(owner, {
    modelId: 'synthetic/model',
    enabledTools: groups,
  });
  const created = await createMessageRun(owner, chat.id, randomUUID(), {
    clientMessageId: randomUUID(),
    text: 'Synthetic regression',
    fileIds: [],
  });
  return { owner, chat, runId: created.body.run.id };
}
function result(text = '', toolCalls: ModelResult['toolCalls'] = []): ModelResult {
  return {
    text,
    toolCalls,
    submitted: true,
    generationId: null,
    usage: { input_tokens: null, output_tokens: null, cost_usd: null, cost_status: 'unknown' },
  };
}
function dependencies(model: ModelAdapter, ports: AgentDeps['ports'] = {}): AgentDeps {
  return {
    now: () => new Date(),
    model,
    ports,
    loadKey: async () => ({ version: 1, apiKey: 'synthetic' }),
  };
}
it('does not let duplicate delivery fail another worker with a live lease', async () => {
  const f = await fixture();
  const deps = dependencies({
    complete: async () => {
      await executeRun(f.runId, deps);
      return result('Completed exactly once');
    },
  });
  await executeRun(f.runId, deps);
  expect((await getSnapshot(f.owner, f.runId)).run.status).toBe('completed');
});
it('keeps cancellation terminal even if a model returns after Stop', async () => {
  const f = await fixture();
  await executeRun(
    f.runId,
    dependencies({
      complete: async (req) => {
        await req.onDelta('Partial');
        await cancelRun(f.owner, f.runId);
        return result('Partial');
      },
    }),
  );
  const snap = await getSnapshot(f.owner, f.runId);
  expect(snap.run.status).toBe('cancelled');
  expect(snap.assistant_message.content).toBe('Partial');
});
it('aborts a live model connection when cancellation is requested', async () => {
  const f = await fixture();
  await executeRun(
    f.runId,
    dependencies({
      complete: async (req) => {
        await cancelRun(f.owner, f.runId);
        await new Promise<void>((resolve) =>
          req.signal.addEventListener('abort', () => resolve(), { once: true }),
        );
        throw new Error('aborted');
      },
    }),
  );
  expect((await getSnapshot(f.owner, f.runId)).run.status).toBe('cancelled');
});
it('does not start another tool from the same batch after Stop', async () => {
  const f = await fixture(['web']);
  let reads = 0;
  await executeRun(
    f.runId,
    dependencies(
      {
        complete: async () =>
          result('', [
            { id: 'one', name: 'search_web', arguments: '{"query":"first"}' },
            { id: 'two', name: 'search_web', arguments: '{"query":"second"}' },
          ]),
      },
      {
        searchWeb: async () => {
          reads++;
          await cancelRun(f.owner, f.runId);
          return { ok: true, data: [] };
        },
      },
    ),
  );
  expect(reads).toBe(1);
  expect((await getSnapshot(f.owner, f.runId)).run.status).toBe('cancelled');
});
it('renews leases with fencing and never revives an expired owner', async () => {
  const f = await fixture();
  const token = randomUUID();
  await claimLease(f.runId, token);
  expect(await renewLease(f.runId, randomUUID())).toBe(false);
  expect(await renewLease(f.runId, token)).toBe(true);
  await workerQuery(async (tx) => {
    await tx.query("update runs set lease_until = now() - interval '1 second' where id = $1", [
      f.runId,
    ]);
  });
  expect(await renewLease(f.runId, token)).toBe(false);
  expect(await recoverExpiredRuns()).toBeGreaterThanOrEqual(1);
  await executeRun(f.runId, dependencies(scriptedModel([{ text: 'Recovered safely' }])));
  expect((await getSnapshot(f.owner, f.runId)).run.status).toBe('completed');
});
it('actually heartbeats while waiting for a provider response', async () => {
  const f = await fixture();
  try {
    vi.useFakeTimers();
    await executeRun(
      f.runId,
      dependencies({
        complete: async () => {
          await workerQuery(async (tx) => {
            await tx.query(
              "update runs set lease_until = now() + interval '20 seconds' where id = $1",
              [f.runId],
            );
          });
          vi.setSystemTime(Date.now() + 16_000);
          await vi.advanceTimersByTimeAsync(250);
          // Await the real DB poll started by the virtual timer without a fixed sleep.
          await vi.waitFor(async () => {
            const row = await workerQuery(
              async (tx) =>
                (
                  await tx.query(
                    "select lease_until > now() + interval '45 seconds' as renewed from runs where id=$1",
                    [f.runId],
                  )
                ).rows[0],
            );
            expect(row?.renewed).toBe(true);
          });
          return result('Heartbeat maintained');
        },
      }),
    );
  } finally {
    vi.useRealTimers();
  }
  expect((await getSnapshot(f.owner, f.runId)).run.status).toBe('completed');
});
it('supplies rejected tool results and drains calls following an approval', async () => {
  const f = await fixture(['gmail', 'web']);
  await executeRun(
    f.runId,
    dependencies(
      scriptedModel([
        {
          calls: [
            {
              name: 'send_mail',
              arguments: {
                to: [{ address: 'synthetic@example.com' }],
                subject: 'Synthetic',
                body_text: 'Synthetic',
              },
            },
            { name: 'search_web', arguments: { query: 'Following read' } },
          ],
        },
      ]),
    ),
  );
  const pending = await getSnapshot(f.owner, f.runId);
  await decideApproval(
    f.owner,
    String(pending.approvals[0]?.id),
    'reject',
    String(pending.approvals[0]?.args_hash),
  );
  let searches = 0;
  await executeRun(
    f.runId,
    dependencies(
      {
        complete: async (req) => {
          const thread = req.messages as {
            role: string;
            tool_calls?: { id: string }[];
            tool_call_id?: string;
            content?: string;
          }[];
          const calls = thread.flatMap(
            (message) => message.tool_calls?.map((call) => call.id) ?? [],
          );
          const responses = thread.filter((message) => message.role === 'tool');
          expect(calls).toHaveLength(2);
          expect(responses.map((message) => message.tool_call_id)).toEqual(calls);
          expect(responses[0]?.content).toContain('REJECTED');
          return result('Action rejected, read completed');
        },
      },
      {
        searchWeb: async () => {
          searches++;
          return { ok: true, data: [] };
        },
      },
    ),
  );
  expect(searches).toBe(1);
  expect((await getSnapshot(f.owner, f.runId)).run.status).toBe('completed');
});
it('purges a deleted conversation but preserves other chats and retries storage failures', async () => {
  const f = await fixture();
  const other = await createConversation(f.owner, { modelId: 'synthetic/model', enabledTools: [] });
  const fileId = randomUUID();
  await workerQuery(async (tx) => {
    await tx.query(
      `insert into files(id, owner_id, conversation_id, object_key, original_name, byte_size, status,created_at)
     values($1,$2,$3,$4,'synthetic.txt',1,'ready',now()-interval '3 hours')`,
      [fileId, f.owner, f.chat.id, `${f.owner}/synthetic`],
    );
  });
  await expect(deleteConversation(ownerB, f.chat.id)).rejects.toMatchObject({ status: 404 });
  await deleteConversation(f.owner, f.chat.id);
  await expect(getSnapshot(f.owner, f.runId)).rejects.toMatchObject({ status: 404 });
  await expect(
    purgeConversation(f.owner, f.chat.id, async () => {
      throw new Error('Storage unavailable');
    }),
  ).rejects.toThrow('Storage unavailable');
  expect(
    (await getPool().query('select id from conversations where id=$1', [f.chat.id])).rowCount,
  ).toBe(1);
  const removed: string[] = [];
  await purgeConversation(f.owner, f.chat.id, async (keys) => {
    removed.push(...keys);
  });
  expect(removed).toEqual([`${f.owner}/synthetic`]);
  expect(
    (await getPool().query('select id from conversations where id=$1', [f.chat.id])).rowCount,
  ).toBe(0);
  expect(
    (await getPool().query('select id from conversations where id=$1', [other.id])).rowCount,
  ).toBe(1);
  await purgeConversation(f.owner, f.chat.id, async () => {
    throw new Error('Already deleted');
  });
});

it('does not let a stale worker overwrite recovered uncertain-model failure', async () => {
  const f = await fixture();
  let extraModelCalls = 0;
  await executeRun(
    f.runId,
    dependencies({
      complete: async () => {
        await workerQuery(async (tx) => {
          await tx.query("update runs set lease_until=now()-interval '1 second' where id=$1", [
            f.runId,
          ]);
        });
        await recoverExpiredRuns();
        await executeRun(
          f.runId,
          dependencies({
            complete: async () => {
              extraModelCalls++;
              return result('Must not execute');
            },
          }),
        );
        return result('Stale result');
      },
    }),
  );
  const snap = await getSnapshot(f.owner, f.runId);
  expect(snap.run.status).toBe('failed');
  expect(snap.run.error_code).toBe('WORKER_INTERRUPTED');
  expect(extraModelCalls).toBe(0);
});

it('does not fail or repeat a write when a duplicate handler arrives during its execution', async () => {
  const f = await fixture(['gmail']);
  await executeRun(
    f.runId,
    dependencies(
      scriptedModel([
        {
          calls: [
            {
              name: 'send_mail',
              arguments: {
                to: [{ address: 'synthetic@example.com' }],
                subject: 'Synthetic',
                body_text: 'Synthetic',
              },
            },
          ],
        },
      ]),
    ),
  );
  const pending = await getSnapshot(f.owner, f.runId);
  await decideApproval(
    f.owner,
    String(pending.approvals[0]?.id),
    'approve',
    String(pending.approvals[0]?.args_hash),
  );
  let sends = 0;
  const deps = dependencies(scriptedModel([{ text: 'Confirmed sent' }]), {
    sendMail: async () => {
      sends++;
      await executeRun(f.runId, deps);
      return { ok: true, reference: 'synthetic-message' };
    },
  });
  await executeRun(f.runId, deps);
  expect(sends).toBe(1);
  expect((await getSnapshot(f.owner, f.runId)).run.status).toBe('completed');
});

it('resumes a read interrupted after insertion without duplicating its tool-call row', async () => {
  const f = await fixture(['web']);
  const model = scriptedModel([
    { calls: [{ name: 'search_web', arguments: { query: 'Synthetic read' } }] },
    { text: 'Recovered read' },
  ]);
  let reads = 0;
  const deps = dependencies(model, {
    searchWeb: async () => {
      reads++;
      if (reads === 1) {
        await workerQuery(async (tx) => {
          await tx.query("update runs set lease_until=now()-interval '1 second' where id=$1", [
            f.runId,
          ]);
        });
        await recoverExpiredRuns();
      }
      return { ok: true, data: [] };
    },
  });
  await executeRun(f.runId, deps);
  await executeRun(f.runId, deps);
  const snap = await getSnapshot(f.owner, f.runId);
  expect(reads).toBe(2);
  expect(snap.tool_calls).toHaveLength(1);
  expect(snap.run.status).toBe('completed');
});
