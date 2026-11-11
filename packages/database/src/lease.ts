import type { Tx } from './pool.ts';
import { withWorker } from './pool.ts';

type Row = Record<string, unknown>;

export async function locked<T>(
  runId: string,
  token: string,
  fn: (tx: Tx, run: Row) => Promise<T>,
): Promise<T | null> {
  return withWorker(async (tx) => {
    const found = await tx.query('select * from runs where id = $1 for update', [runId]);
    const run = found.rows[0] as Row | undefined;
    if (!run) return null;
    if (run.status !== 'running' || String(run.lease_token ?? '') !== token) return null;
    if (run.lease_until && new Date(String(run.lease_until)).getTime() <= Date.now()) return null;
    return fn(tx, run);
  });
}

export async function readRun(runId: string): Promise<Row | null> {
  return withWorker(async (tx) => {
    const found = await tx.query('select * from runs where id = $1', [runId]);
    return (found.rows[0] as Row | undefined) ?? null;
  });
}

export async function readThreadInputs(runId: string): Promise<{
  run: Row;
  messages: Row[];
  attempts: Row[];
  tools: Row[];
} | null> {
  return withWorker(async (tx) => {
    const found = await tx.query('select * from runs where id = $1', [runId]);
    const run = found.rows[0] as Row | undefined;
    if (!run) return null;
    const messages = await tx.query(
      'select * from messages where conversation_id = $1 order by seq asc',
      [run.conversation_id],
    );
    const attempts = await tx.query(
      'select id, user_message_id, attempt, status, assistant_message_id from runs where conversation_id = $1',
      [run.conversation_id],
    );
    const tools = await tx.query(
      'select * from tool_calls where run_id = $1 order by ordinal asc',
      [runId],
    );
    const attachments = await tx.query(
      'select mf.message_id,f.id,f.original_name from message_files mf join files f on f.id=mf.file_id where f.conversation_id=$1 and f.owner_id=$2 and f.deleted_at is null',
      [run.conversation_id, run.owner_id],
    );
    for (const message of messages.rows) {
      if (message.role !== 'user') continue;
      const files = attachments.rows.filter((file) => file.message_id === message.id);
      if (files.length)
        message.attachments = files.map((file) => ({
          type: 'file_ref',
          file_id: String(file.id),
          filename: String(file.original_name),
        }));
    }
    return {
      run,
      messages: messages.rows as Row[],
      attempts: attempts.rows as Row[],
      tools: tools.rows as Row[],
    };
  });
}

export async function renewLease(runId: string, token: string): Promise<boolean> {
  return withWorker(async (tx) => {
    const result = await tx.query(
      `update runs set lease_until = now() + interval '60 seconds'
       where id = $1 and lease_token = $2 and status = 'running' and lease_until > now()
       returning id`,
      [runId, token],
    );
    return Boolean(result.rowCount);
  });
}
