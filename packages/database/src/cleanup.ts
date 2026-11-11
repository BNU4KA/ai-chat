import { withWorker } from './pool.ts';

export type RemoveObjects = (keys: string[]) => Promise<void>;

/** Remove private objects first; a storage failure keeps metadata and the outbox job retryable. */
export async function purgeConversation(
  ownerId: string,
  conversationId: string,
  removeObjects: RemoveObjects,
): Promise<void> {
  const keys = await withWorker(async (tx) => {
    const chat = await tx.query(
      'select deleted_at from conversations where id = $1 and owner_id = $2',
      [conversationId, ownerId],
    );
    if (!chat.rowCount) return null;
    if (!chat.rows[0]?.deleted_at) throw new Error('Refusing to purge an active conversation');
    const busy = await tx.query(
      `select id from runs where conversation_id = $1 and owner_id = $2
       and lease_token is not null and lease_until > now()`,
      [conversationId, ownerId],
    );
    if (busy.rowCount) throw new Error('Conversation worker is still stopping');
    const files = await tx.query(
      'select object_key,created_at from files where conversation_id = $1 and owner_id = $2',
      [conversationId, ownerId],
    );
    return {keys:files.rows.map((row) => String(row.object_key)),expires:Math.max(0,...files.rows.map(row=>new Date(String(row.created_at)).getTime()+2*60*60*1000))};
  });
  if (keys === null) return;
  if (keys.keys.length) await removeObjects(keys.keys);
  if(keys.expires>Date.now())throw new Error('Signed upload cleanup pending');
  await withWorker(async (tx) => {
    const chat = await tx.query(
      'select id from conversations where id = $1 and owner_id = $2 and deleted_at is not null for update',
      [conversationId, ownerId],
    );
    if (!chat.rowCount) return;
    const args = [conversationId, ownerId];
    await tx.query(
      `delete from idempotency_records where owner_id = $2 and
      (response_body #>> '{run,conversation_id}' = $1::text or response_body #>> '{message,conversation_id}' = $1::text)`,
      args,
    );
    await tx.query(
      `delete from outbox where owner_id = $2 and topic = 'run.execute'
      and payload->>'runId' in (select id::text from runs where conversation_id = $1 and owner_id = $2)`,
      args,
    );
    await tx.query(
      `delete from message_files where owner_id = $2 and message_id in
      (select id from messages where conversation_id = $1 and owner_id = $2)`,
      args,
    );
    await tx.query(
      `delete from document_chunks where owner_id = $2 and file_id in
      (select id from files where conversation_id = $1 and owner_id = $2)`,
      args,
    );
    for (const table of ['run_sources', 'approvals', 'tool_calls', 'run_events']) {
      await tx.query(
        `delete from ${table} where owner_id = $2 and run_id in
        (select id from runs where conversation_id = $1 and owner_id = $2)`,
        args,
      );
    }
    await tx.query(
      'update messages set run_id = null where conversation_id = $1 and owner_id = $2',
      args,
    );
    await tx.query('delete from runs where conversation_id = $1 and owner_id = $2', args);
    await tx.query('delete from messages where conversation_id = $1 and owner_id = $2', args);
    await tx.query('delete from files where conversation_id = $1 and owner_id = $2', args);
    await tx.query('delete from conversations where id = $1 and owner_id = $2', args);
  });
}

/** Fence abandoned workers before dispatching a recovery attempt through the durable outbox. */
export async function recoverExpiredRuns(): Promise<number> {
  return withWorker(async (tx) => {
    const rows = await tx.query(
      `select id, owner_id from runs where status = 'running' and lease_until <= now()
       for update skip locked limit 20`,
    );
    for (const row of rows.rows) {
      await tx.query(
        `update runs set status = 'queued', lease_token = null, lease_until = null,
        version = version + 1, updated_at = now() where id = $1`,
        [row.id],
      );
      await tx.query(
        `insert into outbox(owner_id, topic, payload) values($1, 'run.execute', $2::jsonb)`,
        [row.owner_id, JSON.stringify({ runId: row.id })],
      );
    }
    return rows.rowCount ?? 0;
  });
}
