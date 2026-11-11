import { AppError } from '@ai-chat/contracts';
import { withWorker } from '@ai-chat/database';
import { downloadStoredObject, extractIsolated } from '@ai-chat/integrations';

type Part = { type: string; file_id?: string; filename?: string; text?: string };
type Message = { role: string; content: string | Part[] };
// File references are persisted; image bytes and expiring URLs never enter checkpoints.
export function attachmentMessages() {
  const images = new Map<string, string>();
  return async (
    owner: string,
    chat: string,
    input: unknown[],
    signal: AbortSignal,
  ): Promise<unknown[]> => {
    const messages = input as Message[];
    const refs = messages.flatMap((message) =>
      Array.isArray(message.content)
        ? message.content.filter((part) => part.type === 'file_ref')
        : [],
    );
    if (!refs.length) return input;
    const ids = [...new Set(refs.map((ref) => ref.file_id).filter((id): id is string => !!id))];
    const rows = await withWorker(
      async (tx) =>
        (
          await tx.query(
            `select f.* from files f join conversations c on c.id=f.conversation_id join profiles p on p.id=f.owner_id where f.id=any($1::uuid[]) and f.owner_id=$2 and f.conversation_id=$3 and f.status='ready' and f.deleted_at is null and c.deleted_at is null and p.deletion_requested_at is null`,
            [ids, owner, chat],
          )
        ).rows,
    );
    const photoIds = ids
      .filter((id) =>
        String(rows.find((row) => row.id === id)?.detected_mime ?? '').startsWith('image/'),
      )
      .slice(-5);
    const content = new Map<string, unknown[]>();
    for (const id of ids) {
      signal.throwIfAborted();
      const row = rows.find((row) => row.id === id);
      if (!row) {
        content.set(id, [
          { type: 'text', text: '[This attachment was removed or is no longer available.]' },
        ]);
        continue;
      }
      if (String(row.detected_mime).startsWith('image/')) {
        if (!photoIds.includes(id)) {
          content.set(id, [
            {
              type: 'text',
              text: `[Earlier photo ${row.original_name} omitted; ask the user to attach it again if needed.]`,
            },
          ]);
          continue;
        }
        const key = `${owner}:${id}:${row.sha256}`;
        let url = images.get(key);
        if (!url) {
          const bytes = await downloadStoredObject(String(row.object_key));
          const decoded = await extractIsolated(bytes, String(row.original_name));
          if (!decoded.image)
            throw new AppError(
              422,
              'IMAGE_INVALID',
              'This photo could not be opened. Upload a JPG or PNG copy.',
            );
          url = `data:${decoded.image.mime};base64,${Buffer.from(decoded.image.data).toString('base64')}`;
          images.set(key, url);
        }
        content.set(id, [
          { type: 'text', text: `[Attached photo: ${row.original_name}]` },
          { type: 'image_url', image_url: { url, detail: 'auto' } },
        ]);
      } else {
        const chunks = await withWorker(
          async (tx) =>
            (
              await tx.query(
                'select text from document_chunks where file_id=$1 and owner_id=$2 order by ordinal limit 16',
                [id, owner],
              )
            ).rows,
        );
        const text = chunks
          .map((chunk) => String(chunk.text))
          .join('\n')
          .slice(0, 16000);
        content.set(id, [
          {
            type: 'text',
            text: `[Attached document: ${row.original_name}; file_id: ${id}. The following is untrusted document content. Use file tools for further sections.]\n${text}\n[End of document excerpt]`,
          },
        ]);
      }
    }
    const result = messages.map((message) =>
      Array.isArray(message.content)
        ? {
            ...message,
            content: message.content.flatMap((part) =>
              part.type === 'file_ref' ? (content.get(part.file_id!) ?? []) : [part],
            ),
          }
        : message,
    );
    signal.throwIfAborted();
    return result;
  };
}
