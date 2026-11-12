import { cancelFileConsumers } from './workspace.ts';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  AppError,
  LIMITS,
  codePointLength,
  truncateCodePoints,
  type ToolGroup,
} from '@ai-chat/contracts';
import type { Tx } from './pool.ts';
import { withOwner, withWorker } from './pool.ts';

type Row = Record<string, unknown>;

export type UsageRow = {
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | null;
  cost_status: 'unknown' | 'estimated' | 'confirmed';
};

const ACTIVE = `('queued','running','waiting_approval')`;

export function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function mustIso(value: Date | string): string {
  return iso(value) ?? new Date(0).toISOString();
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function countOf(row: Row | undefined): number {
  return Number(row?.count ?? 0);
}

function usageOf(value: unknown): UsageRow {
  const usage = (value ?? {}) as Partial<UsageRow>;
  return {
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    cost_usd: usage.cost_usd ?? null,
    cost_status: usage.cost_status ?? 'unknown',
  };
}

async function lockProfile(tx: Tx, ownerId: string): Promise<void> {
  const found = await tx.query(
    'select id,deletion_requested_at from profiles where id = $1 for update',
    [ownerId],
  );
  if (!found.rowCount) throw new AppError(404, 'NOT_FOUND', 'Profile not found');
  if (found.rows[0]?.deletion_requested_at)
    throw new AppError(404, 'NOT_FOUND', 'Profile not found');
}

export async function ensureProfile(
  ownerId: string,
  input: { displayName: string | null; avatarUrl: string | null; timezone: string },
): Promise<Row> {
  return withOwner(ownerId, async (tx) => {
    const existing = await tx.query('select * from profiles where id = $1 for update', [ownerId]);
    if (existing.rowCount && existing.rows[0]?.deletion_requested_at) {
      throw new AppError(404, 'NOT_FOUND', 'Profile not found');
    }
    if (existing.rowCount) return existing.rows[0] as Row;
    const inserted = await tx.query(
      `insert into profiles (id, display_name, avatar_url, timezone)
       values ($1, $2, $3, $4)
       on conflict(id) do nothing returning *`,
      [ownerId, input.displayName, input.avatarUrl, input.timezone],
    );
    const row =
      inserted.rows[0] ?? (await tx.query('select * from profiles where id=$1', [ownerId])).rows[0];
    if (!row || row.deletion_requested_at)
      throw new AppError(404, 'NOT_FOUND', 'Profile not found');
    return row as Row;
  });
}

export async function getProfile(ownerId: string): Promise<Row> {
  return withOwner(ownerId, async (tx) => {
    const found = await tx.query(
      'select * from profiles where id = $1 and deletion_requested_at is null',
      [ownerId],
    );
    if (!found.rowCount) throw new AppError(404, 'NOT_FOUND', 'Profile not found');
    return found.rows[0] as Row;
  });
}

export async function updateProfile(
  ownerId: string,
  version: number,
  patch: { displayName?: string | null; theme?: string; timezone?: string; locale?: string },
): Promise<Row> {
  return withOwner(ownerId, async (tx) => {
    const current = await tx.query('select * from profiles where id = $1 for update', [ownerId]);
    if (!current.rowCount || current.rows[0]?.deletion_requested_at) {
      throw new AppError(404, 'NOT_FOUND', 'Profile not found');
    }
    if (Number(current.rows[0]?.version) !== version) {
      throw new AppError(409, 'VERSION_CONFLICT', 'Profile was updated', {
        version: Number(current.rows[0]?.version),
      });
    }
    const row = current.rows[0] as Row;
    const updated = await tx.query(
      `update profiles set display_name = $2, theme = $3, timezone = $4, locale = $5,
         version = version + 1, updated_at = now()
       where id = $1 returning *`,
      [
        ownerId,
        patch.displayName === undefined ? row.display_name : patch.displayName,
        patch.theme ?? row.theme,
        patch.timezone ?? row.timezone,
        patch.locale ?? row.locale,
      ],
    );
    return updated.rows[0] as Row;
  });
}

export async function getOpenRouter(ownerId: string): Promise<Row | null> {
  return withOwner(ownerId, async (tx) => {
    const found = await tx.query(
      `select credential_version, last_four, validated_at,true as configured from encrypted_credentials
       where provider = 'openrouter'`,
    );
    if (found.rows[0]) return found.rows[0] as Row;
    const revision = (
      await tx.query('select revision from credential_revisions where owner_id=$1', [ownerId])
    ).rows[0];
    return revision
      ? {
          configured: false,
          credential_version: Number(revision.revision),
          last_four: null,
          validated_at: null,
        }
      : null;
  });
}

export async function saveOpenRouter(
  ownerId: string,
  expectedVersion: number,
  sealed: {
    ciphertext: Buffer;
    nonce: Buffer;
    authTag: Buffer;
    encryptionKeyVersion: string;
    lastFour: string;
  },
): Promise<Row> {
  return withOwner(ownerId, async (tx) => {
    await lockProfile(tx, ownerId);
    await tx.query(
      `insert into credential_revisions(owner_id,revision) select $1,coalesce(max(credential_version),0) from encrypted_credentials where owner_id=$1 and provider='openrouter' on conflict(owner_id) do nothing`,
      [ownerId],
    );
    const revision = (
      await tx.query('select revision from credential_revisions where owner_id=$1 for update', [
        ownerId,
      ])
    ).rows[0];
    const current = await tx.query(
      `select credential_version from encrypted_credentials where provider='openrouter' for update`,
    );
    const version = Number(revision?.revision ?? 0);
    if (version !== expectedVersion) {
      throw new AppError(409, 'VERSION_CONFLICT', 'Key was updated', { version });
    }
    const next = version + 1;
    await tx.query('update credential_revisions set revision=$2 where owner_id=$1', [
      ownerId,
      next,
    ]);
    if (current.rowCount)
      await cancelKeyRuns(tx, ownerId, Number(current.rows[0]?.credential_version));
    if (!current.rowCount) {
      const inserted = await tx.query(
        `insert into encrypted_credentials (
           owner_id, provider, credential_version, ciphertext, nonce, auth_tag,
           encryption_key_version, last_four, validated_at
         ) values ($1, 'openrouter', $2, $3, $4, $5, $6, $7, now())
         returning credential_version, last_four, validated_at`,
        [
          ownerId,
          next,
          sealed.ciphertext,
          sealed.nonce,
          sealed.authTag,
          sealed.encryptionKeyVersion,
          sealed.lastFour,
        ],
      );
      return inserted.rows[0] as Row;
    }
    const updated = await tx.query(
      `update encrypted_credentials set credential_version = $1, ciphertext = $2, nonce = $3,
         auth_tag = $4, encryption_key_version = $5, last_four = $6, validated_at = now(), updated_at = now()
       where provider = 'openrouter'
       returning credential_version, last_four, validated_at`,
      [
        next,
        sealed.ciphertext,
        sealed.nonce,
        sealed.authTag,
        sealed.encryptionKeyVersion,
        sealed.lastFour,
      ],
    );
    return updated.rows[0] as Row;
  });
}

export async function deleteOpenRouter(ownerId: string, expectedVersion: number): Promise<void> {
  await withOwner(ownerId, async (tx) => {
    await lockProfile(tx, ownerId);
    await tx.query(
      `insert into credential_revisions(owner_id,revision) select $1,coalesce(max(credential_version),0) from encrypted_credentials where owner_id=$1 and provider='openrouter' on conflict(owner_id) do nothing`,
      [ownerId],
    );
    const revision = (
      await tx.query('select revision from credential_revisions where owner_id=$1 for update', [
        ownerId,
      ])
    ).rows[0];
    const current = await tx.query(
      `select credential_version from encrypted_credentials where provider='openrouter' for update`,
    );
    const version = Number(revision?.revision ?? 0);
    if (version !== expectedVersion) {
      throw new AppError(409, 'VERSION_CONFLICT', 'Key was updated', { version });
    }
    if (!current.rowCount) return;
    await tx.query(`delete from encrypted_credentials where provider = 'openrouter'`);
    await tx.query('update credential_revisions set revision=revision+1 where owner_id=$1', [
      ownerId,
    ]);
    await cancelKeyRuns(tx, ownerId, version);
    await tx.query(
      `update runs set cancel_requested_at = coalesce(cancel_requested_at, now()), updated_at = now()
       where status in ${ACTIVE} and credential_version = $1`,
      [version],
    );
  });
}

export async function readOpenRouterSecret(ownerId: string): Promise<{
  version: number;
  sealed: {
    ciphertext: Buffer;
    nonce: Buffer;
    authTag: Buffer;
    encryptionKeyVersion: string;
  };
} | null> {
  return withWorker(async (tx) => {
    const found = await tx.query(
      `select credential_version, ciphertext, nonce, auth_tag, encryption_key_version
       from encrypted_credentials where owner_id = $1 and provider = 'openrouter'`,
      [ownerId],
    );
    const row = found.rows[0];
    if (!row) return null;
    return {
      version: Number(row.credential_version),
      sealed: {
        ciphertext: row.ciphertext as Buffer,
        nonce: row.nonce as Buffer,
        authTag: row.auth_tag as Buffer,
        encryptionKeyVersion: String(row.encryption_key_version),
      },
    };
  });
}

function conversationFrom(row: Row) {
  return {
    id: String(row.id),
    title: String(row.title),
    project_id: (row.project_id as string | null) ?? null,
    context_note: String(row.context_note ?? ''),
    context_through_seq: String(row.context_through_seq ?? 0),
    research_mode: Boolean(row.research_mode),
    budget_usd: row.budget_usd == null ? null : String(row.budget_usd),
    model_id: (row.model_id as string | null) ?? null,
    enabled_tools: (row.enabled_tools as ToolGroup[]) ?? [],
    version: Number(row.version),
    created_at: mustIso(row.created_at as Date),
    updated_at: mustIso(row.updated_at as Date),
  };
}

export async function createConversation(
  ownerId: string,
  input: { modelId: string | null; enabledTools: ToolGroup[] },
): Promise<ReturnType<typeof conversationFrom>> {
  return withOwner(ownerId, async (tx) => {
    const inserted = await tx.query(
      `insert into conversations (owner_id, title, title_source, model_id, enabled_tools)
       values ($1, 'New chat', 'auto', $2, $3) returning *`,
      [ownerId, input.modelId, input.enabledTools],
    );
    return conversationFrom(inserted.rows[0] as Row);
  });
}

export async function listConversations(
  ownerId: string,
  query: string | null,
  limit: number,
  cursor: string | null,
): Promise<{ items: ReturnType<typeof conversationFrom>[]; next: string | null }> {
  return withOwner(ownerId, async (tx) => {
    const params: unknown[] = [limit + 1];
    let where = 'true';
    if (query) {
      params.push(`%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
      where += ` and title ilike $${params.length} escape '\\'`;
    }
    if (cursor) {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const splitAt = decoded.lastIndexOf('|');
      const updatedAt = decoded.slice(0, splitAt);
      const id = decoded.slice(splitAt + 1);
      params.push(updatedAt, id);
      where += ` and (updated_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }
    const found = await tx.query(
      `select * from conversations where ${where}
       order by updated_at desc, id desc limit $1`,
      params,
    );
    const rows = found.rows.slice(0, limit);
    const last = rows.at(-1);
    const next =
      found.rows.length > limit && last
        ? Buffer.from(`${mustIso(last.updated_at as Date)}|${String(last.id)}`).toString(
            'base64url',
          )
        : null;
    return { items: rows.map((row) => conversationFrom(row as Row)), next };
  });
}

export async function getConversation(ownerId: string, id: string) {
  return withOwner(ownerId, async (tx) => {
    const found = await tx.query('select * from conversations where id = $1', [id]);
    if (!found.rowCount) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
    return conversationFrom(found.rows[0] as Row);
  });
}

export async function updateConversation(
  ownerId: string,
  id: string,
  version: number,
  patch: {
    title?: string;
    modelId?: string | null;
    enabledTools?: ToolGroup[];
    projectId?: string | null;
    researchMode?: boolean;
    budgetUsd?: string | null;
  },
) {
  return withOwner(ownerId, async (tx) => {
    const current = await tx.query('select * from conversations where id = $1 for update', [id]);
    if (!current.rowCount) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
    const row = current.rows[0] as Row;
    if (Number(row.version) !== version) {
      throw new AppError(409, 'VERSION_CONFLICT', 'Conversation was updated', {
        version: Number(row.version),
      });
    }
    if (patch.projectId) {
      const project = await tx.query('select id from projects where id=$1', [patch.projectId]);
      if (!project.rowCount) throw new AppError(404, 'NOT_FOUND', 'Project not found');
    }
    if (
      patch.projectId !== undefined &&
      (
        await tx.query(
          "select id from runs where conversation_id=$1 and status in ('queued','running','waiting_approval')",
          [id],
        )
      ).rowCount
    )
      throw new AppError(409, 'ACTIVE_RUN_EXISTS', 'Wait for the current task');
    const updated = await tx.query(
      `update conversations set
         title = $2,
         title_source = case when $3::bool then 'manual' else title_source end,
         model_id = $4,
         enabled_tools = $5, project_id=$6, research_mode=$7,budget_usd=$8,
         version = version + 1,
         updated_at = now()
       where id = $1 returning *`,
      [
        id,
        patch.title ?? row.title,
        patch.title !== undefined,
        patch.modelId === undefined ? row.model_id : patch.modelId,
        patch.enabledTools ?? row.enabled_tools,
        patch.projectId === undefined ? row.project_id : patch.projectId,
        patch.researchMode ?? row.research_mode,
        patch.budgetUsd === undefined ? row.budget_usd : patch.budgetUsd,
      ],
    );
    return conversationFrom(updated.rows[0] as Row);
  });
}

export async function deleteConversation(ownerId: string, id: string): Promise<void> {
  await withWorker(async (tx) => {
    await lockProfile(tx, ownerId);
    // Privileged soft-delete is necessary because RLS intentionally hides the resulting row.
    const current = await tx.query(
      'select id from conversations where id = $1 and owner_id = $2 and deleted_at is null for update',
      [id, ownerId],
    );
    if (!current.rowCount) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
    await tx.query(
      `update approvals set status = 'cancelled'
       where status = 'pending' and run_id in (
         select id from runs where conversation_id = $1 and status in ${ACTIVE}
       )`,
      [id],
    );
    await tx.query(
      `update runs set status = 'cancelled', finished_at = now(),
         cancel_requested_at = coalesce(cancel_requested_at, now()), updated_at = now()
       where conversation_id = $1 and status in ${ACTIVE}`,
      [id],
    );
    await tx.query(
      `update messages set status = 'cancelled'
       where conversation_id = $1 and status = 'pending'`,
      [id],
    );
    const sharedFiles = await tx.query(
      'select id from files where conversation_id=$1 and owner_id=$2',
      [id, ownerId],
    );
    for (const file of sharedFiles.rows) await cancelFileConsumers(tx, ownerId, String(file.id));
    await tx.query(
      'update run_sources set excerpt=null where owner_id=$2 and file_id in (select id from files where conversation_id=$1 and owner_id=$2)',
      [id, ownerId],
    );
    const updated = await tx.query(
      `update conversations set deleted_at = now(), updated_at = now(), version = version + 1 where id = $1 and owner_id = $2`,
      [id, ownerId],
    );
    if (!updated.rowCount) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
    await tx.query(
      `insert into outbox (owner_id, topic, payload) values ($1, 'conversation.purge', $2::jsonb)`,
      [ownerId, JSON.stringify({ conversationId: id })],
    );
  });
}

async function claimIdempotency(
  tx: Tx,
  ownerId: string,
  route: string,
  key: string,
  requestHash: string,
): Promise<{ status: number; body: unknown } | null> {
  await tx.query(
    `delete from idempotency_records where owner_id = $1 and route = $2 and key = $3 and expires_at <= now()`,
    [ownerId, route, key],
  );
  const inserted = await tx.query(
    `insert into idempotency_records (owner_id, route, key, request_hash, expires_at)
     values ($1, $2, $3, $4, now() + interval '24 hours')
     on conflict (owner_id, route, key) do nothing returning id`,
    [ownerId, route, key, requestHash],
  );
  if (inserted.rowCount) return null;
  const existing = await tx.query(
    `select request_hash, response_status, response_body from idempotency_records
     where owner_id = $1 and route = $2 and key = $3 for update`,
    [ownerId, route, key],
  );
  const row = existing.rows[0];
  if (!row || row.response_status == null) {
    throw new AppError(409, 'REQUEST_IN_PROGRESS', 'Request is still in progress');
  }
  if (row.request_hash !== requestHash) {
    throw new AppError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'Idempotency key was reused with a different body',
    );
  }
  return { status: Number(row.response_status), body: row.response_body };
}

async function finishIdempotency(
  tx: Tx,
  ownerId: string,
  route: string,
  key: string,
  status: number,
  body: unknown,
): Promise<void> {
  await tx.query(
    `update idempotency_records set response_status = $4, response_body = $5
     where owner_id = $1 and route = $2 and key = $3`,
    [ownerId, route, key, status, body],
  );
}

async function takeRate(
  tx: Tx,
  ownerId: string,
  bucket: string,
  window: 'minute' | 'hour',
  limit: number,
) {
  const found = await tx.query(
    `insert into rate_limits (owner_id, bucket, window_start, count)
     values ($1, $2, date_trunc('${window}', now()), 1)
     on conflict (owner_id, bucket, window_start)
     do update set count = rate_limits.count + 1
     returning count`,
    [ownerId, bucket],
  );
  if (countOf(found.rows[0] as Row) > limit) {
    throw new AppError(429, 'RATE_LIMITED', 'Too many requests');
  }
}

export type CreatedRun = {
  replayed: boolean;
  status: number;
  body: { message: ReturnType<typeof messageFrom>; run: ReturnType<typeof runFrom> };
};

function messageFrom(row: Row, fileIds: string[]) {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    run_id: (row.run_id as string | null) ?? null,
    seq: String(row.seq),
    role: String(row.role) as 'user' | 'assistant',
    content: String(row.content),
    status: String(row.status) as 'pending' | 'complete' | 'partial' | 'failed' | 'cancelled',
    file_ids: fileIds,
    created_at: mustIso(row.created_at as Date),
  };
}

function runFrom(row: Row, lastEventSeq: string) {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    user_message_id: String(row.user_message_id),
    assistant_message_id: String(row.assistant_message_id),
    status: String(row.status) as
      'queued' | 'running' | 'waiting_approval' | 'completed' | 'cancelled' | 'failed',
    model_id: String(row.model_id),
    attempt: Number(row.attempt),
    version: Number(row.version),
    last_event_seq: lastEventSeq,
    error_code: (row.error_code as string | null) ?? null,
    usage: usageOf(row.usage),
    cancel_requested_at: iso(row.cancel_requested_at as Date | null),
    created_at: mustIso(row.created_at as Date),
    finished_at: iso(row.finished_at as Date | null),
  };
}

export async function createMessageRun(
  ownerId: string,
  conversationId: string,
  idempotencyKey: string,
  input: {
    clientMessageId: string;
    text: string;
    fileIds: string[];
    contextLength?: number | null;
    maxOutputTokens?: number | null;
    googleSubject?: string;
    googleIntegrationId?: string;
    inputPrice?: string | null;
    outputPrice?: string | null;
    scheduleOccurrenceId?: string;
  },
): Promise<CreatedRun> {
  if (!input.text.trim() && input.fileIds.length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'A message needs text or a ready file');
  }
  if (codePointLength(input.text) > LIMITS.messageCodePoints) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Message is too long');
  }
  return withOwner(ownerId, async (tx) => {
    const requestHash = sha256(
      JSON.stringify({
        conversationId,
        clientMessageId: input.clientMessageId,
        text: input.text,
        fileIds: [...input.fileIds].sort(),
      }),
    );
    const replay = await claimIdempotency(
      tx,
      ownerId,
      'POST /messages',
      idempotencyKey,
      requestHash,
    );
    if (replay) {
      return { replayed: true, status: replay.status, body: replay.body as CreatedRun['body'] };
    }
    await lockProfile(tx, ownerId);
    if (input.scheduleOccurrenceId) {
      const occurrence = (
        await tx.query(
          `select o.id,s.paused from schedules s join schedule_occurrences o on o.schedule_id=s.id and o.owner_id=s.owner_id where o.id=$1 and o.owner_id=$2 and o.conversation_id=$3 and o.status='pending' for update of s,o`,
          [input.scheduleOccurrenceId, ownerId, conversationId],
        )
      ).rows[0];
      if (!occurrence || occurrence.paused)
        throw new AppError(409, 'SCHEDULE_INACTIVE', 'Schedule was paused or removed');
    }
    await takeRate(tx, ownerId, 'runs', 'minute', LIMITS.runsPerMinute);
    const activeUser = await tx.query(
      `select count(*)::int as count from runs where status in ${ACTIVE}`,
    );
    if (countOf(activeUser.rows[0] as Row) >= LIMITS.activeRunsPerUser) {
      throw new AppError(409, 'USER_RUN_LIMIT', 'Three runs are already active');
    }
    const conversation = await tx.query('select * from conversations where id = $1 for update', [
      conversationId,
    ]);
    if (!conversation.rowCount) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
    const chat = conversation.rows[0] as Row;
    if (!chat.model_id) throw new AppError(422, 'VALIDATION_ERROR', 'Choose a model first');
    const busy = await tx.query(
      `select id from runs where conversation_id = $1 and status in ${ACTIVE}`,
      [conversationId],
    );
    if (busy.rowCount) {
      throw new AppError(409, 'ACTIVE_RUN_EXISTS', 'This conversation already has an active run');
    }
    const credential = await tx.query(
      `select credential_version from encrypted_credentials where provider = 'openrouter'`,
    );
    if (!credential.rowCount) {
      throw new AppError(422, 'KEY_MISSING', 'Add an OpenRouter key before starting a run');
    }
    let firstName: string | null = null;
    if (input.fileIds.length) {
      const files = await tx.query(
        `select id, status, original_name from files
         where conversation_id = $1 and id = any($2::uuid[])`,
        [conversationId, input.fileIds],
      );
      if (files.rows.length !== input.fileIds.length) {
        throw new AppError(404, 'NOT_FOUND', 'File not found');
      }
      if (files.rows.some((file) => file.status !== 'ready')) {
        throw new AppError(422, 'FILE_NOT_READY', 'Wait until every attachment is ready');
      }
      firstName = String(files.rows[0]?.original_name ?? '');
    }
    const seq = await tx.query(
      `select coalesce(max(seq), 0) + 1 as seq from messages where conversation_id = $1`,
      [conversationId],
    );
    const nextSeq = String(seq.rows[0]?.seq ?? '1');
    const userId = randomUUID();
    const assistantId = randomUUID();
    const runId = randomUUID();
    const duplicate = await tx.query(`select id from messages where client_message_id = $1`, [
      input.clientMessageId,
    ]);
    if (duplicate.rowCount) {
      throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'client_message_id was already used');
    }
    await tx.query(
      `insert into messages (id, owner_id, conversation_id, seq, role, content, status, client_message_id)
       values ($1, $2, $3, $4, 'user', $5, 'complete', $6)`,
      [userId, ownerId, conversationId, nextSeq, input.text, input.clientMessageId],
    );
    await tx.query(
      `insert into messages (id, owner_id, conversation_id, seq, role, content, status)
       values ($1, $2, $3, $4, 'assistant', '', 'pending')`,
      [assistantId, ownerId, conversationId, String(BigInt(nextSeq) + 1n)],
    );
    const runInsert = await tx.query(
      `insert into runs (
         id, owner_id, conversation_id, user_message_id, assistant_message_id, attempt, status,
         model_id, tool_snapshot, credential_version
       ) values ($1, $2, $3, $4, $5, 1, 'queued', $6, $7::jsonb, $8) returning *`,
      [
        runId,
        ownerId,
        conversationId,
        userId,
        assistantId,
        chat.model_id,
        JSON.stringify({
          groups: chat.enabled_tools,
          model_id: chat.model_id,
          contextLength: input.contextLength ?? null,
          maxOutputTokens: input.maxOutputTokens,
          googleSubject: input.googleSubject,
          googleIntegrationId: input.googleIntegrationId,
          inputPrice: input.inputPrice,
          outputPrice: input.outputPrice,
          budgetUsd: chat.budget_usd,
          researchMode: chat.research_mode,
        }),
        credential.rows[0]?.credential_version,
      ],
    );
    await tx.query(`update messages set run_id = $2 where id = any($1::uuid[])`, [
      [userId, assistantId],
      runId,
    ]);
    for (const fileId of input.fileIds) {
      await tx.query(
        `insert into message_files (message_id, file_id, owner_id) values ($1, $2, $3)`,
        [userId, fileId, ownerId],
      );
    }
    if (nextSeq === '1' && chat.title_source === 'auto') {
      const title = truncateCodePoints(
        input.text.trim() ? input.text.trim() : (firstName ?? 'New chat'),
        LIMITS.titleCodePoints,
      );
      await tx.query(`update conversations set title = $2, updated_at = now() where id = $1`, [
        conversationId,
        title || 'New chat',
      ]);
    } else {
      await tx.query(`update conversations set updated_at = now() where id = $1`, [conversationId]);
    }
    await tx.query(
      `insert into outbox (owner_id, topic, payload) values ($1, 'run.execute', $2::jsonb)`,
      [ownerId, JSON.stringify({ runId })],
    );
    const userRow = await tx.query('select * from messages where id = $1', [userId]);
    const body = {
      message: messageFrom(userRow.rows[0] as Row, input.fileIds),
      run: runFrom(runInsert.rows[0] as Row, '0'),
    };
    if (input.scheduleOccurrenceId)
      await tx.query(
        "update schedule_occurrences set status='queued',run_id=$2 where id=$1 and owner_id=$3",
        [input.scheduleOccurrenceId, runId, ownerId],
      );
    await finishIdempotency(tx, ownerId, 'POST /messages', idempotencyKey, 202, body);
    return { replayed: false, status: 202, body };
  });
}

export async function listMessages(
  ownerId: string,
  conversationId: string,
  limit: number,
  cursor: string | null,
) {
  return withOwner(ownerId, async (tx) => {
    const chat = await tx.query('select id from conversations where id = $1', [conversationId]);
    if (!chat.rowCount) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
    const params: unknown[] = [conversationId, limit + 1];
    let cursorSql = '';
    if (cursor) {
      params.push(Buffer.from(cursor, 'base64url').toString('utf8'));
      cursorSql = ` and seq > $${params.length}::bigint`;
    }
    const found = await tx.query(
      `select * from messages where conversation_id = $1${cursorSql} order by seq asc limit $2`,
      params,
    );
    const rows = found.rows.slice(0, limit);
    const ids = rows.map((row) => String(row.id));
    const links = ids.length
      ? await tx.query(
          `select message_id, file_id from message_files where message_id = any($1::uuid[])`,
          [ids],
        )
      : { rows: [] };
    const byMessage = new Map<string, string[]>();
    for (const link of links.rows) {
      const list = byMessage.get(String(link.message_id)) ?? [];
      list.push(String(link.file_id));
      byMessage.set(String(link.message_id), list);
    }
    const last = rows.at(-1);
    return {
      items: rows.map((row) => messageFrom(row as Row, byMessage.get(String(row.id)) ?? [])),
      next:
        found.rows.length > limit && last
          ? Buffer.from(String(last.seq)).toString('base64url')
          : null,
    };
  });
}

export async function listRuns(ownerId: string, conversationId: string, limit: number) {
  return withOwner(ownerId, async (tx) => {
    const chat = await tx.query('select id from conversations where id = $1', [conversationId]);
    if (!chat.rowCount) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
    const found = await tx.query(
      `select * from runs where conversation_id = $1 order by created_at desc limit $2`,
      [conversationId, limit],
    );
    const items = [];
    for (const row of found.rows) {
      const seq = await tx.query(
        `select coalesce(max(seq), 0) as seq from run_events where run_id = $1`,
        [row.id],
      );
      items.push(runFrom(row as Row, String(seq.rows[0]?.seq ?? '0')));
    }
    return items;
  });
}

export async function getSnapshot(ownerId: string, runId: string) {
  return withOwner(ownerId, async (tx) => loadSnapshot(tx, runId));
}

async function loadSnapshot(tx: Tx, runId: string) {
  const run = await tx.query(
    'select r.* from runs r join conversations c on c.id = r.conversation_id where r.id = $1',
    [runId],
  );
  if (!run.rowCount) throw new AppError(404, 'NOT_FOUND', 'Run not found');
  const row = run.rows[0] as Row;
  const message = await tx.query('select * from messages where id = $1', [
    row.assistant_message_id,
  ]);
  const seq = await tx.query(
    `select coalesce(max(seq), 0) as seq from run_events where run_id = $1`,
    [runId],
  );
  const tools = await tx.query('select * from tool_calls where run_id = $1 order by ordinal', [
    runId,
  ]);
  const approvals = await tx.query(
    'select a.*,t.name as tool_name,t.arguments as editable_arguments,t.preview as structured_preview from approvals a join tool_calls t on t.id=a.tool_call_id where a.run_id = $1',
    [runId],
  );
  const sources = await tx.query(
    'select * from run_sources where run_id = $1 order by citation_id',
    [runId],
  );
  const links = await tx.query('select file_id from message_files where message_id = $1', [
    row.assistant_message_id,
  ]);
  return {
    run: runFrom(row, String(seq.rows[0]?.seq ?? '0')),
    assistant_message: messageFrom(
      message.rows[0] as Row,
      links.rows.map((item) => String(item.file_id)),
    ),
    tool_calls: tools.rows.map((t) => ({
      id: String(t.id),
      name: String(t.name),
      status: String(t.status),
      arguments: t.arguments,
      safe_result: t.safe_result,
      provider_reference: t.provider_reference,
      error_code: t.error_code,
    })),
    approvals: approvals.rows.map((a) => ({
      id: String(a.id),
      run_id: String(a.run_id),
      tool_call_id: String(a.tool_call_id),
      tool_name: String(a.tool_name),
      arguments: a.editable_arguments,
      args_hash: String(a.args_hash),
      structured_preview: a.structured_preview,
      status: String(a.status),
      expires_at: iso(a.expires_at as Date),
      decided_at: iso(a.decided_at as Date),
    })),
    sources: sources.rows.map((source) => ({
      citation_id: source.citation_id,
      kind: source.kind,
      title: source.title,
      url: source.url,
      file_id: source.file_id,
      document_id: source.document_id,
      page: source.page,
      section: source.section,
      excerpt: source.excerpt,
      retrieved_at: iso(source.retrieved_at as Date),
    })),
  };
}

export async function cancelRun(ownerId: string, runId: string) {
  return withOwner(ownerId, async (tx) => {
    const current = await tx.query('select * from runs where id = $1 for update', [runId]);
    if (!current.rowCount) throw new AppError(404, 'NOT_FOUND', 'Run not found');
    const row = current.rows[0] as Row;
    if (!['queued', 'running', 'waiting_approval'].includes(String(row.status))) {
      const seq = await tx.query(
        `select coalesce(max(seq), 0) as seq from run_events where run_id = $1`,
        [runId],
      );
      return runFrom(row, String(seq.rows[0]?.seq ?? '0'));
    }
    if (row.status === 'queued') {
      await tx.query(
        `update runs set status = 'cancelled', cancel_requested_at = now(), finished_at = now(),
           error_code = null, updated_at = now(), version = version + 1 where id = $1`,
        [runId],
      );
      await tx.query(`update messages set status = 'cancelled' where id = $1`, [
        row.assistant_message_id,
      ]);
      await appendEvent(tx, ownerId, runId, 'run.cancelled', {
        assistant_message_id: row.assistant_message_id,
        final_content: '',
        usage: usageOf(row.usage),
      });
    } else {
      await tx.query(
        `update runs set cancel_requested_at = coalesce(cancel_requested_at, now()), updated_at = now() where id = $1`,
        [runId],
      );
      if (row.status === 'waiting_approval') {
        await tx.query(
          `update approvals set status = 'cancelled' where run_id = $1 and status = 'pending'`,
          [runId],
        );
        await tx.query(
          `update runs set status = 'cancelled', finished_at = now(), updated_at = now(), version = version + 1 where id = $1`,
          [runId],
        );
        await tx.query(
          `update messages set status = 'cancelled', content = (
             select content from messages where id = $1
           ) where id = $1`,
          [row.assistant_message_id],
        );
        const message = await tx.query('select content from messages where id = $1', [
          row.assistant_message_id,
        ]);
        await appendEvent(tx, ownerId, runId, 'run.cancelled', {
          assistant_message_id: row.assistant_message_id,
          final_content: String(message.rows[0]?.content ?? ''),
          usage: usageOf(row.usage),
        });
      }
    }
    const fresh = await tx.query('select * from runs where id = $1', [runId]);
    const seq = await tx.query(
      `select coalesce(max(seq), 0) as seq from run_events where run_id = $1`,
      [runId],
    );
    return runFrom(fresh.rows[0] as Row, String(seq.rows[0]?.seq ?? '0'));
  });
}

export async function eventsAfter(ownerId: string, runId: string, afterSeq: bigint) {
  return withOwner(ownerId, async (tx) => {
    const run = await tx.query(
      'select r.id from runs r join conversations c on c.id = r.conversation_id where r.id = $1',
      [runId],
    );
    if (!run.rowCount) throw new AppError(404, 'NOT_FOUND', 'Run not found');
    const bounds = await tx.query(
      `select min(seq) as min, max(seq) as max from run_events where run_id = $1`,
      [runId],
    );
    const min = bounds.rows[0]?.min == null ? null : BigInt(String(bounds.rows[0].min));
    const max = bounds.rows[0]?.max == null ? 0n : BigInt(String(bounds.rows[0].max));
    if (afterSeq > max)
      throw new AppError(422, 'VALIDATION_ERROR', 'Event cursor is ahead of the log');
    if (min != null && min > 1n && afterSeq + 1n < min) {
      throw new AppError(410, 'EVENT_CURSOR_EXPIRED', 'Reload the conversation snapshot');
    }
    const found = await tx.query(
      `select * from run_events where run_id = $1 and seq > $2 order by seq asc`,
      [runId, afterSeq.toString()],
    );
    return found.rows;
  });
}

export async function appendEvent(
  tx: Tx,
  ownerId: string,
  runId: string,
  type: string,
  payload: unknown,
): Promise<string> {
  const inserted = await tx.query(
    `insert into run_events (owner_id, run_id, seq, type, payload)
     values (
       $1, $2,
       (select coalesce(max(seq), 0) + 1 from run_events where run_id = $2),
       $3, $4::jsonb
     ) returning seq`,
    [ownerId, runId, type, JSON.stringify(payload)],
  );
  return String(inserted.rows[0]?.seq ?? '0');
}

export async function decideApproval(
  ownerId: string,
  approvalId: string,
  decision: 'approve' | 'reject',
  argsHash: string,
) {
  return withOwner(ownerId, async (tx) => {
    const parent = (await tx.query('select run_id from approvals where id=$1', [approvalId]))
      .rows[0];
    if (!parent) throw new AppError(404, 'NOT_FOUND', 'Approval not found');
    await tx.query('select id from runs where id=$1 for update', [parent.run_id]);
    const current = await tx.query('select * from approvals where id = $1 for update', [
      approvalId,
    ]);
    if (!current.rowCount) throw new AppError(404, 'NOT_FOUND', 'Approval not found');
    const row = current.rows[0] as Row;
    if (!hashEqual(String(row.args_hash), argsHash)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Approval does not match this proposal');
    }
    const expired = new Date(String(row.expires_at)).getTime() <= Date.now();
    if (row.status === 'expired' || (row.status === 'pending' && expired)) {
      if (row.status === 'pending') {
        await tx.query(`update approvals set status = 'expired' where id = $1`, [approvalId]);
      }
      throw new AppError(410, 'APPROVAL_EXPIRED', 'This confirmation expired');
    }
    const mapped = decision === 'approve' ? 'approved' : 'rejected';
    if (row.status === 'pending') {
      await tx.query(
        `update approvals set status = $2, decided_at = now() where id = $1 and status = 'pending'`,
        [approvalId, mapped],
      );
      await tx.query(
        `update runs set status = 'queued', lease_token = null, lease_until = null,
           version = version + 1, updated_at = now()
         where id = $1 and status = 'waiting_approval'`,
        [row.run_id],
      );
      await tx.query(
        `insert into outbox (owner_id, topic, payload) values ($1, 'run.execute', $2::jsonb)`,
        [ownerId, JSON.stringify({ runId: row.run_id })],
      );
      await appendEvent(tx, ownerId, String(row.run_id), 'approval.resolved', {
        approval_id: approvalId,
        status: mapped,
      });
    } else if (row.status !== mapped) {
      throw new AppError(409, 'APPROVAL_ALREADY_DECIDED', 'This confirmation was already decided');
    }
    const fresh = await tx.query('select * from approvals where id = $1', [approvalId]);
    const run = await tx.query('select * from runs where id = $1', [row.run_id]);
    const seq = await tx.query(
      `select coalesce(max(seq), 0) as seq from run_events where run_id = $1`,
      [row.run_id],
    );
    return {
      approval: fresh.rows[0] as Row,
      run: runFrom(run.rows[0] as Row, String(seq.rows[0]?.seq ?? '0')),
    };
  });
}

export async function retryMessage(
  ownerId: string,
  messageId: string,
  idempotencyKey: string,
  requestHash: string,
  modelMeta?: {
    contextLength: number | null;
    maxOutputTokens?: number | null;
    googleSubject?: string;
    googleIntegrationId?: string;
    inputPrice?: string | null;
    outputPrice?: string | null;
  },
) {
  return withOwner(ownerId, async (tx) => {
    const replay = await claimIdempotency(
      tx,
      ownerId,
      'POST /messages/retry',
      idempotencyKey,
      requestHash,
    );
    if (replay) return { replayed: true, status: replay.status, body: replay.body };
    await lockProfile(tx, ownerId);
    await takeRate(tx, ownerId, 'runs', 'minute', LIMITS.runsPerMinute);
    const message = await tx.query(`select * from messages where id = $1 for update`, [messageId]);
    if (!message.rowCount || message.rows[0]?.role !== 'user') {
      throw new AppError(404, 'NOT_FOUND', 'Message not found');
    }
    const user = message.rows[0] as Row;
    const latest = await tx.query(
      `select id from messages where conversation_id = $1 and role = 'user' order by seq desc limit 1`,
      [user.conversation_id],
    );
    if (String(latest.rows[0]?.id) !== messageId) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Only the latest turn can be retried');
    }
    const conversation = await tx.query('select * from conversations where id = $1 for update', [
      user.conversation_id,
    ]);
    if (!conversation.rowCount) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
    const busy = await tx.query(
      `select id from runs where conversation_id = $1 and status in ${ACTIVE}`,
      [user.conversation_id],
    );
    if (busy.rowCount)
      throw new AppError(409, 'ACTIVE_RUN_EXISTS', 'This conversation already has an active run');
    const previous = await tx.query(
      `select status from runs where user_message_id = $1 order by attempt desc limit 1`,
      [messageId],
    );
    if (
      !previous.rowCount ||
      ['queued', 'running', 'waiting_approval'].includes(String(previous.rows[0]?.status))
    ) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Wait until the previous run finishes');
    }
    const activeUser = await tx.query(
      `select count(*)::int as count from runs where status in ${ACTIVE}`,
    );
    if (countOf(activeUser.rows[0] as Row) >= LIMITS.activeRunsPerUser) {
      throw new AppError(409, 'USER_RUN_LIMIT', 'Three runs are already active');
    }
    const credential = await tx.query(
      `select credential_version from encrypted_credentials where provider = 'openrouter'`,
    );
    if (!credential.rowCount)
      throw new AppError(422, 'KEY_MISSING', 'Add an OpenRouter key before starting a run');
    const chat = conversation.rows[0] as Row;
    const attempt = await tx.query(
      `select coalesce(max(attempt), 0) + 1 as attempt from runs where user_message_id = $1`,
      [messageId],
    );
    const seq = await tx.query(
      `select coalesce(max(seq), 0) + 1 as seq from messages where conversation_id = $1`,
      [user.conversation_id],
    );
    const assistantId = randomUUID();
    const runId = randomUUID();
    await tx.query(
      `insert into messages (id, owner_id, conversation_id, seq, role, content, status)
       values ($1, $2, $3, $4, 'assistant', '', 'pending')`,
      [assistantId, ownerId, user.conversation_id, seq.rows[0]?.seq],
    );
    const runInsert = await tx.query(
      `insert into runs (
         id, owner_id, conversation_id, user_message_id, assistant_message_id, attempt, status,
         model_id, tool_snapshot, credential_version
       ) values ($1, $2, $3, $4, $5, $6, 'queued', $7, $8::jsonb, $9) returning *`,
      [
        runId,
        ownerId,
        user.conversation_id,
        messageId,
        assistantId,
        attempt.rows[0]?.attempt,
        chat.model_id,
        JSON.stringify({
          groups: chat.enabled_tools,
          model_id: chat.model_id,
          ...modelMeta,
          budgetUsd: chat.budget_usd,
          researchMode: chat.research_mode,
        }),
        credential.rows[0]?.credential_version,
      ],
    );
    await tx.query(`update messages set run_id = $2 where id = $1`, [assistantId, runId]);
    await tx.query(
      `insert into outbox (owner_id, topic, payload) values ($1, 'run.execute', $2::jsonb)`,
      [ownerId, JSON.stringify({ runId })],
    );
    const seqMax = await tx.query(
      `select coalesce(max(seq), 0) as seq from run_events where run_id = $1`,
      [runId],
    );
    const body = { run: runFrom(runInsert.rows[0] as Row, String(seqMax.rows[0]?.seq ?? '0')) };
    await finishIdempotency(tx, ownerId, 'POST /messages/retry', idempotencyKey, 202, body);
    return { replayed: false, status: 202, body };
  });
}

export async function loadExecutableRun(runId: string): Promise<Row | null> {
  return withWorker(async (tx) => {
    const found = await tx.query('select * from runs where id = $1', [runId]);
    return (found.rows[0] as Row | undefined) ?? null;
  });
}

export async function claimLease(runId: string, token: string): Promise<Row | null> {
  return withWorker(async (tx) => {
    const updated = await tx.query(
      `update runs set status = 'running', lease_token = $2,
         lease_until = now() + interval '60 seconds',
         started_at = coalesce(started_at, now()),
         version = version + 1, updated_at = now()
       where id = $1 and (
         status = 'queued' or (status = 'running' and (lease_until is null or lease_until < now()))
       )
       returning *`,
      [runId, token],
    );
    return (updated.rows[0] as Row | undefined) ?? null;
  });
}

export async function workerQuery<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withWorker(fn);
}

export async function takeOutbox(limit: number): Promise<Row[]> {
  return withWorker(async (tx) => {
    const found = await tx.query(
      `select * from outbox
       where dispatched_at is null and (retry_at is null or retry_at <= now())
       order by created_at asc
       limit $1
       for update skip locked`,
      [limit],
    );
    return found.rows as Row[];
  });
}

export async function markOutbox(id: string, ok: boolean): Promise<void> {
  await withWorker(async (tx) => {
    if (ok) {
      await tx.query(`update outbox set dispatched_at = now() where id = $1`, [id]);
      return;
    }
    await tx.query(
      `update outbox set attempts = attempts + 1, retry_at = now() + interval '5 seconds' where id = $1`,
      [id],
    );
  });
}

export async function compactOldDeltas(): Promise<number> {
  return withWorker(async (tx) => {
    const deleted = await tx.query(
      `delete from run_events where type = 'message.delta' and emitted_at < now() - interval '30 days'`,
    );
    return deleted.rowCount ?? 0;
  });
}

export { usageOf, randomUUID };

export async function latestMessages(
  ownerId: string,
  conversationId: string,
  limit: number,
  before?: string,
) {
  return withOwner(ownerId, async (tx) => {
    const chat = await tx.query('select id from conversations where id=$1', [conversationId]);
    if (!chat.rowCount) throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
    const found = await tx.query(
      `select * from messages where conversation_id=$1 ${before ? 'and seq < $3::bigint' : ''} order by seq desc limit $2`,
      before ? [conversationId, limit + 1, before] : [conversationId, limit + 1],
    );
    const rows = found.rows.slice(0, limit).reverse();
    const ids = rows.map((row) => row.id);
    const links = await tx.query(
      'select message_id,file_id from message_files where message_id=any($1::uuid[])',
      [ids],
    );
    return {
      items: rows.map((row) =>
        messageFrom(
          row,
          links.rows
            .filter((link) => link.message_id === row.id)
            .map((link) => String(link.file_id)),
        ),
      ),
      next: found.rows.length > limit ? String(rows[0]?.seq) : null,
    };
  });
}

async function cancelKeyRuns(tx: Tx, owner: string, version: number) {
  const rows = await tx.query(
    `update runs set cancel_requested_at=coalesce(cancel_requested_at,now()),status=case when status='waiting_approval' then 'queued' else status end,updated_at=now() where owner_id=$1 and credential_version=$2 and status in ('queued','running','waiting_approval') returning id`,
    [owner, version],
  );
  for (const row of rows.rows) {
    await tx.query(
      "update approvals set status='cancelled' where run_id=$1 and consumed_at is null and status in ('pending','approved')",
      [row.id],
    );
    await tx.query(
      "insert into outbox(owner_id,topic,payload) values($1,'run.execute',$2::jsonb)",
      [owner, JSON.stringify({ runId: row.id })],
    );
  }
}

export function messageRequestHash(
  conversationId: string,
  input: { clientMessageId: string; text: string; fileIds: string[] },
) {
  return sha256(
    JSON.stringify({
      conversationId,
      clientMessageId: input.clientMessageId,
      text: input.text,
      fileIds: [...input.fileIds].sort(),
    }),
  );
}
export async function requestReplay(owner: string, route: string, key: string, hash: string) {
  return withOwner(owner, async (tx) => {
    const row = (
      await tx.query(
        'select request_hash,response_status,response_body from idempotency_records where owner_id=$1 and route=$2 and key=$3 and expires_at>now()',
        [owner, route, key],
      )
    ).rows[0];
    if (!row) return null;
    if (row.request_hash !== hash)
      throw new AppError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key was reused with a different body',
      );
    if (row.response_status == null)
      throw new AppError(409, 'REQUEST_IN_PROGRESS', 'The request is still being processed');
    return { status: Number(row.response_status), body: row.response_body };
  });
}
