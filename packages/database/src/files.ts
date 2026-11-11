import { randomUUID } from 'node:crypto';
import { AppError, LIMITS } from '@ai-chat/contracts';
import { withOwner, withWorker, type Tx } from './pool.ts';
export type FileRow = Record<string, unknown>;
export function fileDto(row: FileRow) {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    filename: String(row.original_name),
    byte_size: Number(row.byte_size),
    detected_mime: row.detected_mime ?? null,
    status: String(row.status),
    error_code: row.error_code ?? null,
    version: Number(row.version),
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}
async function checkChat(tx: Tx, chat: string) {
  if (!(await tx.query('select id from conversations where id=$1', [chat])).rowCount)
    throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
}
export async function reserveFile(
  owner: string,
  input: { conversation_id: string; filename: string; byte_size: number; declared_mime: string },
) {
  return withWorker(async (tx) => {
    const profile = await tx.query(
      'select id from profiles where id=$1 and deletion_requested_at is null for update',
      [owner],
    );
    if (!profile.rowCount) throw new AppError(404, 'NOT_FOUND', 'Profile not found');
    if (
      !(
        await tx.query(
          'select id from conversations where id=$1 and owner_id=$2 and deleted_at is null',
          [input.conversation_id, owner],
        )
      ).rowCount
    )
      throw new AppError(404, 'NOT_FOUND', 'Conversation not found');
    const quota = (
      await tx.query(
        'select count(*)::int as count,coalesce(sum(byte_size),0) as bytes from files where owner_id=$1',
        [owner],
      )
    ).rows[0]!;
    if (
      quota.count >= LIMITS.filesPerUser ||
      Number(quota.bytes) + input.byte_size > LIMITS.storedBytesPerUser
    )
      throw new AppError(
        422,
        'FILE_QUOTA',
        'File storage limit reached. Remove unused files first.',
      );
    const rate = await tx.query(
      `insert into rate_limits(owner_id,bucket,window_start,count) values($1,'uploads',date_trunc('hour',now()),1) on conflict(owner_id,bucket,window_start) do update set count=rate_limits.count+1 returning count`,
      [owner],
    );
    if (Number(rate.rows[0]?.count) > LIMITS.uploadsPerHour)
      throw new AppError(429, 'RATE_LIMITED', 'Upload limit reached. Please try later.');
    const id = randomUUID();
    const name = input.filename.replace(/[\\/\u0000-\u001f\u007f]/g, '_');
    if (!/\.(pdf|txt|md|doc|docx|png|jpe?g|webp|gif)$/i.test(name))
      throw new AppError(422, 'UNSUPPORTED_FILE', 'Choose a photo (JPG, PNG, WebP, GIF), Word document (DOC, DOCX), PDF, TXT, or Markdown file.');
    return (
      await tx.query(
        `insert into files(id,owner_id,conversation_id,object_key,original_name,byte_size,status) values($1,$2,$3,$4,$5,$6,'pending_upload') returning *`,
        [
          id,
          owner,
          input.conversation_id,
          `${owner}/${input.conversation_id}/${id}`,
          name,
          input.byte_size,
        ],
      )
    ).rows[0]!;
  });
}
export async function ownedFile(owner: string, id: string) {
  return withOwner(owner, async (tx) => {
    const row = (
      await tx.query(
        'select f.* from files f join conversations c on c.id=f.conversation_id where f.id=$1',
        [id],
      )
    ).rows[0];
    if (!row) throw new AppError(404, 'NOT_FOUND', 'File not found');
    return row;
  });
}
export async function chatFiles(owner: string, chat: string) {
  return withOwner(owner, async (tx) => {
    await checkChat(tx, chat);
    return (
      await tx.query('select * from files where conversation_id=$1 order by created_at desc', [
        chat,
      ])
    ).rows.map(fileDto);
  });
}
export async function finalizeFile(owner: string, id: string) {
  return withOwner(owner, async (tx) => {
    const row = (
      await tx.query(
        'select f.* from files f join conversations c on c.id=f.conversation_id where f.id=$1 for update of f',
        [id],
      )
    ).rows[0];
    if (!row) throw new AppError(404, 'NOT_FOUND', 'File not found');
    if (row.status === 'ready' || row.status === 'processing') return row;
    if (row.status !== 'pending_upload')
      throw new AppError(422, 'FILE_NOT_READY', 'Upload a new copy of this file.');
    const next = (
      await tx.query(
        "update files set status='processing',version=version+1,updated_at=now() where id=$1 returning *",
        [id],
      )
    ).rows[0]!;
    await tx.query(
      "insert into outbox(owner_id,topic,payload) values($1,'file.process',$2::jsonb)",
      [owner, JSON.stringify({ fileId: id })],
    );
    return next;
  });
}
export async function deleteFile(owner: string, id: string, version: number) {
  return withWorker(async (tx) => {
    const row = (
      await tx.query(
        'select f.* from files f join conversations c on c.id=f.conversation_id join profiles p on p.id=f.owner_id where f.id=$1 and f.owner_id=$2 and f.deleted_at is null and c.deleted_at is null and p.deletion_requested_at is null for update of f',
        [id, owner],
      )
    ).rows[0];
    if (!row) throw new AppError(404, 'NOT_FOUND', 'File not found');
    if (Number(row.version) !== version)
      throw new AppError(409, 'VERSION_CONFLICT', 'File was updated', {
        version: Number(row.version),
      });
    await tx.query(
      "update files set deleted_at=now(),status='deleted',version=version+1,updated_at=now() where id=$1",
      [id],
    );
    const cancelled = await tx.query(
      `update runs set cancel_requested_at=coalesce(cancel_requested_at,now()),status=case when status='waiting_approval' then 'queued' else status end,updated_at=now() where owner_id=$2 and conversation_id=$1 and status in ('queued','running','waiting_approval') returning id`,
      [row.conversation_id, owner],
    );
    for (const run of cancelled.rows) {
      await tx.query(
        "update approvals set status='cancelled' where run_id=$1 and consumed_at is null and status in ('pending','approved')",
        [run.id],
      );
      await tx.query(
        "insert into outbox(owner_id,topic,payload) values($1,'run.execute',$2::jsonb)",
        [owner, JSON.stringify({ runId: run.id })],
      );
    }
    await tx.query('delete from document_chunks where file_id=$1 and owner_id=$2', [id, owner]);
    await tx.query('update run_sources set excerpt=null where file_id=$1 and owner_id=$2', [
      id,
      owner,
    ]);
    await tx.query("insert into outbox(owner_id,topic,payload) values($1,'file.purge',$2::jsonb)", [
      owner,
      JSON.stringify({ fileId: id }),
    ]);
  });
}
