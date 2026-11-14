import { z } from 'zod';

export const DOCUMENT_FORMATS = ['docx', 'pdf'] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

export const DOCUMENT_MIME: Record<DocumentFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

const cell = z.string().max(300);

export const documentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), level: z.number().int().min(1).max(3), text: z.string().max(300) }).strict(),
  z.object({ type: z.literal('paragraph'), text: z.string().max(4000) }).strict(),
  z
    .object({
      type: z.literal('list'),
      ordered: z.boolean().default(false),
      items: z.array(z.string().max(1000)).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal('table'),
      header: z.array(cell).min(1).max(10),
      rows: z.array(z.array(cell).max(10)).max(200),
    })
    .strict(),
]);

export const documentContentSchema = z
  .object({ blocks: z.array(documentBlockSchema).min(1).max(300) })
  .strict();

export type DocumentBlock = z.infer<typeof documentBlockSchema>;
export type DocumentContent = z.infer<typeof documentContentSchema>;

export const DOCUMENT_TEXT_LIMIT = 80_000;

// Removes blank text so empty or whitespace-only input is refused before any file is built.
export function normalizeDocumentContent(content: DocumentContent): DocumentContent | null {
  const blocks: DocumentBlock[] = [];
  for (const block of content.blocks) {
    if (block.type === 'heading' || block.type === 'paragraph') {
      const text = block.text.trim();
      if (text) blocks.push({ ...block, text });
    } else if (block.type === 'list') {
      const items = block.items.map((item) => item.trim()).filter(Boolean);
      if (items.length) blocks.push({ ...block, items });
    } else {
      const header = block.header.map((item) => item.trim());
      const rows = block.rows.map((row) => row.map((item) => item.trim()));
      if (header.some(Boolean) || rows.some((row) => row.some(Boolean))) {
        blocks.push({ ...block, header, rows });
      }
    }
  }
  if (!blocks.length) return null;
  const size = blocks.reduce((total, block) => total + JSON.stringify(block).length, 0);
  if (size > DOCUMENT_TEXT_LIMIT) return null;
  return { blocks };
}

export function documentPlainText(blocks: DocumentBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'heading' || block.type === 'paragraph') return block.text;
      if (block.type === 'list') return block.items.join('\n');
      return [block.header.join(' | '), ...block.rows.map((row) => row.join(' | '))].join('\n');
    })
    .join('\n\n');
}
