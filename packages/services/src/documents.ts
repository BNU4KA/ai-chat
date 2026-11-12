import { AppError } from '@ai-chat/contracts';
import { withWorker } from '@ai-chat/database';
import type { ToolPorts } from '@ai-chat/agent-runtime';
/** Both listing and every bounded read recheck the current conversation/project/owner. */
export function projectDocumentPorts(owner: string, chat: string): ToolPorts {
  const scope = `d.owner_id=$1 and c.id=$2 and c.owner_id=$1 and c.project_id=d.project_id and c.deleted_at is null and p.deletion_requested_at is null`;
  return {
    listProjectDocuments: async (offset, limit) =>
      withWorker(async (tx) => {
        const rows = (
          await tx.query(
            `select d.id,d.title,d.version,char_length(d.content) as total_characters from documents d join conversations c on c.project_id=d.project_id join profiles p on p.id=c.owner_id where ${scope} order by d.updated_at desc,d.id limit $3 offset $4`,
            [owner, chat, limit + 1, offset],
          )
        ).rows;
        return {
          ok: true,
          data: {
            documents: rows.slice(0, limit),
            next_offset: rows.length > limit ? offset + limit : null,
          },
        };
      }),
    readProjectDocument: async (input) =>
      withWorker(async (tx) => {
        const d = (
          await tx.query(
            `select d.title,d.version,char_length(d.content) as total_characters,substring(d.content from $4+1 for $5) as text from documents d join conversations c on c.project_id=d.project_id join profiles p on p.id=c.owner_id where ${scope} and d.id=$3`,
            [owner, chat, input.documentId, input.offset, input.limit],
          )
        ).rows[0];
        if (!d) throw new AppError(404, 'NOT_FOUND', 'Project document not found');
        if (input.version !== undefined && Number(d.version) !== input.version)
          throw new AppError(
            409,
            'VERSION_CONFLICT',
            'Document changed. List it again before continuing.',
          );
        const next = input.offset + Array.from(String(d.text)).length;
        return {
          ok: true,
          data: {
            document_id: input.documentId,
            title: d.title,
            version: d.version,
            text: d.text,
            offset: input.offset,
            total_characters: d.total_characters,
            next_offset: next < Number(d.total_characters) ? next : null,
          },
          sources: String(d.text).length
            ? [
                {
                  kind: 'file',
                  document_id: input.documentId,
                  title: String(d.title),
                  section: `Version ${d.version}, characters ${input.offset + 1}–${next}`,
                  excerpt: String(d.text).slice(0, 240),
                },
              ]
            : [],
        };
      }),
  };
}
