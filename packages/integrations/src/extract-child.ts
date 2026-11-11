import { unzipSync, strFromU8 } from 'fflate';
import { extractText, getDocumentProxy } from 'unpdf';
import sharp from 'sharp';
import WordExtractor from 'word-extractor';
import { LIMITS } from '@ai-chat/contracts';
export type Extracted = {
  image?: { data: Uint8Array; mime: string; width: number; height: number };
  mime: string;
  pages: { text: string; page?: number; section?: string }[];
};
export async function extractDocument(bytes: Uint8Array, filename: string): Promise<Extracted> {
  if (bytes.byteLength > LIMITS.fileBytes) throw new Error('FILE_TOO_LARGE');
  const ext = filename.toLowerCase().split('.').pop();
  let mime = '';
  let pages: Extracted['pages'] = [];
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext ?? '')) {
    const formats: Record<string, string> = {
      png: 'png',
      jpg: 'jpeg',
      jpeg: 'jpeg',
      webp: 'webp',
      gif: 'gif',
    };
    try {
      const image = sharp(bytes, {
        limitInputPixels: 40_000_000,
        failOn: 'warning',
        animated: false,
      });
      const metadata = await image.metadata();
      if (metadata.format !== formats[ext!]) throw new Error('FILE_TYPE_MISMATCH');
      const result = await image
        .rotate()
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 85 })
        .toBuffer({ resolveWithObject: true });
      return {
        mime: `image/${metadata.format}`,
        pages: [],
        image: {
          data: new Uint8Array(result.data),
          mime: 'image/jpeg',
          width: result.info.width,
          height: result.info.height,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'FILE_TYPE_MISMATCH') throw error;
      throw new Error('IMAGE_INVALID');
    }
  } else if (ext === 'doc') {
    if (Buffer.from(bytes.slice(0, 8)).toString('hex') !== 'd0cf11e0a1b11ae1')
      throw new Error('FILE_TYPE_MISMATCH');
    const doc = await new WordExtractor().extract(Buffer.from(bytes));
    pages = [
      {
        text: [
          doc.getBody(),
          doc.getHeaders(),
          doc.getFootnotes(),
          doc.getEndnotes(),
          doc.getTextboxes(),
        ]
          .filter(Boolean)
          .join('\n'),
        section: 'Document text',
      },
    ];
    mime = 'application/msword';
  } else if (ext === 'pdf') {
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-')
      throw new Error('FILE_TYPE_MISMATCH');
    const doc = await getDocumentProxy(bytes, { disableFontFace: true, useSystemFonts: false });
    try {
      if (doc.numPages > LIMITS.pdfPages) throw new Error('DOCUMENT_TOO_LONG');
      const result = await extractText(doc, { mergePages: false });
      pages = result.text.map((text, index) => ({ text, page: index + 1 }));
    } finally {
      await doc.loadingTask.destroy();
    }
    mime = 'application/pdf';
  } else if (ext === 'docx') {
    if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error('FILE_TYPE_MISMATCH');
    let total = 0;
    const files = unzipSync(bytes, {
      filter: (file) => {
        total += file.originalSize;
        if (total > LIMITS.decompressionBytes) throw new Error('EXTRACTED_CONTENT_TOO_LARGE');
        if (/vbaproject|\.bin$/i.test(file.name)) throw new Error('UNSUPPORTED_FILE');
        return file.name === 'word/document.xml' || file.name === '[Content_Types].xml';
      },
    });
    if (!files['word/document.xml'] || !files['[Content_Types].xml'])
      throw new Error('FILE_TYPE_MISMATCH');
    const xml = strFromU8(files['word/document.xml']);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('UNSUPPORTED_FILE');
    const text = xml
      .replace(/<\/w:tc>/g, '\t')
      .replace(/<\/w:tr>/g, '\n')
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<w:br\b[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
    pages = [{ text, section: 'Document text' }];
    mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else if (ext === 'txt' || ext === 'md') {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error('FILE_TYPE_MISMATCH');
    pages = [{ text, section: 'Document text' }];
    mime = ext === 'md' ? 'text/markdown' : 'text/plain';
  } else throw new Error('UNSUPPORTED_FILE');
  if (pages.reduce((n, p) => n + p.text.length, 0) > LIMITS.extractedChars)
    throw new Error('EXTRACTED_CONTENT_TOO_LARGE');
  if (!pages.some((page) => page.text.trim())) throw new Error('NO_EXTRACTABLE_TEXT');
  return { mime, pages };
}
if (process.env.AI_CHAT_EXTRACT_CHILD === '1') {
  process.once('disconnect', () => process.exit(1));
  process.once('message', async (input: { bytes: Uint8Array; filename: string }) => {
    try {
      process.send!({ ok: true, result: await extractDocument(input.bytes, input.filename) });
    } catch (error) {
      const safe = [
        'FILE_TOO_LARGE',
        'DOCUMENT_TOO_LONG',
        'EXTRACTED_CONTENT_TOO_LARGE',
        'FILE_TYPE_MISMATCH',
        'UNSUPPORTED_FILE',
        'NO_EXTRACTABLE_TEXT',
        'IMAGE_INVALID',
      ];
      const message =
        error instanceof Error && safe.includes(error.message)
          ? error.message
          : 'EXTRACTION_FAILED';
      process.send!({ ok: false, error: message });
    }
  });
}
