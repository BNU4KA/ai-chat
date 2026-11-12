import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '@ai-chat/contracts';
import { fileDto, withWorker } from '@ai-chat/database';
import { downloadStoredObject, extractIsolated, removeStoredObjects } from '@ai-chat/integrations';
import type { ToolPorts, ToolOutcome } from '@ai-chat/agent-runtime';

export async function processFile(id: string) {
  const token = randomUUID();
  const file = await withWorker(
    async (tx) =>
      (
        await tx.query(
          `update files f set processing_token=$2,processing_until=now()+interval '60 seconds' from conversations c,profiles p where f.id=$1 and f.conversation_id=c.id and p.id=f.owner_id and f.status='processing' and f.deleted_at is null and c.deleted_at is null and p.deletion_requested_at is null and (f.processing_token is null or f.processing_until<now()) returning f.*`,
          [id, token],
        )
      ).rows[0],
  );
  if (!file) return;
  try {
    const bytes = await downloadStoredObject(String(file.object_key));
    if (bytes.length !== Number(file.byte_size)) throw new Error('FILE_SIZE_MISMATCH');
    const extracted = await extractIsolated(new Uint8Array(bytes), String(file.original_name));
    const chunks: { text: string; page?: number; section?: string }[] = [];
    for (const page of extracted.pages) {
      for (let start = 0; start < page.text.length; start += 1800) {
        chunks.push({ ...page, text: page.text.slice(start, start + 2200) });
      }
    }
    await withWorker(async (tx) => {
      const fresh = (
        await tx.query(
          'select f.id from files f join conversations c on c.id=f.conversation_id where f.id=$1 and f.processing_token=$2 and f.deleted_at is null and c.deleted_at is null for update of f',
          [id, token],
        )
      ).rowCount;
      if (!fresh) return;
      await tx.query('delete from document_chunks where file_id=$1', [id]);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        await tx.query(
          'insert into document_chunks(owner_id,file_id,ordinal,text,page,section) values($1,$2,$3,$4,$5,$6)',
          [file.owner_id, id, i, chunk.text, chunk.page ?? null, chunk.section ?? null],
        );
      }
      await tx.query(
        "update files set status='ready',detected_mime=$3,sha256=$4,extracted_chars=$5,page_count=$6,processing_token=null,processing_until=null,version=version+1,updated_at=now() where id=$1 and processing_token=$2",
        [
          id,
          token,
          extracted.mime,
          createHash('sha256').update(bytes).digest('hex'),
          extracted.pages.reduce((n, p) => n + p.text.length, 0),
          extracted.mime === 'application/pdf' ? extracted.pages.length : null,
        ],
      );
    });
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : 'EXTRACTION_FAILED';
    await withWorker(async (tx) => {
      await tx.query(
        "update files set status='failed',error_code=$3,processing_token=null,processing_until=null,version=version+1,updated_at=now() where id=$1 and processing_token=$2 and deleted_at is null",
        [id, token, code],
      );
    });
  }
}
export async function purgeFile(owner: string, id: string) {
  const file = await withWorker(
    async (tx) =>
      (
        await tx.query(
          'select * from files where id=$1 and owner_id=$2 and deleted_at is not null',
          [id, owner],
        )
      ).rows[0],
  );
  if (!file) return;
  await removeStoredObjects([String(file.object_key)]);
  // Signed upload links cannot be individually revoked. Sweep again after their two-hour TTL.
  if (Date.now() < new Date(String(file.created_at)).getTime() + 2 * 60 * 60 * 1000)
    throw new Error('Upload token cleanup pending');
  await withWorker(async (tx) => {
    await tx.query('delete from message_files where file_id=$1 and owner_id=$2', [id, owner]);
    await tx.query(
      'update run_sources set file_id=null,excerpt=null where file_id=$1 and owner_id=$2',
      [id, owner],
    );
    await tx.query('delete from document_chunks where file_id=$1 and owner_id=$2', [id, owner]);
    await tx.query('delete from files where id=$1 and owner_id=$2 and deleted_at is not null', [
      id,
      owner,
    ]);
  });
}
export function filePorts(owner: string, chat: string): ToolPorts {
  async function read(
    fileId?: string,
    query?: string,
    pageStart?: number,
    pageEnd?: number,
    ids?: string[],
  ): Promise<ToolOutcome> {
    return withWorker(async (tx) => {
      const values: unknown[] = [owner, chat];
      let where =
        "f.owner_id=$1 and (f.conversation_id=$2 or exists(select 1 from project_files pf join conversations current_chat on current_chat.project_id=pf.project_id and current_chat.owner_id=pf.owner_id where pf.file_id=f.id and pf.owner_id=$1 and current_chat.id=$2 and current_chat.deleted_at is null)) and f.status='ready' and f.deleted_at is null and c.deleted_at is null";
      for (const [sql, value] of [
        ['f.id =', fileId],
        ['d.page >=', pageStart],
        ['d.page <=', pageEnd],
      ] as const) {
        if (value !== undefined) {
          values.push(value);
          where += ` and ${sql}$${values.length}`;
        }
      }
      if (ids?.length) {
        values.push(ids);
        where += ` and f.id=any($${values.length}::uuid[])`;
      }
      let order = 'f.created_at,d.ordinal';
      if (query) {
        values.push(query);
        where += ` and d.search_vector @@ plainto_tsquery('english',$${values.length})`;
        order = `ts_rank(d.search_vector,plainto_tsquery('english',$${values.length})) desc,d.ordinal`;
      }
      const rows = (
        await tx.query(
          `select d.*,f.original_name from document_chunks d join files f on f.id=d.file_id join conversations c on c.id=f.conversation_id where ${where} order by ${order} limit 8`,
          values,
        )
      ).rows;
      if (fileId && !rows.length) {
        const exists = await tx.query(
          "select f.id from files f join conversations c on c.id=f.conversation_id where f.id=$1 and f.owner_id=$2 and (f.conversation_id=$3 or exists(select 1 from project_files pf join conversations current_chat on current_chat.project_id=pf.project_id and current_chat.owner_id=pf.owner_id where pf.file_id=f.id and pf.owner_id=$2 and current_chat.id=$3 and current_chat.deleted_at is null)) and f.status='ready' and f.deleted_at is null and c.deleted_at is null",
          [fileId, owner, chat],
        );
        if (!exists.rowCount) throw new AppError(404, 'NOT_FOUND', 'File not found');
      }
      return {
        ok: true,
        data: rows.map((row) => ({
          text: String(row.text).slice(0, 2500),
          file_id: row.file_id,
          page: row.page,
          section: row.section,
        })),
        sources: rows.map((row) => ({
          kind: 'file',
          title: String(row.original_name),
          file_id: String(row.file_id),
          page: row.page as number | undefined,
          section: row.section as string | undefined,
          excerpt: String(row.text).slice(0, 240),
        })),
      };
    });
  }
  return {
    listFiles: async () =>
      withWorker(async (tx) => ({
        ok: true,
        data: (
          await tx.query(
            "select f.* from files f join conversations c on c.id=f.conversation_id where f.owner_id=$1 and (f.conversation_id=$2 or exists(select 1 from project_files pf join conversations current_chat on current_chat.project_id=pf.project_id and current_chat.owner_id=pf.owner_id where pf.file_id=f.id and pf.owner_id=$1 and current_chat.id=$2 and current_chat.deleted_at is null)) and f.status='ready' and f.deleted_at is null and c.deleted_at is null",
            [owner, chat],
          )
        ).rows.map(fileDto),
      })),
    readFile: async (input) => read(input.fileId, undefined, input.pageStart, input.pageEnd),
    searchFiles: async (input) => read(undefined, input.query, undefined, undefined, input.fileIds),
  };
}
