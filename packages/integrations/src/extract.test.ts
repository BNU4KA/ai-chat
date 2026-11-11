import { expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { extractIsolated } from './extract.ts';
function pdf(text: string) {
  const content = text ? `BT /F1 12 Tf 50 700 Td (${text}) Tj ET` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = out.length;
  out +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
      .join('') +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return strToU8(out);
}
it('extracts real PDF text with page references in a separate process', async () => {
  const result = await extractIsolated(pdf('Synthetic PDF text'), 'test.pdf');
  expect(result.pages[0]?.text).toContain('Synthetic PDF text');
  expect(result.pages[0]?.page).toBe(1);
}, 15000);
it('marks image-only or empty PDFs as no extractable text', async () => {
  await expect(extractIsolated(pdf(''), 'scan.pdf')).rejects.toThrow('NO_EXTRACTABLE_TEXT');
}, 15000);
it('extracts UTF-8 and DOCX while preserving honest section references', async () => {
  const text = await extractIsolated(strToU8('Synthetic Unicode 🌍'), 'notes.md');
  expect(text.pages[0]?.text).toContain('🌍');
  const archive = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(
      '<w:document><w:p><w:r><w:t>Synthetic document &amp; notes</w:t></w:r></w:p></w:document>',
    ),
  });
  const doc = await extractIsolated(archive, 'document.docx');
  expect(doc.pages[0]?.text).toContain('Synthetic document & notes');
  expect(doc.pages[0]?.page).toBeUndefined();
}, 15000);
it('rejects misleading file extensions and XML entity declarations', async () => {
  await expect(extractIsolated(strToU8('Not a PDF'), 'fake.pdf')).rejects.toThrow(
    'FILE_TYPE_MISMATCH',
  );
  const zip = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8('<!DOCTYPE x SYSTEM "file:///etc/passwd"><w:t>Unsafe</w:t>'),
  });
  await expect(extractIsolated(zip, 'unsafe.docx')).rejects.toThrow('UNSUPPORTED_FILE');
}, 15000);
it('rejects ZIP entries exceeding the declared decompression budget before extracting', async () => {
  const zip = Buffer.from(zipSync({ 'word/document.xml': strToU8('text') }));
  const central = zip.indexOf(Buffer.from([80, 75, 1, 2]));
  zip.writeUInt32LE(65 * 1024 * 1024, central + 24);
  await expect(extractIsolated(zip, 'bomb.docx')).rejects.toThrow('EXTRACTED_CONTENT_TOO_LARGE');
}, 15000);

it('decodes photos, bounds their size and strips metadata before model submission', async () => {
  const sharp = (await import('sharp')).default;
  const bytes = await sharp({
    create: { width: 2600, height: 800, channels: 3, background: '#2874a6' },
  })
    .withMetadata()
    .png()
    .toBuffer();
  const result = await extractIsolated(bytes, 'synthetic.png');
  expect(result.mime).toBe('image/png');
  expect(result.image?.width).toBe(2048);
  expect(result.image?.height).toBeLessThan(2048);
  const metadata = await sharp(result.image!.data).metadata();
  expect(metadata.format).toBe('jpeg');
  expect(metadata.exif).toBeUndefined();
}, 15000);
it('rejects corrupt photos and misleading photo extensions', async () => {
  await expect(extractIsolated(strToU8('Not an image'), 'broken.jpg')).rejects.toThrow(
    'IMAGE_INVALID',
  );
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();
  await expect(extractIsolated(png, 'fake.webp')).rejects.toThrow('FILE_TYPE_MISMATCH');
}, 15000);
it('preserves basic Word table boundaries and rejects fake legacy Word documents', async () => {
  const zip = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(
      '<w:document><w:tbl><w:tr><w:tc><w:p><w:t>Item</w:t></w:p></w:tc><w:tc><w:p><w:t>Price</w:t></w:p></w:tc></w:tr></w:tbl></w:document>',
    ),
  });
  const result = await extractIsolated(zip, 'table.docx');
  expect(result.pages[0]?.text).toContain('Item\n\tPrice');
  await expect(extractIsolated(strToU8('not OLE'), 'fake.doc')).rejects.toThrow(
    'FILE_TYPE_MISMATCH',
  );
}, 15000);

it('extracts a real synthetic legacy Word DOC file with Unicode text', async () => {
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(new URL('../fixtures/synthetic.doc', import.meta.url));
  const result = await extractIsolated(bytes, 'synthetic.doc');
  expect(result.mime).toBe('application/msword');
  expect(result.pages[0]?.text).toContain('456 euros');
  expect(result.pages[0]?.text).toContain('Привет мир');
}, 15000);
