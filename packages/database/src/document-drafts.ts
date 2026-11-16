import { AppError, type DocumentBlock } from '@ai-chat/contracts';
import { withOwner } from './pool.ts';
import { mustIso } from './repo.ts';

type Row = Record<string, unknown>;

export type DocumentDraft = ReturnType<typeof draftFrom>;

function draftFrom(row: Row) {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    assistant_message_id: (row.assistant_message_id as string | null) ?? null,
    format: String(row.format) as 'docx' | 'pdf',
    title: String(row.title),
    content: row.content as { blocks: DocumentBlock[] },
    status: String(row.status) as 'draft' | 'created',
    file_id: (row.file_id as string | null) ?? null,
    version: Number(row.version),
    created_at: mustIso(row.created_at as Date),
    updated_at: mustIso(row.updated_at as Date),
  };
}

export async function createDocumentDraft(
  ownerId: string,
  input: {
    conversationId: string;
    assistantMessageId: string | null;
    format: 'docx' | 'pdf';
    title: string;
    content: { blocks: unknown[] };
  },
): Promise<DocumentDraft> {
  return withOwner(ownerId, async (tx) => {
    const inserted = await tx.query(
      `insert into document_drafts (owner_id, conversation_id, assistant_message_id, format, title, content)
       values ($1, $2, $3, $4, $5, $6::jsonb) returning *`,
      [
        ownerId,
        input.conversationId,
        input.assistantMessageId,
        input.format,
        input.title,
        JSON.stringify(input.content),
      ],
    );
    return draftFrom(inserted.rows[0] as Row);
  });
}

export async function listDocumentDrafts(ownerId: string, conversationId: string) {
  return withOwner(ownerId, async (tx) => {
    const found = await tx.query(
      'select * from document_drafts where conversation_id = $1 order by updated_at desc, id desc limit 50',
      [conversationId],
    );
    return found.rows.map((row) => draftFrom(row as Row));
  });
}

export async function getDocumentDraft(ownerId: string, id: string) {
  return withOwner(ownerId, async (tx) => {
    const found = await tx.query('select * from document_drafts where id = $1', [id]);
    if (!found.rowCount) throw new AppError(404, 'NOT_FOUND', 'Draft not found');
    return draftFrom(found.rows[0] as Row);
  });
}

export async function updateDocumentDraft(
  ownerId: string,
  id: string,
  version: number,
  patch: { title?: string; format?: 'docx' | 'pdf'; content?: { blocks: unknown[] } },
) {
  return withOwner(ownerId, async (tx) => {
    const current = await tx.query('select * from document_drafts where id = $1 for update', [id]);
    if (!current.rowCount) throw new AppError(404, 'NOT_FOUND', 'Draft not found');
    const row = current.rows[0] as Row;
    if (row.status !== 'draft')
      throw new AppError(409, 'DRAFT_CREATED', 'This draft already became a file');
    if (Number(row.version) !== version)
      throw new AppError(409, 'VERSION_CONFLICT', 'Draft was updated', {
        version: Number(row.version),
      });
    const updated = await tx.query(
      `update document_drafts set title = $2, format = $3, content = $4::jsonb,
         version = version + 1, updated_at = now()
       where id = $1 returning *`,
      [
        id,
        patch.title ?? row.title,
        patch.format ?? row.format,
        JSON.stringify(patch.content ?? row.content),
      ],
    );
    return draftFrom(updated.rows[0] as Row);
  });
}

export async function markDocumentDraftCreated(ownerId: string, id: string, fileId: string) {
  return withOwner(ownerId, async (tx) => {
    const updated = await tx.query(
      `update document_drafts set status = 'created', file_id = $2, version = version + 1, updated_at = now()
       where id = $1 and status = 'draft' returning *`,
      [id, fileId],
    );
    if (!updated.rowCount) throw new AppError(409, 'DRAFT_CREATED', 'This draft already became a file');
    return draftFrom(updated.rows[0] as Row);
  });
}
