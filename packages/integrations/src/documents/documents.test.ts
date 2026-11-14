import { strFromU8, unzipSync } from 'fflate';
import { extractText, getDocumentProxy } from 'unpdf';
import { expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { buildPdf } from './pdf.ts';
import { readDocxStructure, readDocxStructureBytes } from './docx-structure.ts';

const model = {
  title: 'Договор — synthetic',
  blocks: [
    { type: 'heading' as const, level: 1 as const, text: 'Раздел 1' },
    { type: 'paragraph' as const, text: 'Стоимость: 1200 EUR & срок 30 дней.' },
    { type: 'list' as const, ordered: false, items: ['Первый пункт', 'Второй пункт'] },
    { type: 'list' as const, ordered: true, items: ['Шаг один', 'Шаг два'] },
    {
      type: 'table' as const,
      header: ['Позиция', 'Сумма'],
      rows: [
        ['Услуга', '1200'],
        ['Налог', '0'],
      ],
    },
  ],
};

it('builds a Word file whose document contains the requested text and table', async () => {
  const bytes = await buildDocx(model);
  expect(bytes[0]).toBe(0x50);
  const files = unzipSync(bytes);
  const xml = strFromU8(files['word/document.xml']!);
  expect(xml).toContain('Раздел 1');
  expect(xml).toContain('Стоимость: 1200 EUR &amp; срок 30 дней.');
  expect(xml).toContain('<w:tbl>');
  expect(xml).toContain('Услуга');
});

it('builds a PDF with embedded Cyrillic text that can be extracted', async () => {
  const bytes = await buildPdf(model);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  const doc = await getDocumentProxy(bytes, { disableFontFace: true, useSystemFonts: false });
  const { text } = await extractText(doc, { mergePages: true });
  await doc.loadingTask.destroy();
  expect(text).toContain('Раздел 1');
  expect(text).toContain('Второй пункт');
  expect(text).toContain('Услуга');
});

it('splits a long PDF table across pages without losing rows', async () => {
  const rows = Array.from({ length: 120 }, (_, index) => [`row-${index}`, 'value']);
  const bytes = await buildPdf({
    blocks: [{ type: 'table', header: ['Name', 'Value'], rows }],
  });
  const doc = await getDocumentProxy(bytes, { disableFontFace: true, useSystemFonts: false });
  expect(doc.numPages).toBeGreaterThan(1);
  const { text } = await extractText(doc, { mergePages: true });
  await doc.loadingTask.destroy();
  expect(text).toContain('row-0');
  expect(text).toContain('row-119');
});

it('reads back the structure of a generated Word file', async () => {
  const structure = readDocxStructureBytes(await buildDocx(model));
  expect(structure.unsupported).toEqual([]);
  expect(structure.blocks).toEqual([
    { type: 'heading', level: 1, text: 'Договор — synthetic' },
    { type: 'heading', level: 1, text: 'Раздел 1' },
    { type: 'paragraph', text: 'Стоимость: 1200 EUR & срок 30 дней.' },
    { type: 'list', ordered: false, items: ['Первый пункт', 'Второй пункт'] },
    { type: 'list', ordered: true, items: ['Шаг один', 'Шаг два'] },
    {
      type: 'table',
      header: ['Позиция', 'Сумма'],
      rows: [
        ['Услуга', '1200'],
        ['Налог', '0'],
      ],
    },
  ]);
});

it('reports embedded images and text boxes as unsupported instead of dropping them silently', () => {
  const xml =
    '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>' +
    '<w:p><w:r><w:t>Text &amp; more</w:t></w:r><w:r><w:drawing/></w:r></w:p>' +
    '<w:p><w:r><w:pict><w:txbxContent><w:p><w:r><w:t>Box</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></w:p>' +
    '</w:body></w:document>';
  const structure = readDocxStructure(xml);
  expect(structure.blocks).toEqual([{ type: 'paragraph', text: 'Text & more' }]);
  expect(structure.unsupported).toEqual(['embedded images or objects', 'text boxes']);
});
